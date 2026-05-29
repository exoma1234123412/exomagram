---
description: Find and fix common code quality issues across the codebase
---

Run these checks and auto-fix what you can:

1. **Unused imports** — Search for imported symbols that aren't used in the file. Remove them.
   ```bash
   grep -rn "import.*Loader2" src/ --include="*.tsx" | while read line; do
     file=$(echo "$line" | cut -d: -f1)
     count=$(grep -c "Loader2" "$file")
     if [ "$count" -eq 1 ]; then echo "UNUSED: $file"; fi
   done
   ```

2. **Brand color violations** — Find non-category `text-violet-600` or `text-violet-500`:
   ```bash
   grep -rn "text-violet-[56]00" src/ --include="*.tsx" | grep -v "deep_work\|CATEGORY\|deepWork\|Deep Work"
   ```
   Fix by replacing with `text-primary`.

3. **Old stat box pattern** — Find `bg-muted/50 rounded-lg`:
   ```bash
   grep -rn "bg-muted/50 rounded-lg" src/ --include="*.tsx"
   ```
   Fix by replacing with `bg-accent/40 rounded-xl`.

4. **Missing responsive padding** — Find pages with `px-4 py-8` missing `sm:px-6`:
   ```bash
   grep -rn 'px-4 py-8"' src/app/ --include="*.tsx" | grep -v "sm:px-6"
   ```

5. **Console logs** — Find and report (don't auto-remove):
   ```bash
   grep -rn "console\.\(log\|debug\)" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
   ```

6. Run `npx tsc --noEmit` to verify nothing broke.

Report: total issues found, total fixed, any remaining that need manual review.
