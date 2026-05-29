---
description: Scaffold a new API route with auth, org check, and error handling. Usage — /new-api route-name POST
---

Parse $ARGUMENTS for the route name and HTTP method (default POST).

1. Create `src/app/api/{route-name}/route.ts` with:
   - Import `createClient` from `@/lib/supabase/server`
   - Import `NextRequest, NextResponse` from `next/server`
   - Auth check: `supabase.auth.getUser()` → 401 if no user
   - Org membership check → 403 if no membership
   - Body parsing (for POST/PUT)
   - Try/catch with error response
   - Success response: `NextResponse.json({ success: true })`

2. Run `npx tsc --noEmit` to verify

3. Report: "API route created at /api/{route-name}. Method: {method}."
