#!/usr/bin/env node
/**
 * 查看当前会话的 prompt cache（缓存）命中率。
 *
 * 数据来源：~/.cline-home 下最新的 hub-events SQLite 库里的 `usage.updated` 事件。
 * 每条事件带 delta（本次请求）/ totals（本轮）/ aggregateUsage（本会话累计）三层计数。
 *
 * 用法：
 *   node scripts/cache-stats.mjs            # 人读报告
 *   node scripts/cache-stats.mjs --json     # 机器可读
 *   node scripts/cache-stats.mjs --watch    # 每 5 秒刷新
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CANDIDATE_DIRS = [
  process.env.CLINE_HOME && path.join(process.env.CLINE_HOME, 'data', 'db'),
  '/workspace/.cline-home/data/db',
  path.join(homedir(), '.cline-home/data/db'),
].filter(Boolean);

function findEventsDb() {
  for (const dir of CANDIDATE_DIRS) {
    let files;
    try { files = readdirSync(dir); } catch { continue; }
    const cands = files
      .filter((f) => f.startsWith('hub-events-') && f.endsWith('.db'))
      .map((f) => path.join(dir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (cands.length) return cands[0];
  }
  throw new Error('找不到 hub-events 数据库，请设置 CLINE_HOME');
}

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);

function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

function bar(ratio, width = 24) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function collect() {
  const dbPath = findEventsDb();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db.prepare(`SELECT envelope_json, created_at FROM hub_events
                           WHERE json_extract(envelope_json,'$.event') = 'usage.updated'
                           ORDER BY sequence`).all();
  db.close();

  const series = rows.map((r) => {
    const p = JSON.parse(r.envelope_json).payload;
    return {
      t: r.created_at,
      delta: p.delta || {},
      totals: p.totals || {},
      agg: p.aggregateUsage || p.usage || {},
      agent: p.agent || {},
    };
  });
  if (!series.length) throw new Error('该库中还没有 usage.updated 事件');

  const sum = (fn) => series.reduce((a, s) => a + num(fn(s)), 0);
  const totalIn = sum((s) => s.delta.inputTokens);
  const totalCacheRead = sum((s) => s.delta.cacheReadTokens);
  const totalCacheWrite = sum((s) => s.delta.cacheWriteTokens);
  const totalOut = sum((s) => s.delta.outputTokens);
  const last = series[series.length - 1];

  return {
    dbPath,
    requests: series.length,
    window: { from: series[0].t, to: last.t },
    session: {
      inputTokens: totalIn,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
      outputTokens: totalOut,
      missedTokens: totalIn - totalCacheRead,
      hitRate: pct(totalCacheRead, totalIn),
      costUsd: num(last.agg.totalCost),
    },
    // 上报值，用于交叉校验
    reported: {
      totals: last.totals,
      aggregateUsage: last.agg,
    },
    recent: series.slice(-20).map((s) => ({
      t: s.t,
      inputTokens: num(s.delta.inputTokens),
      cacheReadTokens: num(s.delta.cacheReadTokens),
      outputTokens: num(s.delta.outputTokens),
      hitRate: pct(num(s.delta.cacheReadTokens), num(s.delta.inputTokens)),
    })),
  };
}

function render(r) {
  const s = r.session;
  console.log('─'.repeat(64));
  console.log('  Prompt Cache 命中率');
  console.log('─'.repeat(64));
  console.log(`  请求次数      ${r.requests}`);
  console.log(`  时间窗口      ${new Date(r.window.from).toISOString().slice(11, 19)} → ${new Date(r.window.to).toISOString().slice(11, 19)}`);
  console.log('');
  console.log(`  缓存读取      ${fmtTokens(s.cacheReadTokens).padStart(8)}  (命中，按缓存价计费)`);
  console.log(`  未命中输入    ${fmtTokens(s.missedTokens).padStart(8)}  (全价)`);
  console.log(`  输入合计      ${fmtTokens(s.inputTokens).padStart(8)}`);
  console.log(`  输出          ${fmtTokens(s.outputTokens).padStart(8)}`);
  console.log('');
  console.log(`  缓存命中率    ${s.hitRate.toFixed(2)}%   ${bar(s.hitRate / 100)}`);
  if (s.cacheWriteTokens === 0) {
    console.log('  缓存写入      0  (该模型为自动前缀缓存，不单独计量写入)');
  }
  console.log('');
  console.log(`  最近 ${r.recent.length} 次请求：`);
  for (const q of r.recent) {
    const ts = new Date(q.t).toISOString().slice(11, 19);
    console.log(`    ${ts}  in ${fmtTokens(q.inputTokens).padStart(7)}  命中 ${q.hitRate.toFixed(1).padStart(5)}%  ${bar(q.hitRate / 100, 14)}`);
  }
  const agg = r.reported.aggregateUsage || {};
  if (num(agg.inputTokens) === s.inputTokens && num(agg.cacheReadTokens) === s.cacheReadTokens) {
    console.log('\n  ✔ 与上报的 aggregateUsage 完全一致，数据可信');
  } else {
    console.log(`\n  ⚠ 与上报值不一致：上报 in=${num(agg.inputTokens)} read=${num(agg.cacheReadTokens)}`);
  }
  console.log('─'.repeat(64));
}

const args = process.argv.slice(2);
const run = () => {
  const r = collect();
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else render(r);
};

if (args.includes('--watch')) {
  run();
  setInterval(() => {
    process.stdout.write('\x1b[2J\x1b[H');
    try { run(); } catch (e) { console.log('读取失败:', e.message); }
  }, 5000);
} else {
  run();
}
