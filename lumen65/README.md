# LUMEN 65 · 交互式机械键盘产品页

一个原创 65% 机械键盘（**LUMEN 65**）的交互式产品展示与配置页面。
产品模型用 **Three.js** 实时渲染，配置界面是完全正常的 **HTML/CSS/React** 界面
（不是把整页画进 Canvas）。

```
键帽 63 枚 · 5 行 · 15u 宽 · 铝合金定位板 + Gasket 缓震 + 一体成型底壳
```

## 快速开始

```bash
cd lumen65
npm install          # 安装依赖（three / react / vite）
npm run dev          # 开发服务器 → http://localhost:5173
npm run build        # 生产构建 → dist/
npm run preview      # 预览生产构建 → http://localhost:4173
npm run typecheck    # TypeScript 类型检查（零错误）
```

其它脚本：

```bash
npm run build:single           # 生成单文件版本 lumen-65.html（CSS/JS 全部内联）
node tools/verify.mjs          # 端到端自检（需要可选依赖 puppeteer，见下）
```

## 单文件版本

`npm run build:single` 会把构建产物**完整内联**成一个 HTML 文件：

```
lumen-65.html      # 约 712 kB，无任何外部请求，双击即可打开（file:// 亦可）
```

## 使用方式

| 操作 | 说明 |
| --- | --- |
| 拖动画面 / 单指拖动 | 整体旋转（自动旋转会在拖动时停止） |
| 滚轮 / 双指捏合 | 缩放 |
| 「复位视角」 | 平滑回到默认三分视角 |
| 外壳配色 / 键帽主题 | 3 × 3 任意组合，3D 模型与「配置摘要」同步更新 |
| 「拆解三层结构 / 组装回去」 | 键帽、定位板、底壳三层平滑分离与复原 |
| 空格刻字 | 输入文字会实时印到 3D 空格键帽上（≤12 字符） |
| 「键盘体验模式」 | 敲击 A–Z、数字、空格、方向键，对应键帽下压并回弹；触屏可直接点键帽 |
| 「按键音 开/关」 | 开关程序化合成的轴体声音（WebAudio 实时合成，无音频文件） |
| 「立即保存」 | 手动写入 localStorage；任何配置变更也会自动保存 |
| 「恢复默认」 | 只删除本页自己的存储键 `lumen65.product.config.v1`，不影响同一浏览器上其它站点/页面的数据 |

配置会保存在浏览器本地，刷新后外壳配色、键帽主题、空格刻字、拆解状态都会恢复。

## 目录结构

```
lumen65/
├── index.html                 页面外壳（含内联 favicon）
├── src/
│   ├── App.tsx                页面编排：状态、持久化、键盘事件、布局
│   ├── components/            Brand / Hero / Configurator / Summary / Overlays
│   ├── config/presets.ts      布局表（63 键坐标、宽度、行高、行倾角）、三种外壳、三种键帽主题
│   ├── lib/storage.ts         localStorage 读写（只碰自己的 key，全部 try/catch）
│   ├── three/
│   │   ├── geometry.ts        圆角矩形 / 键帽 / 板件 / 楔形底壳几何体
│   │   ├── legends.ts         键帽字符贴图（Canvas 绘制，箭头为矢量路径）
│   │   ├── KeyboardModel.ts   键盘模型装配、材质、拆解、按键弹簧、图层结构
│   │   └── Stage.ts           渲染器、相机取景、光源、OrbitControls、拾取、动画循环
│   └── audio/switch.ts        程序化按键音（噪声 + 低频 thock）
├── tools/
│   ├── build-single.mjs       单文件打包脚本
│   └── verify.mjs             Puppeteer 端到端自检（36 项断言 + 截图）
├── screenshots/               自检运行时产出的截图
└── lumen-65.html              单文件交付版
```

## 实现要点

**模型（Three.js）**

- 63 枚键帽按 65% 布局排布：数字行、字母区、方向键，以及 2u Backspace、
  2.25u Enter、2.25u / 1.75u Shift、6.25u 空格等不同宽度。
- 键帽是「底部圆角矩形 + 向内收的顶面」的锥台，带倒角与行高差；五行的
  高度和倾角各不相同（-4.5° ~ +4°），字符合成到贴合顶面长宽比的 Canvas 贴图上，
  因此不会被拉伸。
- 底壳是一体成型的楔形：底面水平，顶面从前往后抬升 0.6u（约 5.7°），
  通过顶点剪切实现，因此定位板与键帽能精确落在同一斜面上。
