# Claude Desktop macOS 图形化生成器设计

## 状态

已于 2026-08-20 获用户确认，采用“SwiftUI 原生安装器 + 内置 Node 运行时”方案。

## 目标

在保留现有命令行接口的同时，提供普通用户可以双击使用的
`Claude 中文生成器.app`，并通过 `.dmg` 发布。用户无需预先安装 Node.js，即可检查本机
官方 Claude、确认版本和翻译来源，并生成或更新独立的 `Claude 中文.app`。

## 非目标

- 不修改、重签名、移除隔离属性或写入官方 `/Applications/Claude.app`。
- 不复制官方 Keychain、OAuth token、Cookie 或登录凭据。
- 不把 Anthropic 的 Claude 二进制文件打包进 GitHub 源码或 Release。
- 不承诺让临时签名副本通过 Anthropic Team ID、Gatekeeper、公证、Cowork 或 Claude Code
  的官方安装校验。

## 用户流程

1. 用户从 Release 下载并打开 `.dmg`，将 `Claude 中文生成器.app` 拖入“应用程序”。
2. 用户双击生成器；首次打开若 macOS 提示未验证开发者，README 提供右键“打开”和系统设置
   放行说明。
3. 生成器自动执行只读检查：确认 `/Applications/Claude.app` 存在、Bundle ID 正确、代码签名
   有效、Gatekeeper 接受，并读取 Claude 版本。
4. 窗口展示官方版本、可用的最近兼容翻译版本、翻译提交和使用限制。
5. 用户点击“生成/更新中文副本”。若 `/Applications/Claude 中文.app` 已存在，先显示覆盖确认，
   未确认时不写入任何副本文件。
6. 生成器调用与 CLI 相同的核心生成逻辑，显示阶段进度：复制、翻译资源、运行时补丁、菜单
   补丁、临时签名、完整性验证。
7. 成功后提供“打开 Claude 中文”“打开配置目录”和“查看日志”；失败后显示可复制的错误详情
   以及等价 CLI 命令。

## 架构

### SwiftUI 图形层

新增 macOS 原生 GUI target，负责窗口、状态展示、确认对话框、进度和日志。图形层不实现翻译
或应用复制逻辑，也不直接修改 Claude 资源。

### 内置 Node 运行时

Release 的 GUI app 内置与项目兼容的 Node 运行时、CLI 文件和生产依赖。GUI 通过受控子进程
调用 CLI 的 `status` 和 `generate --replace` 等命令，并捕获 stdout/stderr、退出码和取消状态。
命令行开发模式仍允许使用本机 Node 18+，两种入口共享 `src/` 中的核心实现。

### 发布结构

```text
Claude 中文生成器.app/
  Contents/MacOS/ClaudeChineseGenerator
  Contents/Resources/runtime/node
  Contents/Resources/runtime/package/
  Contents/Resources/README-first-launch.txt
```

正式 Release 同时提供：

- `Claude 中文生成器-macOS.dmg`：普通用户入口
- `claude-desktop-mac-zh-cn-<version>.tgz`：命令行和开发用户入口

### 数据流

```text
官方 Claude.app
  -> SwiftUI 只读检查
  -> CLI status / translation-source
  -> 用户确认
  -> CLI generate --replace
  -> 独立 Claude 中文.app
  -> 独立用户数据目录
```

独立副本继续使用：

```text
应用：/Applications/Claude 中文.app
数据：~/Library/Application Support/Claude Desktop zh-CN
```

## 安全与错误处理

- GUI 在执行生成前后都验证官方 Claude；任何官方签名或 Gatekeeper 检查失败都只读报错并停止。
- 覆盖操作采用临时目录和回滚路径；失败时只清理不完整的中文副本，不触碰官方应用。
- GUI 不显示或记录 API Key、OAuth token、Cookie 内容；日志对敏感字段做遮罩。
- 网络请求只用于获取版本匹配的翻译数据；下载失败时保留已存在的中文副本，不覆盖为半成品。
- Node 子进程超时、崩溃或被取消时，界面显示明确阶段和退出码，并提供日志位置。
- 首次启动提示临时签名限制：中文副本可能显示“无效安装”，Gateway 可能进入 3P/Cowork
  模式；需要官方 Cowork、Claude Code 或 Team ID 能力时使用官方 Claude.app。

## 与第三方工具的兼容提示

GUI 的帮助页和 README 必须保留现有说明：

- Cockpit Tools 需要同时指向中文应用和 `Claude Desktop zh-CN` 用户数据目录。
- CC Switch 当前 macOS 实现默认写入官方 `Claude` / `Claude-3p` 目录，不会自动绑定中文副本。
- 不允许 Cockpit Tools、CC Switch 同时管理同一个 Claude 配置目录。

## 测试与验收

### 自动化测试

- SwiftUI 状态机测试：检查中、等待确认、生成中、成功、失败、取消。
- 子进程桥接测试：正确传递参数、捕获退出码、遮罩敏感输出、处理超时和取消。
- CLI 回归测试：现有 `npm test` 全部保持通过。
- 打包测试：`.app` 包含 Node 运行时和 CLI，`.dmg` 不包含生成的 Claude.app 或本地构建缓存。

### 手工验收

1. 无 Node.js 的干净 macOS 用户环境中，双击 `.dmg` 后可以打开生成器。
2. 官方 Claude 未安装、签名异常、Gatekeeper 拒绝时，GUI 能给出可理解错误且不写入应用目录。
3. 已有中文副本时，未确认覆盖不会改变副本；确认后可以成功更新。
4. 成功生成后，副本清单包含官方版本、翻译版本、提交和独立数据目录。
5. 官方 `/Applications/Claude.app` 在生成前后均通过签名和 Gatekeeper 验证。
6. CLI 和 GUI 对同一官方版本生成的资源、清单和签名结果一致。

## 版本与发布

- GUI 版本与 CLI npm 包版本同步。
- Claude 版本变化不自动触发 GUI 更新；用户重新打开生成器并点击“生成/更新”即可重新构建。
- 当翻译数据或运行时补丁不兼容时，GUI 显示“当前 Claude 版本暂不支持”，并保留详细日志和
  CLI 排错入口。
