---
description: Scaffold a new page with the standard Exomagram patterns. Usage — /new-page feature-name "Page Title"
---

The user wants to create a new page. Parse $ARGUMENTS for the feature name and title.

1. Create `src/app/(app)/{feature-name}/page.tsx` with the standard skeleton:
   - `"use client"` directive
   - Org loading useEffect with branded pulse loader
   - Responsive container: `max-w-4xl mx-auto px-4 sm:px-6 py-8`
   - Header with `text-2xl font-bold tracking-tight`
   - Page icon using `text-primary`

2. Add a nav entry in `src/components/layout/sidebar.tsx`:
   - Pick an appropriate Lucide icon
   - Add to the correct nav section (mainNav, insightsNav, or socialNav)

3. Run `npx tsc --noEmit` to verify no type errors

4. Report: "Page created at /feature-name. Added to sidebar. Ready to build."
