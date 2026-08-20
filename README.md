# Claude Desktop macOS 简体中文生成器

这是一个本地生成器工具：读取你本机的官方 `Claude.app`，自动识别版本，获取匹配的简体中文翻译数据，并生成独立的 `/Applications/Claude 中文.app`。

官方应用始终保持不变：不修改、不重签名、不写入 `/Applications/Claude.app`。

## 快速使用

要求：macOS、Node.js 18 或更高版本，以及已安装的官方 Claude Desktop。

```bash
./install.sh status
./install.sh generate --replace
open "/Applications/Claude 中文.app"
```

生成器会执行以下步骤：

1. 验证官方 Claude 的 Bundle ID、代码签名和 Gatekeeper 状态。
2. 读取当前 Claude 版本，例如 `1.30096.5`。
3. 从致谢的翻译项目中选择最近的兼容版本。
4. 复制官方应用到独立的 `Claude 中文.app`。
5. 写入中文资源，固定中文 locale，并翻译网页界面及 macOS 原生菜单/子菜单。
6. 仅对独立副本进行本地临时签名，并再次验证官方应用没有变化。

已有副本时必须显式使用 `--replace`：

```bash
./install.sh generate --replace
```

也可以指定路径：

```bash
./install.sh generate \
  --app-dir "/Applications/Claude.app" \
  --output-dir "/Applications" \
  --replace
```

`build-localized-clone` 仍作为兼容别名保留；新脚本和文档应使用 `generate`。本工具不需要中文伴侣或辅助功能权限。

## 更新 Claude 后

官方 Claude 更新后，重新运行：

```bash
./install.sh generate --replace
```

生成副本会记录所用 Claude 版本、翻译版本、翻译提交以及写入路径，位置为：

```text
/Applications/Claude 中文.app/Contents/Resources/claude-desktop-mac-zh-cn-manifest.json
```

独立副本使用本地临时签名，不是 Anthropic Developer ID 签名；官方安装仍是唯一的官方签名版本。若副本要求重新登录，这是因为副本使用了独立的应用身份和用户数据目录。

## 与 Cockpit Tools / CC Switch 一起使用

中文副本和官方 Claude 是两套独立的应用与配置。第三方工具必须同时指向
`Claude 中文.app` 和中文副本的数据目录，否则 API Key 会被写入官方 Claude，
中文副本不会生效。

### Cockpit Tools

