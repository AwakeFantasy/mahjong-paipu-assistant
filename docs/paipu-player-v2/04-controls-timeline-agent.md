# Controls Timeline Agent

## Goal

完善播放器控制区和事件时间线，让用户能清楚知道“现在播放到哪里、发生了什么、下一步能做什么”。

## Ownership

负责：

- 上一事件、下一事件、播放/暂停、重置。
- 进度条和事件计数。
- 当前事件摘要。
- 事件时间线。

不负责：

- 不改 `PlaybackState` 核心推导。
- 不改牌桌整体布局。
- 不改牌张和牌河组件内部视觉。
- 不改 API 或 normalization。

## Control Requirements

播放器控制必须支持：

- 上一事件。
- 下一事件。
- 播放/暂停。
- 重置到起手。
- 拖动到任意事件进度。

状态规则：

- `cursor = 0` 时上一事件和重置禁用。
- `cursor = maxCursor` 时下一事件和播放禁用。
- 切换局后回到 `cursor = 0` 并暂停。
- 拖动进度条后暂停播放。
- 播放过程中到末尾自动停住，不循环。

## Current Event Requirements

当前事件摘要必须：

- 显示事件编号，例如 `2 / 109`。
- 显示动作文本，例如“东家 刹那の未来。切 2z”。
- 对 `draw`、`discard`、`call`、`kan`、`agari`、`ryukyoku` 使用不同动词。
- 起手状态显示“起手状态”，不误显示第一条事件。

## Timeline Requirements

事件时间线必须：

- 显示最近若干条事件，当前事件高亮。
- 起手状态显示专门空态。
- 长事件列表不应撑高整个页面。
- 能配合拖动进度条定位当前事件。

## Suggested Components

- `PlaybackControls`
- `CurrentEventCard`
- `EventTimeline`

这些组件只接收 `PlaybackState`、`Round.events`、控制回调，不直接访问 API。

## Tests And Checks

建议补充轻量组件测试或纯函数测试，至少手动验收：

- 起手状态显示正确。
- 点击下一事件到 #2，当前事件为目标玩家切 `2z`。
- 点击上一事件回到 #1。
- 拖动到末尾后播放按钮禁用或不再推进。
- 切换到东2局后进度回到 0。

运行：

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

## Acceptance Criteria

- 用户无需看 debug，就能理解当前播放进度。
- 控制按钮状态和实际 cursor 一致。
- 时间线不再和起手状态产生编号错觉。

