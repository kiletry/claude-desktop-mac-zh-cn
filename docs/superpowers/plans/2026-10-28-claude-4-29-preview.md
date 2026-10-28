# Claude 4.29 Local Preview Plan

Goal: Build and open a working independent Chinese Claude 4.29.0 preview for the user.
Architecture: Retain the existing translation pipeline; expand ion-dist.asar only in the staging copy, localize and repack it, and update the matching Electron integrity record. Write desktop translations inside app.asar and retain unpacked native resources. Continue to prefer upstream Chinese and supplement missing messages locally.

Constraints: Do not modify /Applications/Claude.app or existing user profiles. Keep previous directory layouts working. Publication was initially excluded from the preview; the user subsequently authorized a GitHub release.

- [x] Add failing regression tests for archive inspection, archived frontend generation, nested shell catalogs, relocated menu runtime, and unpacked native-resource preservation.
- [x] Implement the archive layout and run the full Node suite (119 passed).
- [x] Refresh reference translations and audit new catalog coverage; supplement uncovered preview UI messages locally, preserving ICU structure (2,349 new records).
- [x] Build a real signed clone, verify both ASAR hashes and unchanged official source hashes, and launch it with an isolated user directory.
- [x] Present the actual running product and local app path (Chinese login page; signed-in Cowork flow not revalidated).
