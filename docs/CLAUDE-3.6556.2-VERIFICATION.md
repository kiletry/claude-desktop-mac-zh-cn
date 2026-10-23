# Claude 3.6556.2 适配验证（2026-10-23）

生成器版本：0.1.17。验证环境：Apple Silicon Mac，完整 Xcode 工具链。

## 修复

- 设置资源的 id 与 title 之间允许出现 className 等属性。
- 保留菜单模板调用的嵌套参数，将注入变量限制在独立作用域，并拒绝新旧结构混合的多目标输入。
- 识别改名后的 Electron 预加载变量。
- 将资源根目录的 zh-CN.json 映射到桌面壳层词库。
- 补充自动打开文件及浏览器、预览面板的三条文案。

## 验证结果

- Node：107 项通过；Swift：13 项通过。
- 从官方 Claude 3.6556.2 生成完整中文副本，严格深度签名校验通过，ASAR 头部哈希与 Info.plist 一致。
- 使用独立测试用户目录启动副本，观察到中文页面、设置与原生菜单。
- 官方包关键文件 SHA-256 前后一致，官方签名及 Gatekeeper 检查通过。
- 生成器含 arm64、x86_64 两种架构，Mach-O 最低系统版本为 macOS 13.0；仅在本机实际启动验证。
- 生成器签名、内置 CLI 无宿主 Node 环境检查、DMG 校验与内容检查通过。DMG 仅包含生成器及 Applications 别名。
- 独立代码审查的两项重要问题均已通过先失败后通过的回归测试修复。

## 数据来源及限制

- ICERainbow666/claude-desktop-zh-cn：380fc00c24e28e95fa812e942c01d539199f307a。
- javaht/claude-desktop-zh-cn：b2d5a8394549d9a9f38a66b4aa6e53f1226a62d4。
- codeload 下载停滞后，改从固定提交的 raw 文件构建翻译包，采用现有脚本相同的合并顺序及本地覆盖规则。
- 上游完整词库仍基于 2.19675.0.0，未声称 Claude 3.x 全量翻译；设置审计剩余 Node.js、Python 为技术名称。
- 本次未验证真实账号对话、Cowork 或 Claude Code 的完整工作流程。测试副本未复制用户凭据。
- 只准备本地发布文件，未推送或发布 GitHub Release。