- 三层可辨认：底壳（阳极氧化铝 + 腰线 + USB-C 口 + 脚垫 + 状态灯 + 正面蚀刻字）、
  定位板（铝板 + 键盘 Gasket 橡胶 + 每键轴座与轴心）、键帽层。
- 环境贴图（RoomEnvironment + PMREM）+ 方向光 + 阴影贴图 + 地面接触阴影。

**交互状态**

- 拆解动画用「目标值 + 指数逼近」而不是一次性补间：连点 6 次后仍然收敛到正确位置。
- 按键下压/回弹用半隐式欧拉弹簧（子步进，与帧率无关），松开后自然回弹。
- 输入框、按钮获得焦点时不劫持按键：空格留给按钮激活，字母不会 preventDefault，
  开启「键盘体验模式」时焦点会从按钮交还给产品。
- 页面加载时键帽按行错峰落位（带轻微弹跳），底壳与定位板同时上浮就位。

## 验证情况（如实说明）

在本环境（Debian 12 + Node 24 + headless Chrome 131 + SwiftShader 软件渲染）实际执行过：

- `npm install` → 成功；`npm run build` → 成功（`dist/` 约 713 kB JS + 14 kB CSS，gzip 后约
  194 kB + 3.9 kB）；`npm run typecheck` → 零错误。
- `npm run dev`（Vite 开发服务器）→ 启动成功，页面在浏览器中加载后 3D 场景正常初始化。
- `node tools/verify.mjs`（生产构建 `dist/`）：**36/36 项断言通过**。
- `node tools/verify.mjs --file lumen-65.html`（单文件版）：**36/36 项断言通过**。
- 单文件 `lumen-65.html` 另外用 `file://` 直接打开验证：3D 场景正常初始化、渲染持续输出，
  无 JS 报错（该环境下 `file://` 的 localStorage 也可用）。

自检覆盖的行为：首屏渲染与默认配置、外壳配色切换（3D 材质 + 摘要）、**3×3 全部九种配色/主题组合**、
拆解展开到位与图层浮标、**快速连点 6 次后仍收敛到正确状态**、按键下压/回弹、
空格键、键盘体验模式、**输入框聚焦时正常输入且不驱动键帽**、拖动旋转、滚轮缩放、
视角复位、点击键帽触发按键、localStorage 写入 / 刷新恢复配色与摘要、
「恢复默认」只删除本页自己的键且不动同一浏览器的其它 key、
模拟 localStorage 抛异常时页面不崩、414×896 手机视口无横向溢出、
`prefers-reduced-motion` 下取消自动旋转与入场动画、
以及全程无 uncaught error / console error。截图见 `screenshots/`。

未在本环境验证的部分：

- **真实 GPU 下的帧率**。自检跑在 SwiftShader 软件渲染上（约 1~2 fps），只能证明渲染结果与
  交互逻辑正确，不代表真机性能；真实显卡上按模型规模（约 200 个绘制对象、一张 2048² 阴影贴图）
  预期是流畅的 60fps 级别，但没有实测数据。
- **真机移动端触控**。手机布局与 Pointer Events 在 414×896 模拟视口下检查过，
  没有在真实手机上跑过。
- **按键音听感**。音频为 WebAudio 程序化合成，本环境没有声卡，只验证了开关不报错。
- **Safari / Firefox** 等其它浏览器未逐一实测。


## 自检脚本

`tools/verify.mjs` 需要可选的 `puppeteer` 依赖（默认不装，避免给项目增加 200MB+ 的下载）：

```bash
npm run build
npm i -D puppeteer
node tools/verify.mjs                    # 自检 dist/
node tools/verify.mjs --file lumen-65.html   # 自检单文件版
node tools/verify.mjs --keep-open        # 结束后保留浏览器
```

脚本会自己起一个静态服务器（随机端口）打开页面，驱动真实界面与真实键盘事件，
并同时断言 DOM 状态和 Three.js 场景内部状态；截图输出到 `screenshots/`
（`01`–`08` 由自检写入，`09` / `10` 是另外补充的主题观感截图）。

页面在 `window.__LUMEN__` 上暴露了一个很薄的调试钩子（`stage`、`debug()`、
`getConfig()`、`projectKey(code)`），自检脚本用它读取 Three.js 的真实内部状态
（键帽数量、材质颜色、相机距离、拆解进度、按下中的键数），而不是只看 DOM。
