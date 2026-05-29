---
description: Clean everything and rebuild from scratch — node_modules, .next cache, lockfile reinstall
disable-model-invocation: true
---

Ask the user to confirm before proceeding. This is destructive.

If confirmed:

1. `rm -rf .next`
2. `rm -rf node_modules`
3. `npm install`
4. `npx next build`
5. Report build result

If build fails, diagnose and fix.
