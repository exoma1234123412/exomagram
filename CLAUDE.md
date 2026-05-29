@AGENTS.md

# Exomagram

Extreme work transparency platform. Teams log hour-by-hour work with proof, get trust scores, and hold each other accountable. UI in Spanish, brand color is Exoma Blue.

## Quick Start

```bash
npm run dev          # Start dev server on :3000
npx tsc --noEmit     # Type-check
npx next build       # Production build
```

Or use skills: `/dev`, `/build`, `/check-all`

## Tech Stack

- **Framework**: Next.js 16 (App Router), all pages are `"use client"`
- **Database**: Supabase (Postgres + Auth + Real-time + RLS)
- **Styling**: Tailwind CSS 4 + shadcn/ui (Base UI primitives)
- **Language**: TypeScript strict, UI copy in Spanish
- **Icons**: Lucide React
- **Dates**: date-fns with `es` locale

## Project Map

```
src/
  app/
    (app)/             → 50+ authenticated pages (see full list below)
    (auth)/            → login, signup
    (marketing)/       → landing page
    api/               → API routes (AI, cron, webhooks, export)
    public/            → shareable public views
  components/
    ui/                → shadcn primitives (button, card, dialog, input, etc.)
    layout/            → sidebar, mobile-nav, theme-toggle, keyboard-shortcuts
    timeline/          → time-entry-card, feed, filters, search, edit/verify dialogs
    dashboard/         → stat widgets, quick-log, daily-challenge, scores
    log-entry/         → entry dialog, bulk dialog, templates
    live/              → heartbeat-provider, live-status-bar
    reactions/         → entry-reactions
    alerts/            → missing-hours, smart-nudges
    closeout/          → daily-closeout-dialog
    profile/           → work-dna, energy-forecast, contribution-graph
    pomodoro/          → pomodoro-timer
    notifications/     → notification-bell
    accountability/    → spot-check
    org/               → meeting-tax, timezone-overlap
  lib/
    constants.ts       → categories, flags, reactions, achievements, config values
    types/database.ts  → ALL Supabase table types
    supabase/          → client.ts (browser), server.ts (API), middleware.ts
    utils.ts           → cn() helper
    streak-utils.ts    → streak calculation
supabase/
  migration*.sql       → database migrations (v1-v5)
  seed.sql             → test data (when generated)
.claude/
  agents/              → 15 custom agents
  skills/              → 10 slash commands
  rules/               → 5 path-scoped rules
  settings.json        → hooks (auto-typecheck, brand guard, rm warning)
```

## Key Files (read these first)

| File | What it tells you |
|------|-------------------|
| `src/lib/types/database.ts` | Every table, column, and type |
| `src/lib/constants.ts` | Categories, flags, reactions, achievements, config |
| `src/components/layout/sidebar.tsx` | All navigation items |
| `src/app/(app)/dashboard/page.tsx` | Main page — the pattern all pages follow |
| `src/app/globals.css` | Design system CSS variables and utilities |

## Design System (Palantir Style — Cyan-Steel + Black)

### Brand
- Primary: Cyan-steel (oklch hue ~210-220). Use `text-primary`, never hardcode `text-blue-600`
- No gradients, no shadows — flat, border-defined surfaces
- Category `deep_work` uses violet — this is the ONLY place violet appears

### Aesthetic
- **Angular**: Near-zero border-radius (--radius: 0.125rem)
- **Dark-first**: Pitch-black backgrounds, subtle cool borders
- **Monospace**: Headers, labels, data, nav — all `font-mono`
- **Dense**: Compact layouts, small type, tracked-out uppercase labels
- **Border-defined**: No box-shadows, cards/panels defined by borders
- **Grid backgrounds**: `bg-grid-palantir` and `bg-grid-dense` for data panels

### Patterns
- Page containers: `max-w-Xxl mx-auto px-4 sm:px-6 py-8`
- Page headers: `text-xl font-mono font-bold tracking-tight uppercase`
- Section labels: `font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40`
- Section spacing: `mb-8`
- Numbers: `font-mono tabular-nums tracking-tight`
- Cards: `border border-border transition-colors hover:border-primary/30` — no shadows
- Stat boxes: `bg-accent/30 border border-border`
- Buttons: flat, no rounded corners, `font-mono text-xs`
- Dialogs: system radius (near-square)
- Avatars in lists: `ring-1 ring-border`
- Loading: `animate-pulse font-mono text-xs tracking-widest uppercase` + "Cargando..."
- Empty: icon in `w-16 h-16 border border-border` container

