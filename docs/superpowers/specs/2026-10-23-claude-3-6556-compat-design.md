# Claude 3.6556.2 compatibility

## Intent and scope
Adapt the existing independent Chinese clone generator to the installed official Claude 3.6556.2. The accepted audit identified three stale matching rules and three missing settings messages. Preserve official app integrity, clone identity, older supported layouts, and refusal on ambiguous patch targets.

## Approach
Keep the existing generation pipeline. Match settings section properties without assuming adjacency, preserve native menu template arguments, and recognize renamed Electron preload bindings. Reuse the existing local translation fallback for the three missing messages. A translation-only refresh cannot fix the structural failures; replacing the entire localization mechanism would enlarge this repair unnecessarily.

## Delivery and verification
Add regression cases first, run Node and Swift tests, audit the actual installed resources, generate a temporary independent clone, and launch it with a fresh user-data directory. Build a local v0.1.17 generator DMG and source package with refreshed upstream translations. Do not publish or push automatically. Keep all Anthropic binaries out of release assets.

## Validation finding
The installed runtime reads its desktop catalog from `Contents/Resources/zh-CN.json`; the old generator incorrectly wrote the renderer catalog there. Map that destination to the existing desktop payload, verified with separate catalog fixtures and an actual menu inspection.
