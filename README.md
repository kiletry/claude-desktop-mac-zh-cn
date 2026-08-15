# Claude Desktop macOS 简体中文语言包

这是一个为官方 Claude Desktop macOS 应用注入简体中文语言资源的本地工具。它只修改你已经安装的 Claude.app，不包含 Claude Desktop 本体，也不隶属于 Anthropic。

## 致谢

翻译数据参考并运行时获取自 [ICERainbow666/claude-desktop-zh-cn](https://github.com/ICERainbow666/claude-desktop-zh-cn)。感谢项目作者维护多版本中文翻译文件。本项目独立实现 macOS 的版本检测、资源部署、备份和恢复逻辑。

## 安全边界

修改 `.app` 内的资源可能使 macOS 代码签名校验失败，Claude 自动更新也会覆盖汉化。工具不会关闭 Gatekeeper、停用 SIP、修改 ACL 或重新签名应用。首次真实安装必须显式传入 `--accept-signature-risk`。

先使用只读命令确认版本和布局：

```bash
./install.sh status --app-dir /Applications/Claude.app
./install.sh install --app-dir /Applications/Claude.app --dry-run
```

## 使用

```bash
# 精确检查，不写入应用
./install.sh status

# 预演，不退出 Claude、不创建备份
./install.sh install --dry-run

# 真实安装。需要你明确接受修改签名应用的风险
./install.sh install --accept-signature-risk

# Claude 升级后重新匹配翻译版本
./install.sh update --accept-signature-risk

# 当前版本没有精确翻译时，显式允许使用最近的旧版翻译
./install.sh install --allow-nearest --accept-signature-risk

# 使用安装器输出的 manifest 恢复
./install.sh restore --manifest "/path/to/manifest.json"
```

默认应用路径是 `/Applications/Claude.app`，也可以通过 `--app-dir` 指定其他路径。工具需要 Node.js 18 或更新版本，不会自动使用 `sudo`。

备份保存于 `~/Library/Application Support/Claude Desktop zh-CN/backups/`。恢复操作会校验安装后文件的 SHA-256；如果文件已经被 Claude 更新或其他程序修改，恢复会停止而不会覆盖它。

## 上游数据

每次安装从 GitHub 获取上游仓库的 JSON 语言文件并记录提交 SHA。默认只接受与本机 Claude 版本完全一致的翻译；`--allow-nearest` 才会允许选择最近的旧版翻译。工具不会执行上游仓库中的脚本。

## 开发

```bash
npm test
npm pack --dry-run
```

测试使用合成的 Claude.app 目录，不会修改本机真实应用。真实应用仅应先运行 `status` 和 `install --dry-run`。
