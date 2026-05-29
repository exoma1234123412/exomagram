---
paths:
  - "supabase/**/*.sql"
---

# Migration Rules

- Never modify existing migration files — always create a new `supabase/migration_vN_description.sql`
- Always use `IF NOT EXISTS` — migrations must be idempotent
- Always add RLS — no table without row-level security
- Always add indexes for org_id + commonly filtered columns
- Foreign keys cascade on delete
- UUIDs via `gen_random_uuid()`
- Timestamps use `TIMESTAMPTZ DEFAULT NOW()`
- After writing SQL, update `src/lib/types/database.ts`
