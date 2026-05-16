# Panels Responsive Agent

## Goal

整理页面外层信息架构，让局列表、玩家分数、摘要、debug 面板服务牌桌，而不是挤压牌桌。重点是桌面端密度合理、移动端顺序清楚。

## Ownership

负责：

- 左侧局列表。
- 玩家分数摘要。
- 右侧牌谱摘要。
- debug 面板位置和折叠方式。
- 页面整体响应式布局。

不负责：

- 不改牌桌内部四方位布局。
- 不改播放控制和时间线行为。
- 不改牌张组件内部视觉。
- 不改 `PlaybackState` 推导。

## Desktop Requirements

桌面端建议结构：

- 顶部：URL 输入和目标玩家选择。
- 主体：牌桌占主要宽度。
- 左侧或上方：局列表和玩家分数，不能过宽。
- 右侧：牌谱摘要，宽度稳定。
- debug 面板在 `?debug=1` 下默认放在牌桌下方或可折叠区域，不能抢占主牌桌宽度。

## Mobile Requirements

移动端建议顺序：

1. URL 输入和读取按钮。
2. 当前局标题和目标玩家。
3. 牌桌/目标玩家区域。
4. 播放控制和时间线。
5. 局列表。
6. 玩家分数。
7. 摘要。
8. debug 面板。

移动端必须避免：

- 三栏布局硬塞进窄屏。
- debug 面板出现在牌桌之前。
- 长 URL、玩家名、事件文本撑破屏幕。

## Panel Behavior

- 局列表显示当前选中局、结果、目标玩家点差。
- 玩家分数摘要突出目标玩家。
- 牌谱摘要保留基础复盘文案，但不要占用牌桌首屏核心空间。
- debug 面板只在 `?debug=1` 出现，显示 record 统计、network attempts、normalize 摘要。

## Tests And Checks

运行：

```powershell
npm.cmd run lint
npm.cmd run build
```

浏览器检查：

- `http://localhost:3000/?debug=1` 桌面端牌桌仍是主体。
- 移动端先看到目标玩家和牌桌，不先看到 debug。
- 局列表切换不造成页面跳动或滚动位置异常。
- 长玩家名不覆盖分数或按钮。

## Acceptance Criteria

- 普通模式和 debug 模式都可用。
- debug 面板存在但不干扰播放器主体。
- 窄屏阅读顺序符合复盘流程。

