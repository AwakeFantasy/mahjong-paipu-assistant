# Mahjong Paipu Assistant

一款本地优先的雀魂牌谱回放与复盘工具，面向日麻玩家的记录整理、局势分析和决策回看。

它适合这样的场景：

- 你想快速打开一局雀魂牌谱，按时间线回放整局
- 你想看四家手牌、牌河、副露、宝牌、立直棒和分数变化
- 你想对比自己实际打牌与 Mortal 引擎建议的差异
- 你想在当前可见局面下，用 LLM 做进一步提问

## 主要能力

- 雀魂牌谱 URL 解析与记录归一化
- Tenhou 风格桌面回放，支持桌面与移动端布局
- 四家手牌动态回放，可在“真实手牌 / 牌背”之间切换
- 完整副露处理，支持吃、碰、杠、加杠、暗杠、大明杠和被抢切牌
- 动态宝牌指示牌，包含开杠后追加宝牌推断
- 动态立直棒显示
- 四家分数走势折线图
- 事件与差异点的前后导航
- 可选 Mortal sidecar：
  - 切牌、立直、跳过、吃、碰、杠、和牌候选
  - 候选排序与百分比展示
  - 成功结果本地缓存
- 可选 OpenAI 兼容 LLM：
  - 针对当前快照提问
  - 支持快速摘要和深度复盘

## 项目定位

这是一个偏本地、偏研究用途的开源回放工具，不是完整的线上服务平台。

公开仓库不包含：

- 用户账号与会话系统
- 充值、钱包、支付、管理后台
- 商业数据库迁移与生产计费逻辑
- 私有部署密钥与 `.env.local`
- 托管的 Mortal 模型权重或引擎二进制

相关边界说明见 [docs/open-source-boundary.md](docs/open-source-boundary.md)。

## 环境要求

- Node.js 20 或更高版本
- npm
- 可访问目标牌谱的雀魂账号
- 可选：OpenAI 兼容 LLM API Key
- 可选：本地 Mortal 兼容引擎或 HTTP 服务

## 快速开始

```bash
npm install
cp .env.example .env.local
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

至少需要配置：

```env
MAJSOUL_ACCOUNT=
MAJSOUL_PASSWORD=
MAJSOUL_REGION=cn
```

然后把雀魂牌谱 URL 粘贴到页面中即可。

## 配置说明

完整环境变量列表见 [.env.example](.env.example)。

常用配置分组：

- `MAJSOUL_*`：雀魂登录、地区、网关和代理
- `ANALYSIS_ENABLE_ENGINE`、`MORTAL_ENGINE_URL`：Mortal 引擎开关与端点
- `MORTAL_COMMAND_TEMPLATE`、`MORTAL_WORKER_COMMAND_TEMPLATE`：本地 sidecar 命令模式
- `ANALYSIS_LLM_*`：OpenAI 兼容聊天接口

真实密钥请放在 `.env.local`，不要提交到仓库。

## Mortal 本地使用

网页端通过一个 HTTP 端点调用 Mortal：

```text
POST MORTAL_ENGINE_URL
```

本仓库提供 `scripts/mortal-sidecar.mjs` 作为本地 sidecar。它会把当前局面转换为 mjai JSON Lines，调用你配置的引擎命令或 worker，再把结果映射回前端可读的建议。

启动方式：

```bash
npm run mortal:sidecar
```

推荐的本地配置示例：

```env
ANALYSIS_ENABLE_ENGINE=true
MORTAL_ENGINE_URL=http://127.0.0.1:4010/analyze
MORTAL_SIDECAR_HOST=127.0.0.1
MORTAL_SIDECAR_PORT=4010
MORTAL_WORKER_COMMAND_TEMPLATE=
MORTAL_COMMAND_TEMPLATE=
```

一般优先使用 `MORTAL_WORKER_COMMAND_TEMPLATE`，适合常驻模型进程；`MORTAL_COMMAND_TEMPLATE` 更简单，但会为每次请求单独拉起进程。

如果你已经有本地 MahjongCopilot / Mortal 环境，仓库里的 `mortal-mahjongcopilot-*.py` 可以作为适配脚本使用，但模型文件和引擎本体需要你自己提供。

更多说明见 [docs/mortal-engine-local-dev.md](docs/mortal-engine-local-dev.md)。

## LLM 对话

LLM 是可选能力。可配置一个 OpenAI 兼容端点：

```env
ANALYSIS_LLM_BASE_URL=https://api.openai.com/v1
ANALYSIS_LLM_API_KEY=
ANALYSIS_LLM_MODEL=
ANALYSIS_LLM_FLASH_MODEL=
ANALYSIS_LLM_PRO_MODEL=
```

如果没有配置，应用会退回到本地的确定性摘要，不影响回放和 Mortal 复盘。

相关实现集中在：

- `src/lib/majsoul/analysis-llm.ts`
- `src/lib/majsoul/analysis-chat.ts`
- `src/app/api/analysis-chat/route.ts`

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:fixtures
npm run mortal:sidecar
```

## 项目结构

```text
src/app/                      Next.js 应用与公开 API
src/components/paipu/         回放与分析 UI
src/lib/majsoul/              牌谱解析、回放、分析、LLM/引擎适配
scripts/mortal-sidecar.mjs    本地 Mortal HTTP sidecar
scripts/mortal-*.py           可选的本地 Mortal 适配脚本
public/mahjong-tiles/         本地牌面 SVG 资源
fixtures/                     非敏感测试数据
docs/                         公开仓库说明文档
```

## 发布前检查

建议在发布或提交前执行：

```bash
npm test
npm run lint
npm run build
git status --short
```

可以再扫一轮敏感字段：

```bash
rg -n "DATABASE_URL|BETTER_AUTH|PAYMENT|wallet|recharge|admin|secret|token|password|D:\\\\|C:\\\\" .
```

这类扫描仍会命中占位变量名，比如 `MAJSOUL_PASSWORD`、`ANALYSIS_LLM_API_KEY`。真正的值不要提交。

## 许可证

MIT，见 [LICENSE](LICENSE)。

## 免责声明

本项目与雀魂、Yostar、Catfood Studio、Mortal 或 MahjongCopilot 没有从属关系。请使用你自己的账号、引擎和 API Key，并遵守相关第三方条款与许可。
