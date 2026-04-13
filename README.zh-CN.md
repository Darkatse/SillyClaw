# SillyClaw

面向 OpenClaw 的 SillyTavern 预设导入器与 Prompt 放置运行时。

SillyClaw v2 是一次彻底重构，核心由规范化 Prompt 模型、保守的 Hook 渲染器，以及 SillyClaw 自有的 Context Engine 组成，用于处理基于历史位置和绝对深度的 Prompt 插入。

[English](README.md) | 中文

## 当前状态

当前运行时形态：

- v2 已是唯一的有效运行时路径
- 所有导入的 SillyTavern `prompt_order` scope 都会被保留
- Hook 只负责渲染可被精确表达的外层包络位置
- `sillyclaw` context engine 负责 history-relative 与 absolute-depth placement
- `sillyclaw` context engine 也负责请求前的 transcript regex 改写
- 缓存权威位于 `v2/indexes/stacks.json`
- 工具链已提供 placement summary、diagnostics 与 cache stats

当前明确边界：

- OpenClaw 不暴露 kernel system prompt 内部的细粒度插入锚点
- 因而，原本相对于 SillyTavern 内部 persona、scenario 等锚点的 Prompt，无法被精确还原为 OpenClaw 内部 system-anchor 插入
- SillyClaw 会显式报告这些边界，而不是伪造错误的 Hook 语义

## 支持范围

- 导入扁平 `prompt_order` 或按 `character_id` 分组的 SillyTavern 预设
- 保留所有 source scope，并将其变为可选择的 v2 stack
- 将 `USER.md` 视为 persona
- 将 `SOUL.md` + `IDENTITY.md` 视为 character
- 对 OpenClaw 真正暴露的少量 Hook 插入点做精确渲染
- 通过 context engine 处理 before history、after history 与 absolute depth 插入
- 可选导入并管理受支持的 SillyTavern prompt regex 规则
- 当 SillyClaw 是当前 context engine 时，对受支持 regex 进行请求前 transcript 改写

不支持的运行时行为：

- SillyTavern 高级宏执行
- `markdownOnly` regex 规则
- 非 `promptOnly` 的 regex 规则
- 不受支持的 SillyTavern regex placement、substitution 与 trim 模式

不受支持的 regex 模式会在导入时被跳过，并通过导入摘要暴露出来。Prompt 文本内部的高级宏语法仍会被原样导入为 opaque text，并在 diagnostics 中报告。

## 快速开始

1. 安装并启用插件。

```bash
openclaw plugins install sillyclaw
# 本地开发：
openclaw plugins install -l /path/to/SillyClaw
openclaw plugins enable sillyclaw
```

2. 如果你需要完整的 placement fidelity，请把 context engine slot 指向 SillyClaw。

```json
{
  "plugins": {
    "slots": {
      "contextEngine": "sillyclaw"
    }
  }
}
```

如果不设置该 slot，SillyClaw 仍会以降级的 hook-only 模式工作。受支持的 regex 规则仍然会保存在 layer 上，但真正的请求前 transcript 改写只会在 SillyClaw 成为活动 context engine 时发生。

3. 导入一个 SillyTavern 预设。

```bash
openclaw sillyclaw import ./my-preset.json
openclaw sillyclaw import ./my-preset.json --with-regex
```

4. 查看生成的 stacks 并选择一个。

```bash
openclaw sillyclaw stacks list
openclaw sillyclaw stacks use <stackId>
```

5. 查看或编辑导入后的 layer。

```bash
openclaw sillyclaw layers scopes list <layerId>
openclaw sillyclaw layers scopes show <layerId> <scopeId>
openclaw sillyclaw layers scopes enable <layerId> <scopeId> <fragmentId>
openclaw sillyclaw layers scopes move <layerId> <scopeId> <fragmentId> --before <otherFragmentId>
openclaw sillyclaw layers fragments show <layerId> <fragmentId>
openclaw sillyclaw layers fragments set-content <layerId> <fragmentId> --file ./prompt.txt
openclaw sillyclaw layers fragments set-insertion <layerId> <fragmentId> --absolute --depth 2 --order -100
openclaw sillyclaw layers regex list <layerId>
openclaw sillyclaw layers regex import <layerId> ./my-preset.json
openclaw sillyclaw layers regex move <layerId> <ruleId> --before <otherRuleId>
```

6. 检查编译结果。

```bash
openclaw sillyclaw active
openclaw sillyclaw stacks inspect <stackId>
openclaw sillyclaw stacks diagnostics <stackId>
openclaw sillyclaw cache stats
```

## CLI

导入与状态：

- `openclaw sillyclaw import <file> [--name <name>] [--with-regex]`
- `openclaw sillyclaw active [--agent <agentId>] [--session <sessionKey>]`
- `openclaw sillyclaw state`
- `openclaw sillyclaw cache stats`

Layers：

- `openclaw sillyclaw layers list`
- `openclaw sillyclaw layers show <layerId>`
- `openclaw sillyclaw layers scopes list <layerId>`
- `openclaw sillyclaw layers scopes show <layerId> <scopeId>`
- `openclaw sillyclaw layers scopes enable <layerId> <scopeId> <fragmentId>`
- `openclaw sillyclaw layers scopes disable <layerId> <scopeId> <fragmentId>`
- `openclaw sillyclaw layers scopes move <layerId> <scopeId> <fragmentId> [--before <otherFragmentId> | --after <otherFragmentId>]`
- `openclaw sillyclaw layers fragments list <layerId>`
- `openclaw sillyclaw layers fragments show <layerId> <fragmentId>`
- `openclaw sillyclaw layers fragments set-content <layerId> <fragmentId> [--text <text> | --file <file> | --stdin]`
- `openclaw sillyclaw layers fragments set-insertion <layerId> <fragmentId> [--relative | --absolute --depth <n> --order <n>]`
- `openclaw sillyclaw layers regex list <layerId>`
- `openclaw sillyclaw layers regex show <layerId> <ruleId>`
- `openclaw sillyclaw layers regex import <layerId> <file>`
- `openclaw sillyclaw layers regex enable <layerId> <ruleId>`
- `openclaw sillyclaw layers regex disable <layerId> <ruleId>`
- `openclaw sillyclaw layers regex move <layerId> <ruleId> [--before <otherRuleId> | --after <otherRuleId>]`

Stacks：

- `openclaw sillyclaw stacks list`
- `openclaw sillyclaw stacks show <stackId>`
- `openclaw sillyclaw stacks inspect <stackId>`
- `openclaw sillyclaw stacks diagnostics <stackId>`
- `openclaw sillyclaw stacks use <stackId> [--agent <agentId> | --session <sessionKey>]`

可观测性规则：

- `stacks list` 以 index 为主，并在可用时显示缓存的 placement summary
- `stacks inspect` 只显示安全的结构化摘要，不输出 prompt 正文
- `stacks diagnostics` 显示单个 stack 的 import diagnostics 与 planner diagnostics
- `cache stats` 报告 cold、warm、stale、tracked、stored 与 orphaned artifact 数量

## 数据布局

SillyClaw 的 v2 数据存放在：

```text
<dataDir>/
  v2/
    state.json
    indexes/
      layers.json
      stacks.json
    layers/
    stacks/
    artifacts/
```

关键规则：

- `state.json` 只负责 selection
- `indexes/stacks.json` 是唯一的缓存权威
- 基于 artifact 的 placement summary 会被缓存到 stack index 中

详见 `docs/data-formats-v2.md` 与 `docs/refactoring-plan-v2.md`。

## 开发

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
