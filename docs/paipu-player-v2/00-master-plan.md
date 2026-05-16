# Paipu Player v2 Master Plan

## Summary

目标是把当前“能播放真实事件”的原型升级成更直观、稳定、适合复盘的雀魂牌谱播放器。v2 优先解决牌桌空间关系弱、牌河和手牌显示不全、移动端拥挤、当前动作不够醒目这些问题。

本阶段只做四麻普通规则牌谱的播放器体验优化，不接 Mortal、akochan 或 LLM 深度牌评，不改真实牌谱读取链路。

## Current Problems

- 牌桌没有清晰四方位坐标感，玩家、牌河、中心信息之间的空间关系不直观。
- 当前实现把播放状态推导、牌桌 UI、牌张显示、事件时间线、调试面板集中在 `src/app/home-client.tsx`，后续协作容易冲突。
- 窄屏下牌张、玩家名、控制按钮互相挤压，目标玩家区域没有足够优先级。
- 当前事件只以文字显示，缺少对摸切、立直、副露、和了等动作的视觉强调。
- debug 面板在开发模式下占用大量页面空间，容易影响牌桌主体判断。

## Agent Assignments

| Agent | Main Document | Ownership |
| --- | --- | --- |
| Data Model Playback Agent | `01-data-model-playback-agent.md` | 播放状态推导、测试 fixture、纯函数测试 |
| Table Layout Agent | `02-table-layout-agent.md` | 牌桌区域结构、四方位布局、移动端目标玩家优先布局 |
| Tile And River Agent | `03-tile-and-river-agent.md` | 牌张、牌河、副露、立直/摸切/红五样式 |
| Controls Timeline Agent | `04-controls-timeline-agent.md` | 播放控制、进度条、当前事件、事件时间线 |
| Panels Responsive Agent | `05-panels-and-responsive-agent.md` | 局列表、玩家分数、摘要/调试面板、响应式外层布局 |
| QA Acceptance Agent | `06-qa-acceptance.md` | 统一验收、浏览器检查、问题清单 |

## Recommended Order

1. Data Model Playback Agent 先完成稳定 `PlaybackState`，其他 agent 依赖这份接口。
2. Tile And River Agent 和 Controls Timeline Agent 可并行，只依赖 `PlaybackState` 字段。
3. Table Layout Agent 在牌张组件初步稳定后重排牌桌。
4. Panels Responsive Agent 最后整理外层布局，避免和牌桌结构同时大改。
5. QA Acceptance Agent 在所有分支合并后统一验收。

## Merge Rules

- 每个 agent 只改自己文档声明的 ownership 范围。
- 不要改 `/api/analyze`、雀魂登录、record parser、normalization，除非对应文档明确要求。
- 不要提交 `.env.local` 或真实 raw 牌谱。
- 所有合并前至少运行 `npm.cmd run test` 和 `npm.cmd run lint`。
- 最终集成必须运行 `npm.cmd run test`、`npm.cmd run lint`、`npm.cmd run build`。

## Shared Acceptance Criteria

- 桌面端首屏能清楚看到四名玩家、目标玩家手牌、目标玩家牌河、当前事件、播放控制、当前局结果。
- 窄屏下不出现牌张、按钮、玩家名互相覆盖；目标玩家区域优先完整显示。
- 示例牌谱东1局推进到第 2 个事件时，应显示“东家 刹那の未来。切 2z”，目标玩家牌河出现 `2z`。
- 拖动进度条、点上一/下一事件、切换局，都不会造成状态错乱。
- `?debug=1` 下仍能显示 record 统计和 normalize 摘要，但不会破坏普通播放器布局。

## Sample Paipu

开发和验收默认使用：

```text
https://game.maj-soul.com/1/?paipu=260429-1ccbed45-15bd-4708-85d3-fabeac0241f0
```

已知解析结果：

- 局数：5
- 总事件：395
- `RecordNewRound`: 5
- `RecordDiscardTile`: 194
- `RecordDealTile`: 176
- `RecordChiPengGang`: 15
- `RecordHule`: 5

