# Fixture 回归测试清单

## 目标

建立一组真实雀魂牌谱 fixture，用来在每次改动后快速确认核心复盘链路没有退化。第一版目标不是覆盖所有日麻规则，而是覆盖内测最可能踩到的导入、回放、决策点、Mortal、AI、牌效和 UI 状态。

## Fixture 数量

第一批准备 8-10 个真实牌谱。

建议分层：

- 6 个普通成功样例。
- 2 个复杂局面样例。
- 1 个边界/异常样例。
- 1 个性能压力样例。

## 保存方式

不要把含有隐私风险的原始账号信息随意公开。

建议目录：

```text
fixtures/
  paipu/
    README.md
    cn-east-round-normal-001.json
    cn-south-fuuro-heavy-002.json
    cn-riichi-defense-003.json
```

如果暂时不想提交原始 fixture，可以先提交索引文件：

```text
fixtures/
  paipu/
    fixture-index.example.md
```

索引字段：

```text
id:
source:
region:
paipuUrlDigest:
localRawPath:
roundCount:
targetSeats:
tags:
expected:
notes:
```

真实 URL 和原始数据可以本地保存，不进公开仓库。

## 命名规则

格式：

```text
<region>-<game-shape>-<main-feature>-<number>
```

示例：

```text
cn-tonpu-normal-001
cn-hanchan-riichi-defense-002
cn-hanchan-fuuro-heavy-003
cn-hanchan-ryukyoku-004
```

标签建议：

```text
normal
riichi
fuuro
kan
agari
tsumo
ron
ryukyoku
multi-dora
decision-diff
engine-unavailable
long-game
```

## 第一批 Fixture 覆盖矩阵

### 1. 普通东风/半庄成功导入

目的：

- 验证基础导入和回放不退化。

需要覆盖：

- 4 人玩家信息正确。
- 局数正确。
- 起手手牌存在。
- 牌河随 cursor 推进。
- 分数变化可展示。

验收：

- `/api/analyze` 返回 success。
- `rounds.length > 0`。
- 每局 `events.length > 0`。
- 前端可正常展示第一局。

### 2. 立直后押引决策

目的：

- 验证决策点、Mortal 推荐、差异显示。

需要覆盖：

- 目标玩家摸牌后切牌。
- 至少一个对家立直。
- 当前实际动作与 Mortal 推荐可能不同。

验收：

- 能抽取目标玩家决策点。
- 时间轴有决策点标记。
- 右侧“实际动作 vs Mortal 推荐”能显示状态。

### 3. 副露较多局

目的：

- 验证 call/kan/fuuro 对回放、已见牌、牌效扣除的影响。

需要覆盖：

- 吃、碰、杠至少一种。
- 副露牌在牌桌展示。
- 牌效分析扣除副露可见牌。

验收：

- `playback.calls` 有内容。
- 副露不会导致手牌数量异常。
- 牌效“已见扣除”会随副露增加。

### 4. 和牌局：荣和

目的：

- 验证终局事件、分数变化和结果摘要。

需要覆盖：

- `agari`。
- `zimo=false`。
- 点数变化。

验收：

- 终局事件显示荣和。
- 分数走势更新。
- 回放到终局不崩溃。

### 5. 和牌局：自摸

目的：

- 验证自摸结算和四家分数变化。

需要覆盖：

- `agari`。
- `zimo=true`。

验收：

- 终局事件显示自摸。
- 四家 endScores 正常。

### 6. 流局

目的：

- 验证 `ryukyoku` 处理。

需要覆盖：

- 流局标签。
- 听牌/不听信息如有。

验收：

- 回放到流局事件不崩溃。
- 局列表显示流局结果。

### 7. 杠和宝牌变化

目的：

- 验证 dora 指示牌变化和牌效已见扣除。

需要覆盖：

- 明杠/暗杠/加杠任一种。
- 新宝牌指示牌出现。

验收：

- `playback.doraIndicators` 随 cursor 更新。
- 牌效“已见扣除”包含宝牌指示牌。

