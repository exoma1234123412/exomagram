---
description: Run every quality check — types, build, brand colors, design system, security, dead code. The full gate.
---

Run ALL checks sequentially. Report PASS/FAIL for each.

### 1. TypeScript
```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

### 2. Next.js Build
```bash
npx next build 2>&1 | tail -15
```

### 3. Brand Color Violations
```bash
grep -rn "text-violet-[56]00" src/ --include="*.tsx" | grep -v "deep_work\|CATEGORY\|deepWork\|Deep Work" | head -5
```

### 4. Design System Violations
```bash
grep -rn "bg-muted/50 rounded-lg" src/ --include="*.tsx" | head -5
grep -rn 'px-4 py-8"' src/app/ --include="*.tsx" | grep -v "sm:px-6" | head -5
```

### 5. Security
```bash
grep -rn "sk_live\|sk_test\|password.*=.*['\"]" src/ --include="*.ts" --include="*.tsx" | head -5
```

### 6. Console Logs
```bash
grep -rn "console\.\(log\|debug\)" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

### 7. Unused Imports (spot check)
```bash
grep -rn "import.*Loader2" src/ --include="*.tsx" | head -5
```

Report a summary table:
```
Check              Result
─────────────────────────
TypeScript         PASS/FAIL
Build              PASS/FAIL
Brand colors       PASS/FAIL
Design system      PASS/FAIL
Security           PASS/FAIL
Console logs       PASS/WARN (count)
Unused imports     PASS/WARN (count)

Overall: SHIP IT / BLOCKED
```
