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
import hashlib
import json
import os
import pathlib
import re
import sqlite3
import statistics as st
import sys

# 参考单价（美元 / 百万 token），默认按 DeepSeek V4.1 Flash
DEFAULT_RATES = {"input": 0.30, "output": 1.20, "cacheRead": 0.006}
# DeepSeek 官方：谷时价为峰时价的一半。峰时 = 周一~周五 01:00-04:00 与 06:00-10:00 UTC
# （不含中国法定节假日）；其余时段（含整个周末）均为谷时。
PEAK_WINDOWS_UTC = ((1, 4), (6, 10))
PEAK_RATES = {"input": 0.30, "output": 1.20, "cacheRead": 0.006}
OFFPEAK_RATES = {k: v / 2 for k, v in PEAK_RATES.items()}

DEFAULT_PRICE_SOURCE = (
    "ClinePass Reference pricing（DeepSeek V4.1 Flash）"
    " — docs.cline.bot/getting-started/clinepass"
)


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
    session: dict = {}
    prompts: list[dict] = []
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
            session = dict(sess)
            snap = pl.get("snapshot") or {}
            session["_lineage"] = snap.get("lineage")
            session["_status"] = snap.get("status")
            session["_prompt"] = snap.get("prompt") or sess.get("prompt")
            session_meta.update(meta)
            cur_run = None
        elif event == "session.pending_prompt_submitted":
            pr = pl.get("prompt", {})
            prompts.append({
                "ts": ts,
                "id": pr.get("id"),
                "text": pr.get("prompt", ""),
                "attachments": pr.get("attachmentCount", 0),
                "delivery": pr.get("delivery"),
            })
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
    return runs, iters, session_meta, session, prompts


def fmt(n, nd=0):
    return f"{n:,.{nd}f}"


def cost_of(uncached, cache_read, out_all, rates):
    return (uncached / 1e6 * rates["input"] + cache_read / 1e6 * rates["cacheRead"]
            + out_all / 1e6 * rates["output"])


def analyze(runs, iters, rates):
    usages = [it["usage"] for it in iters if it.get("usage")]
    tot = {k: sum(u.get(k, 0) for u in usages) for k in KEYS}
    tot["totalCost"] = sum(u.get("totalCost", 0) for u in usages)
    tot["calls"] = len(usages)
    tot["zeroCostCalls"] = sum(1 for u in usages if u.get("totalCost", 0) == 0)

    uncached = tot["inputTokens"] - tot["cacheReadTokens"] - tot["cacheWriteTokens"]
    out_all = tot["outputTokens"] + tot["reasoningTokenCount"]

    # 按调用时刻自动判定峰/谷
    cost_auto = 0.0
    peak_calls = off_calls = 0
    for it in iters:
        u = it.get("usage")
        if not u:
            continue
        peak = is_peak(it.get("usage_ts") or it.get("start") or 0)
        peak_calls += 1 if peak else 0
        off_calls += 0 if peak else 1
        r = PEAK_RATES if peak else OFFPEAK_RATES
        u_unc = u.get("inputTokens", 0) - u.get("cacheReadTokens", 0) - u.get("cacheWriteTokens", 0)
        u_out = u.get("outputTokens", 0) + u.get("reasoningTokenCount", 0)
        cost_auto += cost_of(u_unc, u.get("cacheReadTokens", 0), u_out, r)

    cost_peak = cost_of(uncached, tot["cacheReadTokens"], out_all, PEAK_RATES)
    cost_off = cost_of(uncached, tot["cacheReadTokens"], out_all, OFFPEAK_RATES)
    naive_peak = (tot["inputTokens"] / 1e6 * PEAK_RATES["input"]
                  + out_all / 1e6 * PEAK_RATES["output"])

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
        rs = [it for it in run["iters"] if it.get("usage")]
        if not rs:
            continue
        i = sum(it["usage"].get("inputTokens", 0) for it in rs)
        cr = sum(it["usage"].get("cacheReadTokens", 0) for it in rs)
        o = sum(it["usage"].get("outputTokens", 0) + it["usage"].get("reasoningTokenCount", 0)
                for it in rs)
        c = sum(it["usage"].get("totalCost", 0) for it in rs)
        pk = sum(1 for it in rs if is_peak(it.get("usage_ts") or it.get("start") or 0))
        tier = "峰时" if pk == len(rs) else ("谷时" if pk == 0 else f"混合({pk}/{len(rs)}峰)")
        run_rows.append({"n": n, "calls": len(rs), "input": i, "cacheRead": cr,
                         "out": o, "cost": c, "duration": (run.get("durationMs") or 0) / 1000,
                         "start": run.get("start", 0), "tier": tier,
                         "cost_auto": sum(
                             cost_of(it["usage"].get("inputTokens", 0)
                                     - it["usage"].get("cacheReadTokens", 0),
                                     it["usage"].get("cacheReadTokens", 0),
                                     it["usage"].get("outputTokens", 0)
                                     + it["usage"].get("reasoningTokenCount", 0),
                                     PEAK_RATES if is_peak(it.get("usage_ts") or it.get("start") or 0)
                                     else OFFPEAK_RATES)
                             for it in rs)})

    return {"tot": tot, "uncached": uncached, "out_all": out_all,
            "cost_in": cost_of(uncached, tot["cacheReadTokens"], 0, rates),
            "cost_out": out_all / 1e6 * rates["output"],
            "naive": naive_peak, "lat": lat, "runs": run_rows,
            "cost_peak": cost_peak, "cost_off": cost_off, "cost_auto": cost_auto,
            "peak_calls": peak_calls, "off_calls": off_calls}



