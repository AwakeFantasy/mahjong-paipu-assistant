# Data Model Playback Agent

## Goal

把当前散在 `src/app/home-client.tsx` 里的播放状态推导抽成稳定、可测试的纯函数模块。其他 UI agent 只消费这个模块输出，不再自己从 `Round.events` 临时推导牌河、手牌和当前事件。

## Ownership

负责：

- 新增或整理播放状态模块，例如 `src/lib/majsoul/playback.ts`。
- 从 `Round`、`targetSeat`、`cursor` 推导 `PlaybackState`。
- 为 `PlaybackState` 补单元测试。

不负责：

- 不改牌桌视觉布局。
- 不改 `/api/analyze`、真实牌谱读取、record parser、normalization。
- 不改 debug 面板和页面外层信息架构。

## Required Interface

实现一个纯函数：

```ts
export function buildPlaybackState(round: Round, targetSeat: 0 | 1 | 2 | 3, cursor: number): PlaybackState
```

`PlaybackState` 至少包含：

```ts
export type PlaybackState = {
  cursor: number;
  maxCursor: number;
  visibleCount: number;
  currentEvent?: RoundEvent;
  previousEvent?: RoundEvent;
  discards: Record<0 | 1 | 2 | 3, string[]>;
  calls: Record<0 | 1 | 2 | 3, PlaybackCall[]>;
  targetHand: string[];
  drawnTile?: string;
  riichiTiles: Record<0 | 1 | 2 | 3, number[]>;
  roundResult?: string;
};

export type PlaybackCall = {
  seat: 0 | 1 | 2 | 3;
  callType: string;
  tiles: string[];
  froms?: number[];
  eventIndex: number;
};
```

## Behavior Requirements

- `cursor` 小于 0 时按 0 处理，大于事件数时按 `round.events.length` 处理。
- `cursor = 0` 表示起手状态：无当前事件，牌河为空，目标手牌等于 `round.initialHands[targetSeat]`。
- 只根据 `round.events.slice(0, cursor)` 推导可见状态。
- 目标玩家摸牌时，将摸牌加入 `targetHand`，并将 `drawnTile` 设为该牌。
- 目标玩家切牌时，从 `targetHand` 移除该牌；红五和普通五允许互相 fallback。
- 非目标玩家不推导手牌，只推导牌河、副露、立直牌索引。
- `discard.riichi = true` 时记录该 seat 的立直宣言牌索引。
- `call` 和 `kan` 事件进入对应 seat 的 `calls`。
- `agari` 或 `ryukyoku` 事件出现时设置 `roundResult`。

## Tests

新增测试覆盖：

- 起手状态 `cursor = 0`。
- 推进到目标玩家第一次切牌，牌河出现该牌，手牌移除该牌。
- 目标玩家摸切时，先加入再移除，最终手牌数量正确。
- 非目标玩家切牌只影响对应牌河，不影响目标手牌。
- 立直宣言牌索引记录正确。
- 副露按 seat 分组，保留 tiles/froms/eventIndex。
- cursor 越界被 clamp。

运行：

```powershell
npm.cmd run test
npm.cmd run lint
```

## Acceptance Criteria

- `home-client.tsx` 不再内联主要播放状态推导。
- UI 可通过 `PlaybackState` 直接渲染当前牌河、目标手牌、副露、当前事件。
- 所有新增测试通过，现有 normalization/API 测试不受影响。

