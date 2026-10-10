# Cline 云端沙箱环境报告

一个**零依赖的单文件 HTML 页面**，把运行它的沙箱实例的真实规格、工具链、隔离策略渲染成仪表盘。
配套三套自动化测试，从「文件结构」一路测到「真 Chromium 渲染 + 截图」。

## 文件结构

```
index.html                  页面本体（单文件，内联 CSS/JS，可离线打开）
tests/report.test.js        23 项：静态结构 / 纯函数 / jsdom 真实 DOM
tests/http.test.js          5 项：真实 HTTP 服务 + 目录穿越防护
scripts/serve.mjs           极简静态服务器（同时也是被测对象）
scripts/screenshot.mjs      24 项：真 Chromium 渲染、布局、交互、响应式、截图
scripts/diag.mjs            诊断工具：找出窄屏下真正溢出的元素
scripts/cache-stats.mjs     读取会话的 prompt cache 命中率（见文末）
screenshots/                dark.png / light.png / mobile.png / mobile-320.png
```

## 怎么跑

```bash
npm install                    # 只装 jsdom 和 playwright（都是 devDependency）
npm test                       # 28 项：结构 6 + 纯函数 9 + DOM 8 + HTTP 5
node scripts/serve.mjs 8099    # 本地预览 http://localhost:8099/
```

真浏览器测试需要 Chromium；本沙箱无 root、无系统依赖，见文末「在无 root 沙箱里跑真浏览器」：

```bash
LD_LIBRARY_PATH=/tmp/chromium-libs-min node scripts/screenshot.mjs   # 24 项 + 出图
```

## 页面设计要点

- **零外部依赖**：没有任何 `<script src>`、`<link>`、图片或 `@import`，断网也能打开。
  有测试专门断言页面里不存在任何 `http(s)://` 字面量。
- **逻辑与渲染分离**：所有计算都是纯函数（`formatBytes` / `formatUptime` /
  `clampPct` / `pct` / `buildKpis`），挂在 `window.SandboxReport` 上，
  因此可以脱离 DOM 单独测试，也方便被别的脚本复用。
- **防御性输入**：`formatBytes(-1)`、`pct(1, 0)`、`clampPct(NaN)` 都有明确返回，
  而不是让 `NaN` / `Infinity` 漏到界面上。
- **幂等渲染**：重复调用 `render()` 不会叠加行。
- 深浅双主题（`localStorage` 记忆）、响应式卡片网格。

## 测试发现并修掉的真实问题

真浏览器测出来的东西，jsdom 测不出来。以下每条都是先失败、再修、再复测通过：

| # | 现象 | 根因 | 处理 |
|---|---|---|---|
| 1 | `/../package.json` 返回 200 | `new URL()` 会先把 `../` 规范化掉，防护代码根本没被执行 | 改测真正的攻击向量 `%2e%2e%2f`（编码后绕过规范化） |
| 2 | 目录穿越防护有缺口 | `path.resolve` 后只判断 `startsWith(root)`，`/workspace-evil` 会被放行 | 补上 `root + path.sep` |
| 3 | 窄屏「正常」徽章被挤成竖排两字 | 状态列没有最小宽度约束 | `.pill{white-space:nowrap}` + 末列 `width:1%` |
| 4 | 窄屏整页横向溢出 77px | 主机名 `ins-01m4jvbnyvmc35d8r62msma6ac` 是无空格长 token，撑破表格 min-content | `th,td{overflow-wrap:anywhere}` |
| 5 | 首列标签「主机名」被劈成两行 | 表格列宽分配没有下限 | ≤560px 时首列 `white-space:nowrap` + 收窄内边距 |
| 6 | `h1` 高度算出来是 0 | **沙箱里一个字体都没有**（`/usr/share/fonts` 不存在，`document.fonts.size===0`），所有文字量出 0×0 | 把 `fonts-dejavu-core` + `fonts-noto-cjk` 解包进 `~/.local/share/fonts` |

另有 3 个是**测试代码自身的 bug**，值得记下来：

- `assert.deepEqual(kpis.map(…), […])` 假失败：jsdom 是独立 realm，`deepStrictEqual`
  会比较原型链。展开成宿主数组再比。
- 主题色断言假失败：`body` 有 `transition: background .25s`，点击后立刻读
  `getComputedStyle` 读到的是插值中间态 `rgb(233,236,241)`，要等过渡结束。