def med(values, nd=2):
    vals = [v for v in values if v is not None]
    return st.median(vals) if vals else float("nan")


def mean(values):
    vals = [v for v in values if v is not None]
    return st.fmean(vals) if vals else float("nan")


def load_session_file(db_path: pathlib.Path, session_id: str) -> dict:
    """读会话 JSON（初始 prompt、标题、team 等只在文件里有）。"""
    if not session_id:
        return {}
    cand = [
        db_path.parent.parent / "sessions" / session_id / f"{session_id}.json",
        pathlib.Path.home() / ".cline" / "data" / "sessions" / session_id / f"{session_id}.json",
    ]
    for path in cand:
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return {}
    return {}


def load_session_row(db_path: pathlib.Path) -> dict:
    """从同目录的 sessions.db 读会话行（conversation_id / team / 结束时间等）。"""
    path = db_path.parent / "sessions.db"
    if not path.exists():
        return {}
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        cols = [d[1] for d in con.execute("PRAGMA table_info(sessions)")]
        row = con.execute("select * from sessions order by rowid desc limit 1").fetchone()
        return dict(zip(cols, row)) if row else {}
    except Exception:
        return {}


def is_peak(ts_ms: int) -> bool:
    """按 DeepSeek 规则判断某个时刻是否处于峰时（UTC）。"""
    if not ts_ms:
        return False
    t = dt.datetime.fromtimestamp(ts_ms / 1000, dt.UTC)
    if t.weekday() >= 5:  # 周六 / 周日 全谷时
        return False
    hour = t.hour + t.minute / 60
    return any(lo <= hour < hi for lo, hi in PEAK_WINDOWS_UTC)


def hhmmss(ms) -> str:
    if not ms:
        return "-"
    return dt.datetime.fromtimestamp(ms / 1000, dt.UTC).strftime("%Y-%m-%d %H:%M:%S UTC")


