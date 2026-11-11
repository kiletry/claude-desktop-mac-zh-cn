# Fix generator update checks when GitHub API is rate limited

User report: clicking retry displays unable to get updates from GitHub. Reproduced with unauthenticated curl: HTTP403, X-RateLimit-Limit60, X-RateLimit-Remaining0, JSON message API rate limit exceeded. Public GitHub release page and raw repository are available. Existing v0.1.26 always requests api.github.com/releases/latest, so retry alone cannot recover while the shared IP quota remains empty.

Fix: publish API-schema-compatible `generator-update.json` alongside each stable release and use its public releases/latest/download URL as primary metadata source. Fall back to API on transport errors only, preserving identical strict decoding, stable version, exact repository link/asset/size checks. Neither source downloads DMG or checksum before explicit install. Manifest is generated from exact stable package version and built artifact sizes after SHA256SUMS; checksum entries cover the same three binary/source/translation assets as before. Manifest metadata uses HTTPS same release trust, without independent signature claims.

- [x] Regression tests RED: existing API-only implementation fails public-primary success, missing-public fallback ordering, dual error diagnosis, and metadata-only request assertion. Node manifest test fails missing script.
- [x] Implement primary public metadata + API fallback and release manifest generation/publication.
- [x] Full Swift/Node tests and independent review.
- [ ] Publish v0.1.27 and verify downloaded public asset hashes/bundle/source and real unauthenticated startup/manual check from current rate-limited network.

Maintain previous writable installed-target policy and explicit installation flow. No official Claude/profile/Gateway configuration changes. v0.1.26 cannot receive the client code fix through a rate-limited API, so supply new manual installation DMG.

Validation before publication: Node145/145; Swift31/31 with public v0.1.25 real DMG fixture enabled. RED log `/tmp/generator-feed-red.log`, GREEN `/tmp/generator-feed-green.log`, Node `/tmp/generator-feed-all-node.log`.
