---
description: Apply pending Supabase migrations and sync types
---

1. List all migration files: `ls -la supabase/migration*.sql`
2. Show the latest migration file content so the user can review
3. Remind the user to run: `npx supabase db push`
4. After the user confirms it ran, verify `src/lib/types/database.ts` matches the new schema
5. If types are out of date, update them
