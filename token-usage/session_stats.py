#!/usr/bin/env python3
"""从 Cline hub 事件库生成会话 token 用量报告。

用法：
    python3 token-usage/session_stats.py                 # 自动找库，打印摘要
    python3 token-usage/session_stats.py --write         # 同时写出 markdown 报告
    python3 token-usage/session_stats.py --db <path> --write

只依赖标准库。数据源是会话沙箱里的 hub 事件库：
    ~/.cline/data/db/hub-events-*.db   （或 $CLINE_HOME/data/db/...）
每张表里的 usage.updated 事件带 token 与成本；TTFT / TPS 由流式 delta 的时间戳反推。
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import pathlib
import sqlite3
import statistics as st
import sys

# 参考单价（美元 / 百万 token），默认按 DeepSeek V4.1 Flash
DEFAULT_RATES = {"input": 0.30, "output": 1.20, "cacheRead": 0.006}


def find_db(explicit: str | None = None) -> pathlib.Path:
    if explicit:
        return pathlib.Path(explicit)
    roots = [
        os.environ.get("CLINE_HOME"),
        str(pathlib.Path.home() / ".cline"),
        "/workspace/.cline-home",
    ]
    cands: list[str] = []
    for root in roots:
        if root:
            cands += glob.glob(f"{root}/data/db/hub-events-*.db")
    cands = [c for c in cands if not c.endswith(("-wal", "-shm"))]
    if not cands:
        raise SystemExit("找不到 hub 事件库；用 --db 指定路径")
    return pathlib.Path(max(cands, key=lambda p: os.path.getsize(p)))


def load_events(db: pathlib.Path):
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    rows = []
    for seq, event, env in con.execute(
        "select sequence, event, envelope_json from hub_events order by sequence"
    ):
        try:
            payload = json.loads(env)
        except Exception:
            continue
        rows.append((seq, event, payload.get("timestamp", 0), payload.get("payload", {})))
    return rows

KEYS = ("inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokenCount")


def collect(events):
    """把事件流切成 run / iteration 两层，返回 (runs, iterations, session_meta)。"""
    runs: list[dict] = []
    iters: list[dict] = []
    session_meta: dict = {}
    cur_run = None
    cur_it = None

    def close_it():
        nonlocal cur_it
        if cur_it is not None and cur_run is not None:
            cur_run["iters"].append(cur_it)
        cur_it = None

    def close_run():
        nonlocal cur_run
        close_it()
        if cur_run is not None:
            runs.append(cur_run)
        cur_run = None

    for seq, event, ts, pl in events:
        if event == "session.created":
            sess = pl.get("session", {})
            meta = dict(sess.get("metadata", {}))
            meta["sessionId"] = sess.get("sessionId")
            meta.setdefault("provider", "?")
            meta.setdefault("model", "?")
            meta.setdefault("source", "?")
            session_meta.update(meta)
            cur_run = None
        elif event == "run.started":
            close_run()
            cur_run = {"start": ts, "iters": [], "durationMs": None, "finishReason": None, "sessionId": None}
        elif event == "iteration.started":
            close_it()
            if cur_run is None:
                cur_run = {"start": ts, "iters": [], "durationMs": None, "finishReason": None, "sessionId": None}
            cur_it = {"start": ts, "first": None, "last": None, "a_first": None,
                      "usage_ts": None, "usage": None, "finish": None}
        elif cur_it is not None and event in ("reasoning.delta", "assistant.delta"):
            if cur_it["first"] is None:
                cur_it["first"] = ts
            cur_it["last"] = ts
            if event == "assistant.delta" and cur_it["a_first"] is None:
                cur_it["a_first"] = ts
        elif cur_it is not None and event == "usage.updated":
            cur_it["usage"] = pl.get("delta", {})
            cur_it["usage_ts"] = ts
        elif cur_it is not None and event == "iteration.finished":
            # 不在这里 close：usage.updated 有时晚于 iteration.finished 到达
            cur_it["finish"] = ts
        elif event == "run.completed":
            if cur_run is None:
                cur_run = {"start": ts, "iters": [], "durationMs": None, "finishReason": None, "sessionId": None}
            res = pl.get("result", {})
            cur_run["durationMs"] = res.get("durationMs")
            cur_run["finishReason"] = res.get("finishReason")
            close_run()
    close_run()

    for run in runs:
        for it in run.get("iters", []):
            iters.append(it)
    return runs, iters, session_meta


def fmt(n, nd=0):
    return f"{n:,.{nd}f}"


def analyze(runs, iters, rates):
    usages = [it["usage"] for it in iters if it.get("usage")]
    tot = {k: sum(u.get(k, 0) for u in usages) for k in KEYS}
    tot["totalCost"] = sum(u.get("totalCost", 0) for u in usages)
    tot["calls"] = len(usages)
    tot["zeroCostCalls"] = sum(1 for u in usages if u.get("totalCost", 0) == 0)

    uncached = tot["inputTokens"] - tot["cacheReadTokens"] - tot["cacheWriteTokens"]
    out_all = tot["outputTokens"] + tot["reasoningTokenCount"]
    cost_in = uncached / 1e6 * rates["input"] + tot["cacheReadTokens"] / 1e6 * rates["cacheRead"]
    cost_out = out_all / 1e6 * rates["output"]
    naive = tot["inputTokens"] / 1e6 * rates["input"] + out_all / 1e6 * rates["output"]

    lat = []
    for it in iters:
        u = it.get("usage")
        if not u or it["first"] is None:
            continue
        end = it["usage_ts"] or it["last"]
        span = (end - it["first"]) / 1000
        out = u.get("outputTokens", 0) + u.get("reasoningTokenCount", 0)
        lat.append({
            "ttft": (it["first"] - it["start"]) / 1000,
            "ans_ttft": (it["a_first"] - it["start"]) / 1000 if it["a_first"] else None,
            "stream": span,
            "iter_s": ((it["finish"] or end) - it["start"]) / 1000,
            "out": u.get("outputTokens", 0),
            "reason": u.get("reasoningTokenCount", 0),
            "tps": out / span if span >= 0.5 else None,
        })

    run_rows = []
    for n, run in enumerate(runs, 1):
        rs = [it["usage"] for it in run["iters"] if it.get("usage")]
        if not rs:
            continue
        i = sum(u.get("inputTokens", 0) for u in rs)
        cr = sum(u.get("cacheReadTokens", 0) for u in rs)
        o = sum(u.get("outputTokens", 0) + u.get("reasoningTokenCount", 0) for u in rs)
        c = sum(u.get("totalCost", 0) for u in rs)
        run_rows.append({"n": n, "calls": len(rs), "input": i, "cacheRead": cr,
                         "out": o, "cost": c, "duration": (run.get("durationMs") or 0) / 1000})

    return {"tot": tot, "uncached": uncached, "out_all": out_all, "cost_in": cost_in,
            "cost_out": cost_out, "naive": naive, "lat": lat, "runs": run_rows}


def med(values, nd=2):
    vals = [v for v in values if v is not None]
    return st.median(vals) if vals else float("nan")


def mean(values):
    vals = [v for v in values if v is not None]
    return st.fmean(vals) if vals else float("nan")


def render_md(a, meta, rates, db_path, now):
    t = a["tot"]
    lat = a["lat"]
    hit = t["cacheReadTokens"] / t["inputTokens"] * 100 if t["inputTokens"] else 0
    saved = a["naive"] - (a["cost_in"] + a["cost_out"])
    L = [
        f"# Token 用量报告 · `{meta.get('sessionId', 'unknown')}`",
        "",
        f"> 生成时间：{now} ｜ 数据源：`{db_path.name}`",
        f"> 模型：`{meta.get('model', '?')}` ｜ provider：`{meta.get('provider', '?')}` "
        f"｜ source：`{meta.get('source', '?')}`",
        f"> 参考单价：输入 ${rates['input']}/Mtok、输出 ${rates['output']}/Mtok、"
        f"缓存读 ${rates['cacheRead']}/Mtok",
        "",
        "## 总量",
        "",
        "| 指标 | 数值 |",
        "|---|---:|",
        f"| LLM 调用次数 | {fmt(t['calls'])} |",
        f"| 输入 token（含缓存） | {fmt(t['inputTokens'])} |",
        f"| ├ 缓存读取 | {fmt(t['cacheReadTokens'])} |",
        f"| ├ 缓存写入 | {fmt(t['cacheWriteTokens'])} |",
        f"| └ 未缓存 | {fmt(a['uncached'])} |",
        f"| 输出 token | {fmt(t['outputTokens'])} |",
        f"| reasoning token | {fmt(t['reasoningTokenCount'])} |",
        f"| 输出合计（含 reasoning） | {fmt(a['out_all'])} |",
        f"| 总 token | {fmt(t['inputTokens'] + a['out_all'])} |",
        f"| 成本（运行时计数器累计） | ${t['totalCost']:.4f} |",
        "",
        "## 缓存命中率",
        "",
        "```",
        f"整体命中率  cacheRead / inputTokens = {hit:.2f}%",
        "```",
        "",
        "## 成本结构",
        "",
        "| 项 | 金额 | 占比 |",
        "|---|---:|---:|",
        f"| 未缓存输入 | ${a['uncached'] / 1e6 * rates['input']:.4f} | "
        f"{a['uncached'] / 1e6 * rates['input'] / (a['cost_in'] + a['cost_out']) * 100:.1f}% |",
        f"| 缓存读取 | ${t['cacheReadTokens'] / 1e6 * rates['cacheRead']:.4f} | "
        f"{t['cacheReadTokens'] / 1e6 * rates['cacheRead'] / (a['cost_in'] + a['cost_out']) * 100:.1f}% |",
        f"| 输出（含 reasoning） | ${a['cost_out']:.4f} | "
        f"{a['cost_out'] / (a['cost_in'] + a['cost_out']) * 100:.1f}% |",
        f"| **合计** | **${a['cost_in'] + a['cost_out']:.4f}** | 100% |",
        "",
        "```",
        f"若全部按未缓存计价：${a['naive']:.4f}",
        f"实际（含缓存计价）  ：${a['cost_in'] + a['cost_out']:.4f}",
        f"→ 缓存省下 ${saved:.4f}（{saved / a['naive'] * 100:.1f}%）",
        "```",
        "",
        "## 延迟与吞吐（由流式事件时间戳反推）",
        "",
        "| 指标 | 中位 | 均值 | 最小 | 最大 | n |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for key, label, nd in (("ttft", "TTFT → 首个 token", 2), ("ans_ttft", "TTFT → 首个正文 token", 2),
                           ("stream", "流式时长", 2), ("iter_s", "整迭代耗时（含工具）", 2),
                           ("tps", "TPS（正文+reasoning）", 1)):
        vals = [r[key] for r in lat if r[key] is not None]
        if not vals:
            continue
        L.append(f"| {label} | {st.median(vals):.{nd}f} | {st.fmean(vals):.{nd}f} | "
                 f"{min(vals):.{nd}f} | {max(vals):.{nd}f} | {len(vals)} |")
    L += ["", "## 按 run 拆分", "",
          "| # | 调用 | 输入 | 缓存读 | 命中率 | 输出 | 成本 | 墙钟(秒) |",
          "|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for r in a["runs"]:
        hr = r["cacheRead"] / r["input"] * 100 if r["input"] else 0
        L.append(f"| {r['n']} | {r['calls']} | {fmt(r['input'])} | {fmt(r['cacheRead'])} | "
                 f"{hr:.1f}% | {fmt(r['out'])} | ${r['cost']:.4f} | {r['duration']:.1f} |")
    L += ["", "---", "", "## 口径与局限", "",
          "- token / 成本来自 `usage.updated` 事件；TTFT 与 TPS 由 `reasoning.delta` / "
          "`assistant.delta` 的**事件时间戳**反推，不是服务端上报值。",
          "- 时间戳记录的是 SDK 发出事件的时刻，存在缓冲/背压时 TPS 会有偏差。",
          f"- TPS 分母为「首个 delta → usage 事件」，且只统计流式 ≥0.5s 的样本；"
          f"本次可计算 {len(lat)} 个 iteration。",
          "- 成本是**运行时计数器**，不一定是真实账单；请以 Cline dashboard 的 View Usage 为准。",
          f"- 本次有 {t['zeroCostCalls']} 次调用未带回成本信息（totalCost=0）。",
          ""]
    return "\n".join(L)


def main() -> None:
    ap = argparse.ArgumentParser(description="生成 Cline 会话 token 用量报告")
    ap.add_argument("--db", help="hub 事件库路径（默认自动查找）")
    ap.add_argument("--write", action="store_true", help="写出 markdown + json 报告")
    ap.add_argument("--out-dir", default="token-usage", help="报告输出目录（默认 token-usage/）")
    ap.add_argument("--tag", help="文件名里的标签，默认取会话开始日期")
    ap.add_argument("--price-in", type=float, default=DEFAULT_RATES["input"])
    ap.add_argument("--price-out", type=float, default=DEFAULT_RATES["output"])
    ap.add_argument("--price-cache", type=float, default=DEFAULT_RATES["cacheRead"])
    args = ap.parse_args()

    rates = {"input": args.price_in, "output": args.price_out, "cacheRead": args.price_cache}
    db_path = find_db(args.db)
    events = load_events(db_path)
    runs, iters, meta = collect(events)
    a = analyze(runs, iters, rates)

    started = None
    for _, event, ts, _pl in events:
        if event == "session.created":
            started = ts
            break
    day = dt.datetime.fromtimestamp((started or events[0][2]) / 1000, dt.UTC).strftime("%Y-%m-%d")
    now = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d %H:%M UTC")
    sid = str(meta.get("sessionId") or "session")
    tag = args.tag or day

    t = a["tot"]
    hit = t["cacheReadTokens"] / t["inputTokens"] * 100 if t["inputTokens"] else 0
    print(f"库文件    : {db_path}")
    print(f"会话      : {sid}  ({meta.get('model', '?')})")
    print(f"调用      : {t['calls']} 次")
    print(f"输入/输出 : {fmt(t['inputTokens'])} / {fmt(a['out_all'])} tok")
    print(f"缓存命中  : {hit:.2f}%  (cacheRead {fmt(t['cacheReadTokens'])})")
    print(f"成本      : 计数器 ${t['totalCost']:.4f} ｜ 按单价算 ${a['cost_in'] + a['cost_out']:.4f}")
    print(f"延迟      : TTFT 中位 {med([r['ttft'] for r in a['lat']]):.2f}s ｜ "
          f"TPS 中位 {med([r['tps'] for r in a['lat']], 1):.1f} tok/s")

    if args.write:
        out_dir = pathlib.Path(args.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        md_path = out_dir / f"{tag}-{sid}.md"
        md_path.write_text(render_md(a, meta, rates, db_path, now), encoding="utf-8")
        json_path = out_dir / f"{tag}-{sid}.json"
        json_path.write_text(json.dumps({
            "sessionId": sid, "model": meta.get("model"), "provider": meta.get("provider"),
            "generatedAt": now, "rates": rates, "totals": t,
            "uncachedInputTokens": a["uncached"], "outputPlusReasoning": a["out_all"],
            "cacheHitRate": round(hit, 4),
            "costByTokens": {"input": round(a["cost_in"], 6), "output": round(a["cost_out"], 6),
                             "naiveNoCache": round(a["naive"], 6)},
            "latency": {
                "ttftMedian": round(med([r["ttft"] for r in a["lat"]]), 3),
                "tpsMedian": round(med([r["tps"] for r in a["lat"]], 1), 2),
                "samples": len(a["lat"]),
            },
            "runs": a["runs"],
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\n✅ 报告 → {md_path}")
        print(f"✅ 数据 → {json_path}")


if __name__ == "__main__":
    main()