参考仓库：[jlcodes99/cockpit-tools](https://github.com/jlcodes99/cockpit-tools)

Cockpit Tools 支持自定义 Claude 应用路径和实例用户数据目录。推荐使用
“Claude 实例”创建一个桌面实例，并绑定 Gateway/API Key 账号：

```text
应用路径：/Applications/Claude 中文.app
用户数据目录：~/Library/Application Support/Claude Desktop zh-CN
启动方式：App / Desktop
初始化方式：使用现有目录
```

不要只修改 Cockpit 的 Claude 应用路径；如果仍使用默认实例，账号切换仍会写入：

```text
~/Library/Application Support/Claude/claude_desktop_config.json
~/Library/Application Support/Claude-3p/claude_desktop_config.json
```

而不是中文副本目录。正确注入后，中文副本目录中应出现
`claude_desktop_config.json` 和 `configLibrary/_meta.json`，并且 Gateway 配置会使
Claude 进入 3P（第三方 / AI 专用）模式。

### CC Switch

参考仓库：[farion1231/cc-switch](https://github.com/farion1231/cc-switch)

当前版本的 CC Switch 在 macOS 上把 Claude Desktop 3P 配置固定写入官方目录：

```text
~/Library/Application Support/Claude/claude_desktop_config.json
~/Library/Application Support/Claude-3p/claude_desktop_config.json
~/Library/Application Support/Claude-3p/configLibrary/
```

因此，CC Switch 的“Claude Desktop”供应商切换默认作用于官方
`/Applications/Claude.app`，不会自动作用于 `/Applications/Claude 中文.app`。
仅把 CC Switch 的应用路径改成中文副本也不能改变它的配置目录；当前版本没有为
这个独立中文副本提供完整的自定义 `--user-data-dir` 实例绑定。

如果必须使用 CC Switch，请把它用于官方 Claude；如果要让 Gateway/API Key
作用于中文副本，请使用 Cockpit 的独立实例方式，或手动把同一套配置写入中文
副本数据目录。不要让两个工具同时管理同一个 Claude 配置目录。

若要让 CC Switch 原生支持此中文副本，CC Switch 本身需要增加“Claude Desktop
用户数据目录”设置，并把固定的 `Claude` / `Claude-3p` 路径改为基于该目录生成，
同时在启动副本时传递 `--user-data-dir`。本项目不会自动修改或重签第三方工具；
直接改动 CC Switch 源码也可能在升级时被覆盖。

## 使用限制与已知行为

- 中文副本是从本机官方 Claude 复制生成的本地临时签名应用，不是 Anthropic 官方签名或公证应用。`codesign` 可以验证副本完整性，但 Gatekeeper、Cowork 和 Claude Code 的官方安装校验可能显示“无效安装”。
- Gateway/API Key 注入通常会将 Claude 固定到 3P（第三方 / AI 专用）模式；左上角可能显示 Cowork，模式选择器可能被禁用。这是 Gateway 配置行为，不是中文翻译失败。
- 中文副本不能保证 Cowork、Claude Code、虚拟机沙箱、自动更新或需要 Anthropic 官方 Team ID 的功能可用。需要这些功能时请使用官方 Claude.app。
- 官方应用和中文副本的登录态、Cookie、Keychain 凭据、缓存、会话及配置互不共享。副本可能需要单独登录；本工具不会复制官方 Keychain 或 OAuth 密钥。
- Claude 更新后必须重新运行 `./install.sh generate --replace`。新版本可能改变 Electron 资源布局或压缩后的运行时代码，导致翻译补丁拒绝构建；此时应等待翻译数据或补丁适配，不要强行覆盖官方应用。
- 翻译数据来自已致谢的第三方项目，并按已安装 Claude 版本选择最近兼容版本；低于当前版本的翻译可能仍有少量英文或菜单缺失。
- Gateway 供应商必须提供 Claude Desktop 可用的 Anthropic 兼容接口和可识别的模型目录。供应商返回的模型名称、认证方式、网络可达性或请求格式不兼容时，中文副本可能无法发送消息。
- API Key 会写入本机应用配置及备份文件。不要把 `~/Library/Application Support/Claude Desktop zh-CN/`、Cockpit/CC Switch 数据目录或日志提交到 GitHub；发现泄露时应立即撤销并重新生成 Key。
- 本项目只生成本地副本，不重新分发 Anthropic 二进制文件，也不绕过官方账户、签名、公证或服务端访问控制。

## 发布边界

GitHub 只发布本工具的源码、安装脚本和测试，不发布或内置 Anthropic 的 Claude 二进制文件。用户必须先在自己的 Mac 上安装官方 Claude，再由生成器在本机创建中文副本。这样可以跟随 Claude 更新，也避免把第三方专有应用重新分发到仓库中。

## 安全与归属

- 官方 `/Applications/Claude.app` 在生成前后都要通过签名校验。
- 翻译数据只在构建时下载；运行中的 `Claude 中文.app` 不向本工具发送数据。
- 生成器不会复制登录密钥、Keychain 凭据或 OAuth token。

特别感谢
[ICERainbow666/claude-desktop-zh-cn](https://github.com/ICERainbow666/claude-desktop-zh-cn)
的作者及维护者持续提供和维护简体中文翻译数据。
本项目独立开发，与 Anthropic 没有隶属或官方合作关系。

## 开发与验证

```bash
npm test
npm run package
```

### 构建图形化安装包（开发者）

图形化生成器会内置 arm64 与 x86_64 两个 Node 运行时，因此最终用户无需自行安装
Node.js。将两个已解压且可执行的 Node 二进制文件放在同一目录后构建：

```bash
npm run build:generator -- \
  --runtime-dir "$NODE_RUNTIME_DIR" \
  --output-dir 'dist/Claude 中文生成器.app'
npm run build:dmg -- \
  --app 'dist/Claude 中文生成器.app' \
  --output 'dist/Claude 中文生成器-macOS.dmg'
npm run verify:generator-bundle -- 'dist/Claude 中文生成器.app'
```

`$NODE_RUNTIME_DIR` 必须包含 `node-arm64` 和 `node-x64`。DMG 仅包含
`Claude 中文生成器.app` 及指向 `/Applications` 的拖拽别名；不会包含、复制或修改
官方 `Claude.app` 或生成的 `Claude 中文.app`。

真实生成命令只写入独立副本：

```bash
./install.sh generate --replace
```