### CSS Utilities (from globals.css)
`.glass` `.glass-subtle` `.bg-grid-palantir` `.bg-grid-dense` `.corner-marks` `.card-palantir` `.glow-line-top` `.glow-line-left` `.label-mono` `.data-cell` `.palantir-divider` `.status-dot` `.status-dot-active` `.animate-shimmer` `.animate-scan` `.safe-area-pb`

## Workflows

### Building a feature
```
1. @architect    → plan what to build, check what exists
2. @breakdown    → split into small PRs (<200 lines each)
3. @add-feature  → build it (or @speedrun for one-shot)
4. @guard        → run quality gate
5. @pr           → commit and create PR
```

### Fixing a bug
```
1. @debug        → find root cause
2. fix the code
3. /check-all    → verify nothing broke
4. @pr           → commit the fix
```

### Adding a database table
```
1. @supabase     → write migration + RLS + types
2. /db-push      → apply migration
3. @add-feature  → build the UI
```

### Polishing UI
```
1. @polish-ui    → apply design system patterns
2. /lint-fix     → auto-fix common issues
3. /check-all    → verify
```

### Scaffolding
```
/new-page feature-name "Title"   → creates page + sidebar nav
/new-api route-name POST         → creates API route with auth
```

## Agents Quick Reference

| Agent | When to use |
|-------|-------------|
| `@architect` | Before building — plan approach, check schema |
| `@breakdown` | Split big features into small PRs |
| `@add-feature` | Build pages, components, API routes |
| `@speedrun` | Build entire feature in one shot (Opus) |
| `@supabase` | Database queries, migrations, RLS |
| `@debug` | Diagnose errors and bugs |
| `@refactor` | Restructure code without changing behavior |
| `@polish-ui` | Apply design system, fix visual issues |
| `@perf` | Performance diagnostics and fixes |
| `@test` | Write tests |
| `@review-code` | Code review — security, quality, Spanish |
| `@guard` | Quality gate — pass/fail checks |
| `@pr` | Commits, PR descriptions |
| `@a11y` | Accessibility audit |
| `@onboard` | "How does X work?" — codebase explainer |

## Skills Quick Reference

| Command | What it does |
|---------|-------------|
| `/dev` | Start dev server |
| `/build` | Type-check + production build |
| `/check-all` | Full quality gate |
| `/lint-fix` | Auto-fix code issues |
| `/new-page` | Scaffold a new page |
| `/new-api` | Scaffold an API route |
| `/deploy-preview` | Deploy to Vercel |
| `/db-push` | Apply migrations |
| `/seed-data` | Generate test data |
| `/nuke-rebuild` | Clean reinstall + rebuild |

## Rules

Rules load automatically when you touch matching files:

| Rule | Fires on |
|------|----------|
| `pages.md` | `src/app/(app)/**/page.tsx` |
| `api-routes.md` | `src/app/api/**/route.ts` |
| `components.md` | `src/components/**/*.tsx` |
| `supabase.md` | `supabase/**/*.sql` |
| `spanish.md` | `src/**/*.tsx` |

## Hooks (automatic)

| Hook | Trigger | Effect |
|------|---------|--------|
| Auto-typecheck | After every file edit | Runs `tsc --noEmit` |
| Brand guard | Before `git commit` | **Blocks** if non-category violet found |
| Destructive warning | Before `rm -rf` | Prints warning |

## Core Database Tables

| Table | Purpose | Unique constraint |
|-------|---------|-------------------|
| `time_entries` | Hour-by-hour work log | (user_id, org_id, date, hour) |
| `daily_closeouts` | End-of-day summary | (user_id, org_id, date) |
| `trust_score_history` | Daily trust scores | (user_id, org_id, date) |
| `activity_streaks` | Logging streaks | (user_id, org_id) |
| `accountability_flags` | Auto-generated warnings | — |
| `entry_reactions` | Peer reactions | (entry_id, user_id) |
| `live_status` | Real-time presence | (user_id) |
| `notifications` | User notifications | — |
| `achievements` | Unlocked achievements | — |

## Category Colors (never change these)

| Category | Color | Emoji |
|----------|-------|-------|
| deep_work | violet | 🎯 |
| meeting | blue | 🤝 |
| review | amber | 👀 |
| admin | slate | 📋 |
| planning | emerald | 🗺️ |
| learning | pink | 📚 |
| break | green | ☕ |
| blocked | red | 🚫 |