def render_meta_sections(session, meta, prompts, rates, price_source, a, span, row):
    """会话参数 / 价格口径 / 对话轮次 三段。"""
    m = dict(session.get("metadata", {}) or {})
    sysp = str(m.pop("systemPrompt", "") or "")
    git = m.get("git") or {}
    t = a["tot"]
    out = ["## 会话参数", "", "| 项 | 值 |", "|---|---|"]
    rows = [
        ("会话 ID", f"`{meta.get('sessionId', '?')}`"),
        ("会话标题", (session.get("_title") or "-")[:60]),
        ("模型", f"`{meta.get('model', '?')}`"),
        ("Provider", f"`{meta.get('provider', '?')}`"),
        ("来源", f"`{meta.get('source', '?')}`"),
        ("模式", f"`{m.get('mode', '?')}`"),
        ("思考", f"thinking=`{m.get('thinking')}` ｜ reasoningEffort=`{m.get('reasoningEffort')}` "
                 f"｜ thinkingBudgetTokens=`{m.get('thinkingBudgetTokens')}`"),
        ("交互 / 自动批准", f"interactive=`{m.get('interactive')}` ｜ "
                          f"autoApproveTools=`{m.get('autoApproveTools')}`"),
        ("能力开关", f"tools=`{session.get('runtimeOptions', {}).get('enableTools')}` ｜ "
                    f"spawn=`{session.get('runtimeOptions', {}).get('enableSpawn')}` ｜ "
                    f"teams=`{session.get('runtimeOptions', {}).get('enableTeams')}`"),
        ("工作区", f"`{session.get('workspaceRoot', '?')}`（cwd `{session.get('cwd', '?')}`）"),
        ("代码库", f"{git.get('url', '?')} @ `{git.get('branch', '?')}`"),
        ("子代理", f""
                       f"isSubagent=`{(session.get('_lineage') or session.get('lineage') or {}).get('isSubagent', m.get('isSubagent', '?'))}`"),
        ("会话状态", f"`{session.get('_status') or row.get('status') or '?'}`"),
        ("conversation_id", f"`{row.get('conversation_id') or '-'}`"),
        ("team", f"`{row.get('team_name') or session.get('teamName') or '-'}`"),
        ("会话开始", hhmmss(span[0])),
        ("最后事件", hhmmss(span[1])),
        ("时长", f"{(span[1] - span[0]) / 60000:.1f} 分钟"),
        ("系统提示", f"{len(sysp):,} 字符 ｜ sha256=`{hashlib.sha256(sysp.encode()).hexdigest()[:12]}`"),
        ("沙箱", f"`{os.uname().nodename}` ｜ pid `{session.get('_pid') or os.getpid()}` "
                 f"｜ Python `{sys.version.split()[0]}`"),
        ("用户消息数", f"{len(prompts)} 条（下面按轮次展开）"),
    ]
    out += [f"| {k} | {v} |" for k, v in rows]

    tier = ("峰时 PEAK" if a["off_calls"] == 0 else
            ("谷时 OFF-PEAK" if a["peak_calls"] == 0 else "跨峰谷混合"))
    out += ["", "## 价格口径（含峰谷价）", "",
            "DeepSeek 官方对同一模型给**峰时/谷时两档价**，**谷时价 = 峰时价的一半**；",
            "Cline 的 ClinePass 参考价表里，DeepSeek V4.1 Flash 只列了**峰时价**一档",
            "（V4 Pro 则明确列了 Peak / Off-peak 两行）。",
            "",
            "| 档位 | 输入（未命中缓存） | 输入（命中缓存） | 输出 | 缓存写入 |",
            "|---|---:|---:|---:|---:|",
            f"| 峰时 PEAK | ${PEAK_RATES['input']} | ${PEAK_RATES['cacheRead']} | "
            f"${PEAK_RATES['output']} | $0 |",
            f"| 谷时 OFF-PEAK | ${OFFPEAK_RATES['input']} | ${OFFPEAK_RATES['cacheRead']} | "
            f"${OFFPEAK_RATES['output']} | $0 |",
            "",
            "**峰时判定规则**（UTC）：周一~周五 `01:00–04:00` 与 `06:00–10:00` 为峰时；",
            "其余时段（含**整个周末**和中国法定节假日）均为谷时。",
            "（中国节假日无法离线判定，脚本按「非周末即按上表峰段」近似。）",
            "",
            "| 本会话计费情况 | 值 |",
            "|---|---:|",
            f"| 所处时段 | **{tier}** |",
            f"| 峰时调用 / 谷时调用 | {a['peak_calls']} / {a['off_calls']} |",
            f"| 按峰时价计 | ${a['cost_peak']:.4f} |",
            f"| 按谷时价计 | ${a['cost_off']:.4f} |",
            f"| **按时段自动计（推荐）** | **${a['cost_auto']:.4f}** |",
            f"| 运行时计数器（provider 上报） | ${t['totalCost']:.4f} |",
            "",
            f"价格来源：{price_source} ｜ 抓取时间：{dt.datetime.now(dt.UTC).strftime('%Y-%m-%d')}"]

    out += ["", "## 对话轮次", "",
            "| # | 时间 | 你的消息 | 调用 | 输入 | 输出 | 成本 | 墙钟(秒) |",
            "|---:|---|---|---:|---:|---:|---:|---:|"]
    # prompt → run 的配对：消息可能排队，这里用"最早一个开始时间 ≥ 消息时间"的 run 做近似
    runs_sorted = sorted(a["runs"], key=lambda r: r.get("start", 0))
    assigned: dict[int, dict] = {}
    pool = list(runs_sorted)
    for pr in prompts:
        target = None
        for cand in pool:
            if cand.get("start", 0) >= pr["ts"]:
                target = cand
                break
        if target is None:
            continue
        pool.remove(target)
        assigned[id(target)] = pr

    initial = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(session.get("_prompt") or ""))).strip()
    for r in a["runs"]:
        pr = assigned.get(id(r))
        if pr is not None:
            text = pr["text"].replace("\n", " ")[:48] + "…"
        elif initial and r is runs_sorted[0]:
            text = initial[:48] + "…"
        else:
            text = "（无新消息 / 续跑）"
        when = dt.datetime.fromtimestamp(r.get("start", 0) / 1000, dt.UTC).strftime("%H:%M:%S")
        out.append(f"| {r['n']} | {when} | {text} | {r['calls']} | {fmt(r['input'])} | "
                   f"{fmt(r['out'])} | ${r['cost']:.4f} | {r['duration']:.1f} |")

    out += ["", "<sub>注：用户消息可能排队（在你上一条还在执行时发出），"
              "因此消息与 run 的配对是按时间就近推断的**近似值**；"
              "token/成本数据则精确对应各自的 run。</sub>"]


    if prompts:
        out += ["", "<details><summary>原始 prompt 记录（含 id / 投递方式 / 附件数）</summary>", ""]
        out += ["| 时间 | id | delivery | 附件 | 文本 |", "|---|---|---|---:|---|"]
        for pr in prompts:
            text = pr["text"].replace("\n", " ")[:60].replace("|", "\\|")
            out.append(f"| {hhmmss(pr['ts'])[11:19]} | `{pr['id']}` | {pr['delivery']} | "
                       f"{pr['attachments']} | {text} |")
        out += ["", "</details>"]
    return out


