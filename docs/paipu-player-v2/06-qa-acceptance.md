# QA Acceptance Agent

## Goal

在各 agent 合并后做统一验收，确认真实牌谱播放器在桌面端、窄屏、debug 模式下都能正常使用。QA agent 主要记录问题和做小范围验证，不直接进行大规模重构。

## Required Commands

必须运行：

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

如果某项失败，记录失败命令、关键错误、疑似归属 agent。

## Browser Setup

开发服务器：

```powershell
npm.cmd run dev -- --port 3000
```

访问：

```text
http://localhost:3000/?debug=1
```

示例牌谱：

```text
https://game.maj-soul.com/1/?paipu=260429-1ccbed45-15bd-4708-85d3-fabeac0241f0
```

## Functional Scenarios

验收以下场景：

- 粘贴示例牌谱后读取成功，显示 5 局。
- 东1局起手状态不显示错误事件编号。
- 东1局点击下一事件到 #1，显示 `东1局 0 本场`。
- 再点击下一事件到 #2，显示“东家 刹那の未来。切 2z”，目标玩家牌河出现 `2z`。
- 点击上一事件，牌河和当前事件回退。
- 拖动进度条到中段，牌河、副露、当前事件同步变化。
- 切换到东2局，进度回到 0。
- 播放到末尾后自动停住，不循环。

## Layout Scenarios

桌面端：

- 四名玩家都可见。
- 目标玩家手牌完整可读。
- 当前事件、播放控制、当前局结果首屏可见。
- debug 面板不挤压主牌桌。

窄屏：

- 牌张不互相覆盖。
- 玩家名不压住按钮。
- 控制按钮可点。
- 目标玩家区域优先完整显示。
- 局列表和 debug 面板在牌桌之后。

## Data Integrity Checks

debug 中应看到：

- `recordSource`: `data`
- `recordsTotal`: `395`
- `RecordNewRound`: `5`
- `RecordDiscardTile`: `194`
- `RecordDealTile`: `176`
- `RecordChiPengGang`: `15`
- `RecordHule`: `5`
- `normalize.rounds`: `5`
- `normalize.eventCount`: `395`

## Risk List

重点关注：

- 多 agent 合并后 `home-client.tsx` 冲突。
- 播放状态和 UI 显示不一致。
- 移动端隐藏了关键控制。
- debug 面板布局影响普通复盘。
- 红五 fallback 导致目标手牌数量错误。
- 副露移除目标玩家手牌时误删牌。

## Final Report Format

QA 结束后输出：

```md
## Result
- Pass/Fail:

## Commands
- test:
- lint:
- build:

## Browser Checks
- Desktop:
- Mobile:
- Debug:

## Issues
- [P1/P2/P3] description, owner agent, reproduction

## Notes
- Remaining risks or follow-up ideas
```

