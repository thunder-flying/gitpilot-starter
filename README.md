# GitPilot — AI 开发成果分析 Agent（React + NestJS + Prisma + PostgreSQL）

> 一个**可用于本地开发的入门脚手架**，不是已完成部署或生产认证的系统。
> 后端已通过编译和本地模拟模型测试；真实 DeepSeek 调用需要配置有效的 API Key。

## 功能

- 仓库和作者由后端环境变量**固定配置**，模型无法更改分析权限范围
- 获取最近 7 天的 GitHub commits（GitHub API 支持私有仓库只读 Token）
- OpenAI Agents SDK 通过 DeepSeek Chat Completions 提供 `list_commits` / `inspect_commit` 两个工具
- Agent 自主选择要进一步检查的提交，对代码 Diff 做基于证据的归纳
- Zod 结构化报告：功能、Bug、重构、性能、具体贡献、证据链接
- Prisma + PostgreSQL 保存报告，同一 repo/author/since/until 组合 `upsert`
- React 展示结构化成果和局限性说明

## 前提

- Node.js **22.22.3+**（Prisma v7 官方要求；或更新的兼容 LTS 版本）
- Docker Compose（只用于本地 PostgreSQL）
- DeepSeek API Key 和可用的 API 余额；公开仓库可以不填 GitHub Token，私有仓库必须配置只读 Token
- 创建 GitHub fine-grained PAT 时仅给指定仓库 **Contents: Read** 权限。不要赋予代码写入权限。
- 后端会把选中的代码 Diff 发送给模型服务。如果仓库含有商业机密或敏感数据，先确认数据处理授权并增加脱敏过滤。

## 运行

1. 根目录运行 `docker compose up -d`
2. `cd backend`；首次配置时复制 `.env.example` 为 `.env`，填入 `DEEPSEEK_API_KEY`、`GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_AUTHOR` 等。已有 `.env` 时直接编辑，避免覆盖已有配置。
3. `npm install`
4. `npm run db:generate`
5. `npm run db:migrate -- --name init`
6. `npm run dev`
7. 新终端：`cd frontend && npm install && npm run dev`
8. 浏览器打开 `http://localhost:5173`

**Windows PowerShell 复制环境文件：** `Copy-Item .env.example .env`

模型配置示例（填写在 `backend/.env`，修改后重启后端）：

```dotenv
DEEPSEEK_API_KEY="你的 DeepSeek API Key"
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-flash"
```

不再使用 `OPENAI_API_KEY` / `OPENAI_MODEL`。已关闭 OpenAI tracing，模型请求与选中的代码 Diff 发往 DeepSeek。使用非思考模式以兼容 SDK 的工具调用历史；最终报告使用 JSON 模式并在服务端执行 Zod 校验。

运行 `cd backend` 后执行 `npm test`，可编译后端并通过本机模拟服务验证工具调用、JSON 输出和保存前校验，不消耗模型额度、不发送真实仓库代码。

## API

`POST http://localhost:3000/reports/analyze`

```json
{
  "since": "2026-10-09T00:00:00+08:00",
  "until": "2026-10-16T17:00:00+08:00"
}
```

`GET http://localhost:3000/reports`：最近 20 份已保存报告的元信息。

## 重要限制

1. 默认仅分析最新 40 条提交，每次 Agent 最多请求 12 个不同 Commit Diff，并限制轮数。报告会披露未覆盖内容。
2. GitHub `get commit` 仅抽取前 15 个文件的 patch，单个文件 patch 截断到 1500 字符。大型提交不可作为完整代码审查依据。
3. 只保存按精确起止时间唯一的报告。**跨不同周/多次变更的语义成果去重尚未实现**。后续应增加 achievement 独立表、人工合并和历史关联。
4. 代码可以证明改动存在，**不能自动证明上线、个人独占贡献、性能收益或业务影响**。MVP 在服务端一律将 `impactVerified` 设为 false；只有后续接入验收数据或性能测试并通过核查，才能改成 true。
5. 本地学习版 API 未做用户身份认证、请求限流、用量预算和集中审计。**不可直接暴露公网**。
6. 模型遇到明确的恶意 prompt injection 或潜在 secrets 时可能出现风险。代码 diff 作为不可信数据处理，生产使用应再做密钥扫描/脱敏、tool output guardrails、审计日志等。
7. `DEEPSEEK_MODEL` 默认 `deepseek-flash`，可换成 DeepSeek 当前提供且支持 JSON 输出和工具调用的模型。

## 下一步（推荐）

- `Achievement` 表（跨周去重、合并、证据复用）
- OAuth/GitHub App，多租户权限隔离
- 按需 GitHub MCP Server
- BullMQ + Redis + 定时任务（每周五生成草稿）
- 流式状态展示（SSE）与取消执行
- 质量评估样例：无变更、空仓库、多人提交、性能声称、超大 Diff 等

## 参考文档

- https://openai.github.io/openai-agents-js/guides/quickstart/
- https://openai.github.io/openai-agents-js/guides/tools/
- https://docs.github.com/en/rest/commits/commits
- https://www.prisma.io/docs/guides/v7/frameworks/nestjs
