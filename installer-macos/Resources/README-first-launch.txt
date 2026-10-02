Claude 中文生成器

推荐使用“独立中文副本”模式。此模式只读取官方 /Applications/Claude.app 的版本、签名和
Gatekeeper 状态，在您确认后创建或更新独立的 /Applications/Claude 中文.app，不会修改官方
Claude.app。

生成器有两种应用模式：

1. 独立中文副本（默认）：保留官方 Claude.app 不变，生成器会复制它、写入中文资源并对副本
   使用本机临时签名。中文副本可以单独使用，但不是 Anthropic 官方签名版本。
2. 修改官方 Claude：先创建备份，再直接修改 /Applications/Claude.app。此模式会破坏原有
   Anthropic 签名和 Gatekeeper 信任，可能影响自动更新、Cowork、Claude Code 及官方安装检查。
   修改后，生成器不会再把这个 Claude.app 当作可信的官方源；需要重新生成时，必须先从备份
   恢复或从官方 DMG 重新安装。

生成器检查失败时不要强行继续。常见原因是：Claude 尚未安装、路径不是
/Applications/Claude.app、Bundle ID 不正确、官方签名失效，或者这个 Claude.app 已经被中文
生成器修改过。恢复官方版本后，再点“重新检查官方 Claude”。

检查中的“官方签名”只有在显示 Anthropic PBC Developer ID 和 Team ID Q6L2SF6YDW 时才算
官方包。显示 adhoc、没有 Team ID 或“不是官方签名”表示应用曾被修改或重签名；可在检查失败
页面使用“从默认备份恢复官方 Claude”，也可以从官方 DMG 重新安装。

中文副本使用独立数据目录：
~/Library/Application Support/Claude Desktop zh-CN

中文副本为临时签名，可能无法通过 Claude Code、Cowork、Cockpit Tools、CC Switch 或其他第三方
工具的安装校验，也可能显示“无效安装”。需要 Anthropic Team ID、官方签名、Cowork、Claude
Code、虚拟机沙箱或自动更新时，请继续使用官方 Claude.app。

官方 Claude 更新后，先让官方更新完成，再重新打开生成器并重新生成中文副本。已有中文副本时，
确认“生成/更新”会覆盖并重建该副本；如果翻译数据或新版本资源结构尚未适配，生成器会拒绝生成，
请等待本项目更新，不要手工修改官方 Claude.app。

中文副本使用独立数据目录，首次启动可能需要重新登录。删除中文副本不会影响官方 Claude；如需
彻底清除副本的登录态和配置，可一并删除下面的数据目录：
