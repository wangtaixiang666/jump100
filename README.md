# 是男人就跳100层 · 多文件 ES Module 工程

无任何外部库 / 图片 / 音频 / 字体依赖。Canvas + 原生 JavaScript + Web Audio API。

## 一、运行

ES Module 必须通过 HTTP 服务打开，不能直接双击 `index.html`（`file://` 会被 CORS 拦截）。

方式 A（Python）：

```bash
cd jump100
python -m http.server 8000
```

浏览器访问 `http://localhost:8000/`。

方式 B：VS Code 安装 Live Server 插件，右键 `index.html` → Open with Live Server。

首次点击「开始游戏」（或按 Enter）后音频才会启动，这是浏览器自动播放策略的要求。

## 二、操作

| 按键 | 作用 |
|---|---|
| A / D（或 ← / →） | 左右移动 |
| 空格 | 跳跃；按住越久跳越高，最长蓄力 0.30 s |
| M | 静音 / 取消静音 |
| R | 重新开始 |
| Enter | 开始 / 重新开始 |
| ESC | 暂停 / 返回上一级；全屏时先退出全屏 |

启动后先显示**主菜单**：开始游戏、设置、操作说明、退出游戏。游戏中按 ESC 打开暂停菜单（继续 / 重开 / 设置 / 返回主菜单），结束或通关界面也可返回主菜单。

**设置项**（`src/settings.js`，持久化在 localStorage 键 `jump100_settings_v1`）：显示模式（窗口化 / 无边框 / 全屏）、窗口大小（小 / 标准 / 大 / 自定义宽高）、窗口置顶、允许拖动缩放、BGM / SFX 音量、静音。桌面版通过 `electron/preload.cjs` 调用真实窗口 API；网页版退化为浏览器全屏 API 与画布显示尺寸，浏览器拒绝全屏时会提示并保持窗口化。最高纪录键名为 `jump100_best`；游戏内工具条显示 BGM / SFX 音量与最高纪录。

**实心平台机制**：平台不可从下方穿过——上升时头部撞到平台底面会被挡住并以 `PHYS.CEILING_BOUNCE` 速度向下弹回（伴随闷响音效）。因此起跳前应先走到当前平台的中心区域：`level.js` 的生成约束保证上层平台不会覆盖下层平台中心左右 `PLAT.CLEAR_ABOVE` 的"起跳安全带"，从该处垂直上升不会撞头，越过上层顶面后再横向移动即可落上去。层间距 100px、满蓄力跳高约 147px、隔层底面距头部 160px，三者经过配平，满蓄力也不会撞到隔层底面。

**高空坠落**：落地冲击速度超过 `ANIM.CRASH_VY` 时进入 `crash` 状态，角色趴地撅臀、头顶冒晕眩星星，并短暂硬直（不可移动/跳跃），持续 `ANIM.CRASH_TIME`；伴随专属摔落音效。普通落地仍是压缩缓冲动作。

**落地滑行**：冲击超过 `SLIDE.MIN_IMPACT` 时进入惯性滑行状态（最长 `SLIDE.TIME`），改用 `SLIDE.LAND_FRICTION` / `SLIDE.CRASH_FRICTION` 低摩擦，而不是站立摩擦 1800——因此从高处落下会在平台上滑一段再停，摔趴时也是趴着滑出去。冲击越大、原有水平速度越大，滑得越远；垂直坠落按朝向补一个最小滑行速度 `SLIDE.MIN_KICK`。冰面平台仍用其更低的摩擦，会滑得更远。参数都在 `config.js` 的 `SLIDE` 中。

**主题切换**：主题由角色**当前站立的平台**所属楼层决定（`platform.floor`），而不是历史最高层——从雪地掉回平原时，背景、粒子和 BGM 都会切回平原，并给出「↩ 平原 ↩」横幅。空中保持上一次落地的主题，避免跳跃途中反复切歌。每个平台按自身楼层配色，因此回到平原后上方的雪地平台仍是雪色。最高纪录（UI 的 BEST）仍按历史最高层统计。

## 三、文件结构

