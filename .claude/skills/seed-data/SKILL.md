---
description: Generate realistic seed data for local development — org, members, time entries, reactions, streaks
---

Generate a SQL script that inserts realistic test data:

1. Read `src/lib/types/database.ts` and `src/lib/constants.ts` to understand valid values
2. Generate SQL for:
   - 1 organization ("Equipo Demo", slug: "demo")
   - 5 fake user profiles with realistic Spanish names
   - org_members linking all 5 to the org
   - 40 time_entries across the last 5 days (8 per day per user, varied categories)
   - Some entries with proof_urls, some without
   - Some late entries
   - 5 daily_closeouts
   - 10 entry_reactions
   - activity_streaks for each user
   - A few accountability_flags
3. Write the SQL to `supabase/seed.sql`
4. Remind the user to run: `psql $DATABASE_URL < supabase/seed.sql`
