# Claude Desktop macOS 生成模式与备份设计

## 目标

在现有生成器中增加用户可主动选择的应用模式、翻译模式和备份策略，同时保持现有默认行为：独立中文副本 + 完整翻译模式。

## 应用模式

### 独立软件包（默认）

- 只读检查官方 `/Applications/Claude.app`。
- 复制官方应用，生成 `/Applications/Claude 中文.app`。
- 修改、重打包和签名只作用于中文副本。
- 若覆盖已有中文副本，按用户配置先备份旧副本。

### 修改官方软件包

- 修改目标为官方 `/Applications/Claude.app`。
- 修改前必须创建并验证官方包备份。
- 通过显式 CLI 参数或 GUI 二次确认启用，不能由默认流程隐式启用。
- 失败时从本次备份恢复；恢复失败必须报告原始错误和恢复错误。
- 修改后进行本机 ad-hoc 签名和完整性验证。
- 仍要求生成前官方包通过签名和 Gatekeeper 检查；生成后允许官方签名状态改变，但必须报告。

## 翻译模式

### 完整模式（默认）

执行现有完整资源和运行时处理：中文资源、locale 注册、静态界面补丁、`app.asar` runtime/menu/preload 补丁，并更新 `ElectronAsarIntegrity`。

### 安全模式

只执行资源写入、locale 注册和静态前端/菜单补丁；跳过结构性 `app.asar` runtime/preload 修改以及在线页面 DOM 翻译，不更新 `ElectronAsarIntegrity`。

两种应用模式都支持两种翻译模式。

## 备份

- `backupDir` 默认为 `~/Library/Application Support/ClaudeChineseGenerator/Backups`。
- `backupCount` 必须是正整数，默认 `1`。
- `backupPolicy` 为 `overwrite` 或 `versioned`，默认 `versioned`。
- `overwrite` 使用固定目标 `<backupDir>/Claude.app.backup`，写入采用临时路径后原子替换。
- `versioned` 使用包含应用版本和时间的名称，例如 `Claude.app-1.32885.5-20260926-174500.backup`。
- 清理只删除本工具生成且位于选定目录中的备份；保留最近 `backupCount` 个，不能触碰其他文件。
- 每个备份写入伴随 manifest，记录源应用路径、版本、Bundle ID、备份时间、应用模式和翻译模式。
- 备份源必须先复制到临时路径，再完成目录级替换；任何复制或校验失败都不得开始补丁。

## CLI 接口

`generate` 和兼容别名 `build-localized-clone` 接受：

```text
--app-mode clone|official
--translation-mode full|safe
--backup-dir <path>
--backup-policy overwrite|versioned
--backup-count <positive integer>
--replace
```

默认值分别为 `clone`、`full`、默认备份目录、`versioned` 和 `1`。`official` 模式必须要求 `--confirm-official-modification`，GUI 通过等价的受控参数传递。

## GUI

生成器提供应用模式、翻译模式、备份目录、备份策略和备份数量选择器，生成摘要显示最终配置。选择 `official` 模式时必须显示风险说明并要求二次确认；取消确认不得启动 Node 生成进程。选择器通过同一 CLI 逻辑执行，不复制补丁实现。

## 错误与验证

- 非法枚举、非正备份数量、缺失备份目录或危险目标路径在写入前拒绝。
- 官方模式必须拒绝把官方包自身作为备份目录内的递归目标。
- 生成过程中失败时保留备份，不删除用户可恢复数据。
- 生成后验证目标应用签名；官方模式另外报告官方包当前签名已改变这一预期结果。
- JSON 事件和最终结果必须包含应用模式、翻译模式及备份信息，供 GUI 展示和日志记录。
