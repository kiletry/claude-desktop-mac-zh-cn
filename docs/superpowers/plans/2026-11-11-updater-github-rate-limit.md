# Fix generator update checks when GitHub API is rate limited

User report: clicking retry displays unable to get updates from GitHub. Reproduced with unauthenticated curl: HTTP403, X-RateLimit-Limit60, X-RateLimit-Remaining0, JSON message API rate limit exceeded. Public GitHub release page and raw repository are available. Existing v0.1.26 always requests api.github.com/releases/latest, so retry alone cannot recover while the shared IP quota remains empty.

Fix: publish API-schema-compatible `generator-update.json` alongside each stable release and use its public releases/latest/download URL as primary metadata source. Fall back to API on transport errors only, preserving identical strict decoding, stable version, exact repository link/asset/size checks. Neither source downloads DMG or checksum before explicit install. Manifest is generated from exact stable package version and built artifact sizes after SHA256SUMS; checksum entries cover the same three binary/source/translation assets as before. Manifest metadata uses HTTPS same release trust, without independent signature claims.

- [x] Regression tests RED: existing API-only implementation fails public-primary success, missing-public fallback ordering, dual error diagnosis, and metadata-only request assertion. Node manifest test fails missing script.
- [x] Implement primary public metadata + API fallback and release manifest generation/publication.
- [x] Full Swift/Node tests and independent review.
- [x] Publish v0.1.27 and verify downloaded public asset hashes/bundle/source and real unauthenticated startup/manual check from current rate-limited network.

Maintain previous writable installed-target policy and explicit installation flow. No official Claude/profile/Gateway configuration changes. v0.1.26 cannot receive the client code fix through a rate-limited API, so supply new manual installation DMG.

Validation before publication: Node145/145; Swift31/31 with public v0.1.25 real DMG fixture enabled. RED log `/tmp/generator-feed-red.log`, GREEN `/tmp/generator-feed-green.log`, Node `/tmp/generator-feed-all-node.log`.


## v0.1.27 publication and followup

- Tagba23a46; run43013051706 attempt1 failed hdiutil DMG creation with No space left on device; same immutable tag retried from authenticated GitHub UI (CLI token lacks rerun permission). Attempt2 passed all gates and published five assets. Public downloaded DMG/tgz/translation SHA256SUMS all pass; manifest sizes match actual files; strict deep signature, universal binary, manifest sourceCommit, source archive comparison and clean CLI check pass.
- Actual unauthenticated production updater network check from this machine succeeded twice via public JSON alone: current0.1.26 offers v0.1.27, current0.1.27 offers none. Same-time anonymous API stillHTTP403. Public DMG launched and startup/manual menu showed “生成器 v0.1.27 · 已是最新版本”.
- User immediately reported menu opens a second interface. Reproduced in CUA: original WindowGroup scene generator-AppWindow-1 becomes a newly opened generator-AppWindow-2 after menu calls openWindow. Cause is using openWindow with a multiple-instance WindowGroup. Initial Window scene replacement was rejected by review because closing the primary Window quits the app (would change background generation/update behavior). Final fix preserves WindowGroup and locates the visible/minimized existing main NSWindow by its exact title; deminiaturizes/focuses it, calls openWindow only when none exists.
- [x] v0.1.28: build, repeated-menu and minimize/restore UI regression, successful live metadata check, replacement DMG publication and public artifact verification. No-window menu branch was reviewed; live CUA access to that branch is limited as recorded below.

- After the user unlocked the Mac, local v0.1.28 live CUA regression passed repeated menu checks: both checks retained generator-AppWindow-1 and returned up-to-date. Minimizing and invoking the menu restored generator-AppWindow-1. File > Close All removed the window while PID62060 remained running; CUA cannot access the app menu without a window (timeout), so the no-window menu path has code-review evidence only. Reopening the app through Launch Services retained that process. No install or generation was triggered.

- Review recheck approved final WindowGroup+existing-window focus implementation. Local automated checks:145 Node,31 Swift all pass; universal executable built and local v0.1.28 DMG signed/clean CLI verified.
- Local DMG creation reproduced v0.1.27 CI's No-space failure inside temporary `/Volumes/Claude 中文生成器`, while host had90GiB free. This refines the earlier runner-space diagnosis: source-folder image auto-sizing can be too small. Added explicit image capacity of staged allocation +50%+64MiB. Distribution fixture RED then GREEN7/7; real local DMG now builds and clean bundle check passes. This packaging fix is included in v0.1.28.

## v0.1.28 public verification

- Immutable tag `v0.1.28` points to `d7df0bb1649025acdcb4d8b34d11c4b204d36f8b`. GitHub Actions run43141757412 passed on its first attempt (2m22s) and published all five assets. Main and the working branch were fast-forwarded/pushed before tagging.
- Downloaded public assets under main checkout `dist/release-v0.1.28`: all three SHA256SUMS entries passed. Readonly mounted public DMG passed deep strict signature and clean embedded CLI checks; executable includes arm64 and x86_64. Bundle version0.1.28 and runtime sourceCommit match the tag. Public metadata asset sizes match downloaded files. Compared29 source files from the public archive with tagged source and embedded copies where present: all match.
- Production Swift updater live unauthenticated harness requested only public generator-update.json twice: offers v0.1.28 to current0.1.26 and none to current0.1.28. Download method deliberately rejects any download, so these checks cannot fetch DMG/checksums.
- Launched the public DMG app without installation. Startup and manual menu check both showed `生成器 v0.1.28 · 已是最新版本`, retaining `generator-AppWindow-1`. Official Claude read-only inspection still passed. No generation, profile modification or real update installation/restart was triggered.
