# 图形化安装与更新指南

`Claude 中文生成器.app` 默认生成独立的 `/Applications/Claude 中文.app`。它会先检查本机
官方 `/Applications/Claude.app`，只有你明确确认后才写入目标副本。默认模式不修改官方应用。

生成器有两种应用模式：

- **独立中文副本（默认）**：复制官方应用，写入中文资源并使用本机临时签名。官方应用保留
  原始签名；中文副本使用独立的应用身份和数据目录。
- **修改官方 Claude**：先备份，再直接修改 `/Applications/Claude.app`。修改后会失去
  Anthropic 官方签名和 Gatekeeper 信任，之后不能再通过生成器的官方源检查；自动更新、
  Cowork、Claude Code 和其他官方安装检查也可能失效。需要重新生成时，必须先恢复备份或
  从官方 DMG 重新安装。

## 首次安装

1. 从 GitHub Release 下载 `Claude 中文生成器-…-macOS.dmg`，双击打开。
2. 把 `Claude 中文生成器.app` 拖到“应用程序”文件夹。
3. 打开生成器。首次使用来源不明的下载文件时，macOS 可能出现 Gatekeeper 提示：在
   Finder 中按住 Control 点按应用，选择“打开”，再确认一次。只应下载本项目 Release
   中的 DMG；不应通过关闭 Gatekeeper 或移除系统安全保护来绕过警告。
4. 生成器首先显示官方 Claude 的版本、Bundle ID、签名及 Gatekeeper 检查结果。检查未通过
   时不要继续：如果这个应用曾被中文生成器修改过，请先恢复备份；没有可用备份时，请从
   Anthropic 或官方 DMG 重新安装 Claude Desktop。
5. 点击“生成/更新中文副本”，并在确认框中确认。已有中文副本时，确认意味着该独立副本
   会被重新生成；官方 `Claude.app` 不会被覆盖。

生成成功后，点击“打开 Claude 中文”。中文副本的配置、登录态和缓存位于：

```text
~/Library/Application Support/Claude Desktop zh-CN
```

Claude `4.29.0` 的第三方 Gateway 模式使用同级的 `Claude Desktop zh-CN-3p`
目录。这些目录与官方 Claude 的数据彼此隔离，首次启动可能需要重新登录或恢复 Gateway 配置。

## 官方 Claude 更新后

每次官方 Claude Desktop 自动更新或手动升级后，都重新打开生成器：先确认检查屏幕中
的版本和签名正确，再点击“生成/更新中文副本”。翻译数据或 Claude 的资源结构尚未适配
新版本时，生成器会拒绝生成；请等待翻译数据或本工具更新，不要手工修改官方应用。

如果你选择过“修改官方 Claude”，后续检查失败是预期结果，因为官方包已经被重签名。请
退出 Claude，使用生成器创建的备份恢复 `/Applications/Claude.app`，再重新打开生成器；
也可以从官方 DMG 重新安装。恢复或重新安装后，优先使用默认的独立中文副本模式。

生成器会在检查中显示“官方签名”。只有 Anthropic PBC 的 Developer ID 签名和 Team ID
`Q6L2SF6YDW` 才算官方包；显示 `adhoc`、没有 Team ID 或“不是官方签名”时，说明应用曾被
修改或重签名。检查失败页面提供“从默认备份恢复官方 Claude”；也可以从官方 DMG 重新安装。

## 临时签名、Gatekeeper 与“无效安装”

生成的 `Claude 中文.app` 是本机复制出的独立副本，使用本地临时签名（ad-hoc signing），
不是 Anthropic 的 Developer ID 签名或公证版本。因此即使生成器已经验证官方应用，中文
副本在 Gatekeeper、Cowork、Claude Code 或其他官方安装校验中仍可能显示“无效安装”。
这是签名身份限制，不是翻译失败。

