# 图形化安装与更新指南

`Claude 中文生成器.app` 是本项目推荐的使用方式。它只检查本机官方
`/Applications/Claude.app`，并在你明确确认后生成独立的
`/Applications/Claude 中文.app`；绝不修改、重签名或替换官方应用。

## 首次安装

1. 从 GitHub Release 下载 `Claude 中文生成器-…-macOS.dmg`，双击打开。
2. 把 `Claude 中文生成器.app` 拖到“应用程序”文件夹。
3. 打开生成器。首次使用来源不明的下载文件时，macOS 可能出现 Gatekeeper 提示：在
   Finder 中按住 Control 点按应用，选择“打开”，再确认一次。只应下载本项目 Release
   中的 DMG；不应通过关闭 Gatekeeper 或移除系统安全保护来绕过警告。
4. 生成器首先显示官方 Claude 的版本、Bundle ID、签名及 Gatekeeper 检查结果。检查
   未通过时不要继续，重新从 Anthropic 安装官方 Claude Desktop。
5. 点击“生成/更新中文副本”，并在确认框中确认。已有中文副本时，确认意味着该独立
   副本会被重新生成；官方 `Claude.app` 不会被覆盖。

生成成功后，点击“打开 Claude 中文”。中文副本的配置、登录态和缓存位于：

```text
~/Library/Application Support/Claude Desktop zh-CN
```

这与官方 Claude 的数据彼此隔离，首次启动可能需要重新登录。

## 官方 Claude 更新后

每次官方 Claude Desktop 自动更新或手动升级后，都重新打开生成器：先确认检查屏幕中
的版本和签名正确，再点击“生成/更新中文副本”。翻译数据或 Claude 的资源结构尚未适配
新版本时，生成器会拒绝生成；请等待翻译数据或本工具更新，不要手工修改官方应用。

## 临时签名、Gatekeeper 与“无效安装”

生成的 `Claude 中文.app` 是本机复制出的独立副本，使用本地临时签名（ad-hoc signing），
不是 Anthropic 的 Developer ID 签名或公证版本。因此即使生成器已经验证官方应用，中文
副本在 Gatekeeper、Cowork、Claude Code 或其他官方安装校验中仍可能显示“无效安装”。
这是签名身份限制，不是翻译失败。

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

Gateway/API Key 注入会写入这个中文副本数据目录。注入后左上角可能显示 3P（第三方 /
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

## 日志、取消与回滚

生成过程可以在界面中取消。失败时保留界面显示的阶段和错误摘要；“查看日志”会打开：

```text
~/Library/Logs/ClaudeChineseGenerator/
```

日志会遮罩常见 API Key、Token 和 Bearer 凭据，但仍不要把日志、中文副本目录或第三方
工具配置上传到 GitHub。

若要回滚，只需退出 Claude 中文并把 `/Applications/Claude 中文.app` 移到废纸篓；如需
同时清除该副本的登录态和配置，再删除
`~/Library/Application Support/Claude Desktop zh-CN`。这不会影响官方 Claude。以后
重新运行生成器即可再次创建副本。

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