### 8. 多决策点长局

目的：

- 验证性能、批量 Mortal、时间轴标记。

需要覆盖：

- 单局事件数较多。
- 目标玩家有多个摸切决策。

验收：

- 页面不卡死。
- 批量 engine overlay 不无限请求。
- 上一个/下一个差异可用。

### 9. Mortal 不可用

目的：

- 验证降级体验。

方式：

- 设置 `ANALYSIS_ENABLE_ENGINE=false`。
- 或让 `MORTAL_ENGINE_URL` 指向不可用地址。

验收：

- 导入和回放仍可用。
- 右侧推荐显示不可用或待分析。
- 页面没有未捕获异常。

### 10. LLM 不可用

目的：

- 验证 AI 问答降级。

方式：

- 清空 `ANALYSIS_LLM_API_KEY`。
- 或设置不可用 base URL。

验收：

- 问答区域显示清楚错误。
- 不影响导入、回放、Mortal、牌效。

## 每个 Fixture 的预期字段

每个 fixture 至少记录：

```ts
type FixtureExpectation = {
  id: string;
  region: "cn" | "jp" | "en";
  tags: string[];
  minRoundCount: number;
  minEventCount: number;
  targetSeats: Array<0 | 1 | 2 | 3>;
  expectedEventTypes: string[];
  expectedDecisionPoints?: number;
  expectedCalls?: number;
  expectedHasRyukyoku?: boolean;
  expectedHasAgari?: boolean;
  notes?: string;
};
```

## 回归测试层级

### Level 1：纯函数测试

适合 Vitest。

覆盖：

- URL 解析。
- record parser。
- normalize。
- playback cursor。
- decision point extraction。
- tile efficiency。
- safety hints。

运行：

```powershell
npm.cmd run test
```

### Level 2：API route smoke test

覆盖：

- `/api/analyze` 成功返回。
- `/api/engine-overlay` 在可用/不可用时都返回可处理结果。
- `/api/analysis-chat` 在配置缺失时优雅失败。

要求：

- 不依赖真实外部网络时，优先用 fixture raw data 或 mock。
- 真实网络测试单独标记，不放入默认 CI。

### Level 3：人工验收脚本

每次准备给用户内测前手动跑一遍。

步骤：

1. 打开内测 URL。
2. 导入 fixture 1。
3. 切换目标座位。
4. 播放 10 个事件。
5. 跳到第一个差异点。
6. 查看实际动作 vs Mortal 推荐。
7. 查看牌效分析理论/已见/剩余。
8. 问 AI 一个问题。
9. 收藏牌谱并写备注。
10. 刷新页面，确认最近牌谱仍存在。

## 回归通过标准

每次内测发布前必须满足：

- `npm.cmd run lint` 通过。
- 核心 Vitest 测试通过，或已记录非阻塞已知问题。
- 至少 3 个成功 fixture 能完成导入和回放。
- 至少 1 个立直决策 fixture 能显示差异状态。
- 至少 1 个副露 fixture 能正确扣除牌效已见牌。
- Mortal 不可用场景不阻塞页面。
- LLM 不可用场景不阻塞页面。

## 当前已知测试债务

当前 `tsc --noEmit` 仍可能被既有 test/env 类型问题阻塞，主要是 `ProcessEnv` mock 缺少 `NODE_ENV` 以及部分 normalize test 的类型收窄问题。这个问题应该单独修，不要和 fixture 建设混在一起。

建议后续补一个独立任务：

```text
Fix test TypeScript env mocks and normalize debug narrowing so `tsc --noEmit` can become a release gate.
```

## 后续自动化建议

第一阶段先人工维护 fixture index。稳定后再做：

- `scripts/fixtures/collect-paipu.mjs`：从 URL 拉取并保存 raw fixture。
- `scripts/fixtures/verify-fixtures.mjs`：批量跑 normalize/playback/decision/tile efficiency。
- CI 中跑无网络 fixture 回归。
- 夜间任务跑真实网络 smoke test。

