---
paths:
  - "src/app/api/**/route.ts"
---

# API Route Rules

Every API route MUST:

1. Use `createClient` from `@/lib/supabase/server` (not client)
2. Authenticate: `const { data: { user } } = await supabase.auth.getUser()`
3. Return 401 if no user
4. Verify org membership before accessing org data
5. Return 403 if no membership
6. Never trust client-sent org_id — derive from membership
7. Admin-only routes must check `role === "owner" || role === "admin"`

Cron routes (`api/cron/*`) MUST verify `CRON_SECRET` header instead of user auth.

Response format: `NextResponse.json({ success: true, data: ... })` or `NextResponse.json({ error: "message" }, { status: N })`.