如果检查界面提示“官方 Claude 未通过签名或 Gatekeeper 验证”，不要对当前文件继续生成。
这通常表示它不是官方原始包，或者曾被修改/重签名；请恢复备份或重新安装官方版本。

需要 Anthropic 官方 Team ID、Cowork、Claude Code、自动更新、虚拟机沙箱或官方签名
校验的功能时，请改用 `/Applications/Claude.app`。不要移除 macOS 安全机制，也不要对
官方应用执行重签名。

## 与 Cockpit Tools 和 CC Switch 配合

中文副本和官方 Claude 是独立的应用实例。第三方工具必须将“应用路径”和“用户数据
目录”一起切到中文副本，不能只改其中一项。

### Cockpit Tools

在 Cockpit Tools 中创建独立的 Claude Desktop 实例，并使用：

```text
应用路径：/Applications/Claude 中文.app
用户数据目录：~/Library/Application Support/Claude Desktop zh-CN
启动方式：App / Desktop
初始化方式：使用现有目录
```

Claude `4.29.0` 会读取带 `-3p` 后缀的配置目录；请确认工具实际写入
`~/Library/Application Support/Claude Desktop zh-CN-3p`，仅写入主目录可能不会生效。
注入后左上角可能显示 3P（第三方 /
AI 专用）或 Cowork，且模式选择器可能不可选；这是 Gateway 配置和官方安装校验的限制，
不是中文界面损坏。供应商还必须提供 Claude Desktop 可用的 Anthropic 兼容接口、认证和
模型目录。

### CC Switch

当前 macOS 版 CC Switch 默认把 Claude Desktop 3P 配置写入官方目录，例如
`~/Library/Application Support/Claude` 和 `Claude-3p`。因此它的 Claude Desktop
供应商切换默认只作用于官方 Claude，不会自动绑定中文副本的数据目录。仅设置中文应用
路径也无法改变这一点。

如需让 Gateway/API Key 用于中文副本，使用 Cockpit Tools 的独立实例，或手工写入上述
中文副本数据目录。不要让 Cockpit Tools 和 CC Switch 同时管理同一个配置目录，否则会
覆盖配置。需要 CC Switch 原生支持时，应由 CC Switch 提供可配置的用户数据目录和
`--user-data-dir` 启动支持；本项目不会修改第三方工具。

### 恢复已有 Gateway/API 配置（Claude 4.29.0）

`v0.1.19` 的安装包已包含启动器修复：安装新版生成器后，必须重新“生成/更新中文副本”。
更新后的副本会将自身主目录中的有效 Gateway 配置迁移到缺少 `configLibrary` 的 `-3p`
目录，保留已有目标配置和明确选择的官方登录模式。迁移会备份被修改的目标设置，备份位于
第三方目录内的 `.claude-zh-gateway-backup.*` 文件夹；目录和配置文件分别使用 `700`、`600`
权限。主目录原配置保留原样。它不会自动从官方 App 导入账号或 Gateway 凭据。

若中文副本进入官方登录或账号验证页面，但之前使用 Gateway，请先退出中文副本，
备份中文副本主目录及 `Claude Desktop zh-CN-3p` 中现有的配置文件，再按以下方式恢复：

1. 从自己已有且可用的 `Claude` 或 `Claude-3p` 配置中复制完整的 `configLibrary/`
   到 `~/Library/Application Support/Claude Desktop zh-CN-3p/configLibrary/`。
   `_meta.json` 中的 `appliedId` 必须对应同目录下实际存在的配置 JSON 文件。
2. 在目标目录的 `claude_desktop_config.json` 中合入 `"deploymentMode": "3p"`，
   保留该文件已有的其他设置；不存在时可创建包含这一字段的 JSON 文件。
3. 将配置目录和文件权限分别设为仅本人可访问（`700` 和 `600`），然后重新打开中文副本。
   首页应显示“您正在使用 Gateway”，并出现已配置的模型。