- 「首列是否断行」连续测错两次：`getBoundingClientRect().height` 既含 padding，
  又会被整行行高撑高（表格单元格是等高拉伸的，中间列换行会连带首列一起变高）。
  最终改用 `Range.getClientRects()` 按行盒去重来数真实行数。

## 沙箱实况（这个页面渲染的正是它自己）

| 项目 | 值 |
|---|---|
| 主机名 | `ins-01m4jvbnyvmc35d8r62msma6ac` |
| 系统 | Debian GNU/Linux 12 (bookworm) x86_64 |
| 内核 | `6.12.85+`，构建链是 Chromium OS clang 17 → **gVisor 沙箱** |
| CPU | AMD EPYC 9B14 × 60 |
| 内存 | 235.9 GiB（可用 220.6 GiB） |
| 磁盘 | `/workspace` 15.6 GiB |
| 用户 | `node` (uid 1000)，**非 root**，`CapEff=0000000000000000` |
| seccomp | `mode=2 (filter)`，生效 1 个 |
| 命名空间 | mnt / pid / net / ipc / uts / user / cgroup 全部隔离 |
| 网络 | 经 `SANDBOX_ROUTER` 出口代理，可访问 npm registry 与 GitHub |
| 预装 | Node v24.21.0、npm 11.19.0、Python 3.11.2、Git 2.39.5、curl 7.88.1 |
| 未装 | Go、Rust、Chromium、**任何字体**、`fc-*` 字体工具 |

## 在无 root 沙箱里跑真浏览器

`npx playwright install --with-deps` 会卡在 `su` 要密码——沙箱没有 root。
但 Chromium 的缺失共享库可以绕过 apt 自己拼：

1. `ldd chrome-headless-shell | grep 'not found'` 列出 20 个缺失库
2. 用**自定义目录**的 apt（`Dir::State` / `Dir::Cache` 全指向 `/tmp/aptroot`），
   加 `bookworm` + `bookworm-updates` + `bookworm-security` 三个源做 `apt-get update`
3. `apt-cache depends --recurse` 解析出 48 个包的依赖闭包，`apt-get download` 下载
4. `dpkg-deb -x` 解包，然后**只挑真正缺的库**递归补齐（29 个），
   落地到 `/tmp/chromium-libs-min`——刻意排除 glibc 系列，否则必崩
5. `LD_LIBRARY_PATH=/tmp/chromium-libs-min` 启动

字体同理：Chromium 已把 fontconfig 静态编译进去，内置配置会扫描
`$XDG_DATA_HOME/fonts`，所以解包字体文件到 `~/.local/share/fonts` 即可，同样不需要 root。

## 注意

- 端口 **8080 不可用**——沙箱自己的 `SANDBOX_ROUTER` 占着它，预览请换 8099 之类。
- `node --test tests/` 在 Node 24 下会被当成模块路径，要写成 `node --test tests/*.test.js`。

## 附：查看 prompt cache 命中率

```bash
npm run cache            # 人读报告
npm run cache:watch      # 每 5 秒刷新
node scripts/cache-stats.mjs --json
```

数据不在 `session.json` 里（那只有元数据），而在
`~/.cline-home/data/db/hub-events-*.db` 的 `usage.updated` 事件中。
每条事件带三层计数：`delta`（本次请求）/ `totals`（本轮）/ `aggregateUsage`（本会话累计），
字段为 `inputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `totalCost`。

**字段语义**（用首次请求验证过）：第一次请求 `in=5950, cacheRead=0`——冷缓存，命中 0%；
第二次 `in=6358, cacheRead=6016`——说明 `inputTokens` 是**含缓存命中在内的 prompt 总量**，
所以 `命中率 = cacheReadTokens / inputTokens`。

`cacheWriteTokens` 全程为 0，说明该模型用**自动前缀缓存**（DeepSeek 系行为），
不像 Anthropic 那样单独计量 cache creation。

一个实测快照（115 次请求 / 约 10 分钟）：

```
缓存读取      7.65M  (命中)
未命中输入    72.9k  (全价)
缓存命中率    99.06%
```

脚本会把累加 `delta` 的结果和上报的 `aggregateUsage` 做交叉校验，
两者一致才显示 ✔——避免自己算错还以为数据不可信。

