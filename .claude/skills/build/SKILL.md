---
description: Run a full production build and report any errors
---

1. Run `npx tsc --noEmit --pretty` to check types
2. If type errors exist, report them and STOP
3. Run `npx next build`
4. Report build result — total pages, any warnings, build time
5. If build fails, read the error and suggest a fix