配置中包含 API Key，应仅在本机处理。无需复制官方账号的 Cookie、OAuth Token 或
Keychain 数据。官方 App 配置需自行选择导入。Gateway 配置健康检查通过不等于推理请求
已经验证；模型调用仍取决于服务商认证和接口兼容性。Cowork 的“无效安装”属于独立副本的
签名限制，恢复 Gateway 不会解除它。

生成器现在允许主动选择：

- 应用模式：独立中文副本（默认）或修改官方 Claude；官方模式需要二次确认。
- 翻译模式：完整模式（默认）或安全模式。
- 备份目录、覆盖/版本号备份策略及保留数量。

官方模式会在写入前创建并保留可恢复备份，但会改变官方应用签名；它不适合日常更新，也会
导致下次官方源检查失败。要恢复官方状态，请使用备份或官方 DMG。安全模式不修改结构性
`app.asar` 运行时和在线页面 preload，但只要选择官方模式，官方包仍会被重新签名。

## 日志、取消与回滚

生成过程可以在界面中取消。失败时保留界面显示的阶段和错误摘要；“查看日志”会打开：

```text
~/Library/Logs/ClaudeChineseGenerator/
```

日志会遮罩常见 API Key、Token 和 Bearer 凭据，但仍不要把日志、中文副本目录或第三方
工具配置上传到 GitHub。

若要回滚，只需退出 Claude 中文并把 `/Applications/Claude 中文.app` 移到废纸篓；如需
同时清除该副本的登录态和配置，再删除
`~/Library/Application Support/Claude Desktop zh-CN`，以及存在时的
`~/Library/Application Support/Claude Desktop zh-CN-3p`。这不会影响官方 Claude。以后
重新运行生成器即可再次创建副本。

如果回滚的是“修改官方 Claude”模式，请不要删除备份目录。先退出 Claude，再将备份中的
`Claude.app` 恢复到 `/Applications/Claude.app`，确认 `codesign` 和 Gatekeeper 恢复后，
再使用独立中文副本模式。备份默认位于：

```text
~/Library/Application Support/ClaudeChineseGenerator/Backups/
```

也可以使用 CLI 恢复带清单的官方备份：

```bash
./install.sh restore-official \
  --backup-dir "$HOME/Library/Application Support/ClaudeChineseGenerator/Backups"
```

## 命令行备用路径

图形化安装器不可用时，开发者或熟悉终端的用户仍可使用 CLI。它需要 macOS、Node.js 18+
及官方 Claude Desktop：

```bash
./install.sh status
./install.sh generate --replace
open "/Applications/Claude 中文.app"
```

CLI 与图形化生成器遵循相同边界：只读检查官方 Claude，只生成并临时签名独立中文副本。

## 发布验收与版本说明

每个正式版本在发布前都会运行“清洁机器”验收：生成器仅使用 App 内置的 Node
运行时和随 App 打包的 CLI，在临时用户目录中执行一次官方 Claude 状态检查。该检查记录
命令退出码，并且只有日志出现 `Quality gate passed` 且退出码为 `0` 时，才允许发布 DMG。
检查会在前后比较官方 Claude fixture 的文件摘要，任何写入都会使验收失败。

Release 附带以下文件及校验信息：

- `Claude 中文生成器-…-macOS.dmg`：图形化生成器，内置 Apple Silicon（arm64）和 Intel
  （x64）两种 Node 运行时。
- `claude-desktop-mac-zh-cn-… .tgz`：保留给熟悉终端的用户的 CLI 包。
- 每个发布文件的 SHA-256 校验值；下载后应先核对校验值，再按本页的首次安装步骤打开。

DMG 首次打开仍可能触发 macOS 的来源确认。该确认不代表官方 Claude 已被改动；生成器
和生成出的中文副本都不具备 Anthropic 的官方签名。请特别留意前文所述的临时签名、3P /
Cowork 与官方安装校验限制。
