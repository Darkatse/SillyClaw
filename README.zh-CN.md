# SillyClaw

SillyTavern 预设导入器 + 为 OpenClaw 提供角色扮演 Prompt Overlay（叠加层）。

[English](README.md) | 中文

SillyClaw 是一个 OpenClaw 插件，用于：

- 导入 SillyTavern 的 “Prompt Manager” 预设 JSON（仅作为输入格式）
- 转换并保存为 SillyClaw 自己管理的 JSON（预设层 Preset Layer + 预设栈 Preset Stack）
- 通过 OpenClaw 的强类型钩子 `before_prompt_build` 注入编译后的 Prompt 叠加层
- 保留 OpenClaw 的 kernel system prompt（正常使用中不使用 `systemPrompt` 覆盖）

本仓库刻意只实现 SillyTavern 语义的一个子集。核心目标是：**稳定、可预测、可堆叠** 的 Prompt 叠加与快速人设切换。

## 当前状态

- Schema：目前仅支持 v1（加载时缺失 `schemaVersion` 会被视为 v1；其他版本会直接抛错）
- `appendSystemContext` / `system.append`：明确延后（编译阶段遇到启用的 `system.append` 会报错）

## 快速开始（面向操作者）

1) 安装并启用插件（本地开发链接方式）：

```bash
openclaw plugins install -l /path/to/SillyClaw
openclaw plugins enable sillyclaw
```

2) 导入一个 SillyTavern 预设 JSON：

```bash
openclaw sillyclaw import ./my-preset.json
```

3) 查看已导入的预设层，并创建一个栈（base → overlays）：

```bash
openclaw sillyclaw presets list
openclaw sillyclaw stacks create "My Stack" --layers <presetId1>,<presetId2>
```

4)（可选）如果 Prompt 内含 `{{char}}` / `{{user}}`，为栈设置宏映射：

```bash
openclaw sillyclaw stacks set-macros <stackId> --char "Alice" --user "Bob"
```

5) 激活栈（默认 / 按 agent / 按 session）：

```bash
openclaw sillyclaw stacks use <stackId>
openclaw sillyclaw stacks use <stackId> --agent agentA
openclaw sillyclaw stacks use <stackId> --session sessionX
```

6) 查看当前生效的栈（仅安全摘要：不输出完整 Prompt 文本）：

```bash
openclaw sillyclaw active
openclaw sillyclaw active --agent agentA
openclaw sillyclaw active --session sessionX
```

## 工作原理（概览）

- SillyClaw 将 **预设层** 与 **预设栈** 存储在自己的 `dataDir` 中（不会写进 OpenClaw 的主配置文件）。
- 运行时解析“当前栈”的优先级为：
  - `sessionKey` → `agentId` → 全局默认 → 无
- 将栈编译为 OpenClaw 当前支持的注入字段（只用这两个）：
  - `prependSystemContext`（system-space overlay）
  - `prependContext`（用户 prompt 前置；用于近似 SillyTavern 的“chat history 之后的指令”）
- 宏替换仅支持：
  - `{{char}}`
  - `{{user}}`

## 配置

插件配置位于 `plugins.entries.sillyclaw.config`。

支持字段（见 `openclaw.plugin.json`）：

- `dataDir`（string）：SillyClaw 保存 state / presets / stacks 的目录
  - 默认：`$OPENCLAW_STATE_DIR/sillyclaw`
  - 若 `$OPENCLAW_STATE_DIR` 未设置，OpenClaw 默认使用 `~/.openclaw`
- `debug`（boolean）：开启更详细的 SillyClaw 日志

示例（仅展示结构；具体文件位置由 OpenClaw 决定）：

```json
{
  "plugins": {
    "entries": {
      "sillyclaw": {
        "enabled": true,
        "config": {
          "dataDir": "~/.openclaw/sillyclaw",
          "debug": false
        }
      }
    }
  }
}
```

## CLI 命令参考

顶层：

- `openclaw sillyclaw import <file> [--name ...] [--main-target system.prepend|user.prepend]`
- `openclaw sillyclaw active [--agent ...] [--session ...]`
- `openclaw sillyclaw state`

预设层（Preset Layers）：

- `openclaw sillyclaw presets list`
- `openclaw sillyclaw presets show <presetId>`（仅显示元数据与 block 大小）
- `openclaw sillyclaw presets export <presetId> [--out file]`

预设栈（Stacks）：

- `openclaw sillyclaw stacks create <name> --layers <id1,id2,...>`
- `openclaw sillyclaw stacks list`
- `openclaw sillyclaw stacks inspect <stackId>`（安全摘要 + 注入大小）
- `openclaw sillyclaw stacks rename <stackId> <name>`
- `openclaw sillyclaw stacks set-layers <stackId> --layers <id1,id2,...>`
- `openclaw sillyclaw stacks add-layer <stackId> <presetId> [--index n]`
- `openclaw sillyclaw stacks remove-layer <stackId> <presetId> [--all]`
- `openclaw sillyclaw stacks set-macros <stackId> [--char ...] [--user ...]`
- `openclaw sillyclaw stacks use <stackId> [--agent ... | --session ...]`
- `openclaw sillyclaw stacks delete <stackId>`

## 数据目录结构

在 `dataDir` 下：

- `state.json`：当前激活栈的选择（默认 / 按 agent / 按 session）
- `presets/<presetLayerId>.json`：预设层文件
- `stacks/<stackId>.json`：预设栈文件

当前 JSON 格式见：`docs/data-formats.md`。

## SillyTavern 导入语义（当前实现）

SillyClaw 支持两种常见的 `prompt_order` 形状：

- PromptManager 导出：`prompt_order` 是扁平的 `{ identifier, enabled }` 列表
- OpenAI preset 格式：`prompt_order` 是按角色划分的列表；优先选择 `character_id` 为 `100001`，其次 `100000`

映射到 SillyClaw targets 的规则：

- `main`（identifier 为 `main`）默认映射为 `system.prepend`，可通过 `--main-target` 覆盖
- `chatHistory` 之后的 prompts 映射为 `user.prepend`
- 其他一律映射为 `system.prepend`
- 标记型 prompt（`marker: true`）会被忽略
- 若 `prompt_order` 引用的 prompt 在 `prompts` 中不存在，则会跳过

## 诊断与隐私

- 当 `debug: true` 时，SillyClaw 仅输出栈 id/name/scope 与注入字符数（不输出 prompt 内容）。
- 若出现 `{{char}}` / `{{user}}` 但未设置映射，SillyClaw 会保留占位符不替换，并输出警告提示如何设置映射。

## 开发

- 开发指南：`docs/development.md`
- 设计文档：
  - `docs/project-constraint-guidelines.md`
  - `docs/architecture-design.md`
  - `docs/prd-and-roadmap.md`

常用命令：

```bash
npm install
npm run typecheck
npm test
```

## License

MIT（见 `LICENSE`）。