```
index.html          入口，type="module" 加载 main.js
styles.css          页面与画布缩放（image-rendering: pixelated）
src/config.js       全部常量：物理 / 摩擦 / 平台生成 / 主题表 / 音乐数据 / 音量
src/input.js        键盘状态对象 + 边沿事件（防 keydown 重复）
src/player.js       角色物理、动画状态机、逐帧像素绘制
src/platform.js     7 种平台行为：normal/ice/sand/timed/trap/moving/lava
src/level.js        100 层程序化生成 + 可复现随机种子
src/camera.js       摄像机跟随（角色固定在屏幕 60% 高度）
src/renderer.js     背景 / 粒子 / 平台外观 / 角色 / UI / 主题横幅
src/audio.js        Web Audio 音序器 BGM + 全部音效 + 音量与静音
src/settings.js     窗口 / 画面 / 音频设置的读取、持久化与应用
src/main.js         界面状态机、主循环、UI 事件绑定
```

## 四、调参入口（均在 `src/config.js`）

- **难度**：`PHYS.GRAVITY / JUMP_VY / HOLD_GRAVITY / MAX_HOLD_TIME / CEILING_BOUNCE`（反弹速度）；`PHYS.FLOOR_HEIGHT`（层间距，须与跳高和角色身高配平）；`PLAT.MAX_X_STEP`（层间水平偏移上限）、`MIN_W / MAX_W`（平台宽度）、`THICKNESS`（实心碰撞厚度）、`CLEAR_ABOVE`（起跳安全带宽度）；`PLAT.TIMED_LIFE / LAVA_LIFE / SAND_SINK_DELAY / SAND_RESPAWN / TRAP_KNOCKBACK`。
- **摔落动作**：`ANIM.CRASH_VY`（触发速度阈值）、`ANIM.CRASH_TIME`（持续时间）。
- **主题**：`THEMES` 数组的 `floors`（楼层区间）、`skyTop / skyBot / far / near / platTop / platSide / platLine`（配色）、`particle`（粒子类型）、`types`（平台类型权重）。
- **音频**：`AUDIO.DEFAULT_BGM / DEFAULT_SFX / MASTER / FADE_TIME`；每个主题的 `music`（root / tempo / wave / cutoff / notes / bass / drum）。

## 五、新增一个主题（含 BGM）

1. 在 `config.js` 的 `THEMES` 末尾追加一项，`floors` 写成新的 20 层区间，并相应调整前一个主题的 `floors[1]`。
2. 填入配色与 `particle`（可复用 `grass/snow/sand/spark/ember`，或在 `renderer.js::_particles` 中新增分支）。
3. 在 `music` 中填 16 步 `notes` / `bass` / `drum` 数组，选择 `wave`、`tempo`、`root`。`audio.js` 会自动读取并生成该主题风格的循环 BGM。
4. 在 `THEMES` 中的 `types` 权重表加入该主题特有的平台组合。

## 六、新增一种平台类型

1. `config.js`：`FRICTION` 增加该类型的摩擦系数；在相关主题的 `types` 权重中加入它。
2. `platform.js`：`update()` 中加行为分支（计时、位移、下陷等）；若需落地触发，在 `onStand()` 中加分支。
3. `renderer.js::_platform()`：加外观分支（反光、漩涡、倒计时环、尖刺、轨道等）。
4. 如需新音效，在 `audio.js` 添加方法并在平台分支中调用。

## 七、设计说明

**音频合成**：`audio.js` 用一个 `setInterval` 预排调度器，按 BPM 把 16 步音序提前 0.12 s 排入 Web Audio 时间轴；主旋律用 `OscillatorNode` + 低通滤波 + 指数 ADSR 包络，低音用 triangle，鼓点用正弦扫频（底鼓）与白噪声滤波（踩镲/军鼓）。换主题时对 musicGain 做线性淡出 → 换数据 → 淡入。音效均为一次性振荡器或噪声突发；冰面滑行是常驻噪声环路通过增益包络开关。

**角色动画状态机**：优先级 `win > hurt > crash > land > (jump/fall) > run > idle`，按 `ANIM.FPS` 推进帧号。idle 有呼吸起伏与定时眨眼；run 四帧交替摆臂迈腿；jump/fall/land 结合速度做拉伸压扁（squash & stretch）；hurt 红闪；crash 趴地撅臀加晕眩星星；win 举手跳跃。朝向通过像素格列镜像翻转，全部由代码逐格绘制。

**可通关性**：层间距 100 px，满蓄力跳高约 147 px，隔层底面距角色头部 160 px（147 < 160 保证满蓄力不撞隔层）；相邻层水平偏移上限 55 px，越过上层顶面后的横移窗口足够覆盖该距离。生成阶段为每层保留左右各 18 px 的起跳安全带，确保从平台中心垂直上升通道畅通。