def render_md(a, meta, rates, db_path, now, session, prompts, price_source, span, row):
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
        "",
    ]
    L += render_meta_sections(session, meta, prompts, rates, price_source, a, span, row)
    L += [
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
    ap.add_argument("--price-source", default=DEFAULT_PRICE_SOURCE, help="价格来源说明")
    args = ap.parse_args()

    rates = {"input": args.price_in, "output": args.price_out, "cacheRead": args.price_cache}
    db_path = find_db(args.db)
    events = load_events(db_path)
    runs, iters, meta, session, prompts = collect(events)
    a = analyze(runs, iters, rates)
    row = load_session_row(db_path)
    sfile = load_session_file(db_path, str(meta.get("sessionId") or ""))
    if sfile:
        session["_prompt"] = sfile.get("prompt")
        session["_title"] = (sfile.get("metadata") or {}).get("title")
        session.setdefault("teamName", sfile.get("team_name"))
        session["_pid"] = sfile.get("pid")
        session["_fileStartedAt"] = sfile.get("started_at")
    if row:
        session.setdefault("teamName", row.get("team_name"))
        session.setdefault("conversationId", row.get("conversation_id"))

    started = None
    for _, event, ts, _pl in events:
        if event == "session.created":
            started = ts
            break
    span = (started or events[0][2], events[-1][2])
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
    tier = "峰时" if a["off_calls"] == 0 else ("谷时" if a["peak_calls"] == 0 else "跨峰谷")
    print(f"时段      : {tier}（峰 {a['peak_calls']} / 谷 {a['off_calls']} 次调用）")
    print(f"成本      : 按时段自动 ${a['cost_auto']:.4f} ｜ 全按峰时 ${a['cost_peak']:.4f} "
          f"｜ 全按谷时 ${a['cost_off']:.4f} ｜ 计数器 ${t['totalCost']:.4f}")
    print(f"延迟      : TTFT 中位 {med([r['ttft'] for r in a['lat']]):.2f}s ｜ "
          f"TPS 中位 {med([r['tps'] for r in a['lat']], 1):.1f} tok/s")

    if args.write:
        out_dir = pathlib.Path(args.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        md_path = out_dir / f"{tag}-{sid}.md"
        md_path.write_text(
            render_md(a, meta, rates, db_path, now, session, prompts, args.price_source, span, row),
            encoding="utf-8",
        )
        json_path = out_dir / f"{tag}-{sid}.json"
        json_path.write_text(json.dumps({
            "sessionId": sid, "model": meta.get("model"), "provider": meta.get("provider"),
            "generatedAt": now, "rates": rates, "priceSource": args.price_source,
            "pricingTiers": {
                "rule": "peak = Mon-Fri 01:00-04:00 & 06:00-10:00 UTC; off-peak = half price, all other times incl. weekends",
                "peak": PEAK_RATES, "offPeak": OFFPEAK_RATES,
                "peakCalls": a["peak_calls"], "offPeakCalls": a["off_calls"],
                "costPeak": round(a["cost_peak"], 6), "costOffPeak": round(a["cost_off"], 6),
                "costAuto": round(a["cost_auto"], 6),
            },
            "sessionStart": span[0], "sessionEnd": span[1],
            "durationMinutes": round((span[1] - span[0]) / 60000, 2),
            "sessionParams": {
                "mode": (session.get("metadata") or {}).get("mode"),
                "thinking": (session.get("metadata") or {}).get("thinking"),
                "reasoningEffort": (session.get("metadata") or {}).get("reasoningEffort"),
                "thinkingBudgetTokens": (session.get("metadata") or {}).get("thinkingBudgetTokens"),
                "interactive": (session.get("metadata") or {}).get("interactive"),
                "autoApproveTools": (session.get("metadata") or {}).get("autoApproveTools"),
                "source": (session.get("metadata") or {}).get("source"),
                "git": (session.get("metadata") or {}).get("git"),
                "workspaceRoot": session.get("workspaceRoot"),
                "cwd": session.get("cwd"),
                "teamName": session.get("teamName"),
                "lineage": session.get("lineage"),
                "runtimeOptions": {k: v for k, v in (session.get("runtimeOptions") or {}).items() if k != "systemPrompt"},
                "systemPromptChars": len(str((session.get("metadata") or {}).get("systemPrompt") or "")),
                "systemPromptSha256": hashlib.sha256(str((session.get("metadata") or {}).get("systemPrompt") or "").encode()).hexdigest()[:12],
            },
            "prompts": [{"ts": pr["ts"], "id": pr["id"], "delivery": pr["delivery"],
                         "attachments": pr["attachments"], "text": pr["text"][:200]} for pr in prompts],
            "totals": t,
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
