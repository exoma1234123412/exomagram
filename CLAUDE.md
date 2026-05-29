@AGENTS.md

# Exomagram

AI-native extreme work transparency platform. Teams log hour-by-hour work with proof, Claude AI validates every entry, generates real-time psychological pressure, and produces executive intelligence. UI in Spanish, brand color is Exoma Blue (cyan-steel).

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
- **AI**: `@anthropic-ai/sdk` — Sonnet 4-6 (analysis), Haiku 4-5 (real-time reactions)
- **Styling**: Tailwind CSS 4 + shadcn/ui (Base UI primitives)
- **Language**: TypeScript strict, UI copy in Spanish
- **Icons**: Lucide React
- **Dates**: date-fns with `es` locale

## Architecture Overview

```
99 pages · 55 API routes · 100+ components · 19 migrations · 5 cron jobs
```

```
src/
  app/
    (app)/             → 99 authenticated pages
    (auth)/            → login, signup
    (marketing)/       → landing page
    api/               → 55 API routes
      ai/              → AI analysis, enrichment, reports, deep-analysis
      claude-*         → 10 Claude AI endpoints (brain, audit, react, coach, etc.)
      cron/            → 5 scheduled jobs (half-hour, hourly, daily, emails, auto-engine)
      v1/              → Public API (entries, stats)
  components/
    ui/                → shadcn primitives
    layout/            → sidebar (collapsible), mobile-nav, theme-toggle
    log-entry/         → entry dialog (25-field form + Claude validation)
    dashboard/         → stat widgets, quick-log, health-checkin, scores
    psychology/        → 6 behavioral reinforcement widgets
    ai/                → ai-insight-panel, claude-followup
    tracking/          → entry-validator (Claude gatekeeper)
    social/            → 17 social pressure components
    pressure/          → 16 psychological pressure components
    accountability/    → 11 accountability components
    intel/             → 7 intelligence tab components
    timeline/          → entry cards, feed, filters
    live/              → heartbeat, live-status-bar
    feed/              → public-feed (AI + human)
    profile/           → work-dna, energy-forecast, contribution-graph
  lib/
    constants.ts       → categories, flags, reactions, achievements, 30+ config maps
    types/database.ts  → 40+ Supabase table types (1,310 lines)
    supabase/          → client.ts (browser), server.ts (API), middleware.ts
    utils.ts           → cn(), formatHour(), getTodayMTY(), timeAgo()
    streak-utils.ts    → streak calculation
    ai-context-builder.ts → shared AI data gathering
supabase/
  migration*.sql       → 19 database migrations (v1-v15)
```

## Key Files (read these first)

| File | What it tells you |
|------|-------------------|
| `src/lib/types/database.ts` | Every table, column, and type (1,310 lines) |
| `src/lib/constants.ts` | Categories, flags, tools, locations, psychology labels |
| `src/components/layout/sidebar.tsx` | All 31 navigation items |
| `src/app/(app)/dashboard/page.tsx` | Main page — the pattern all pages follow |
| `src/app/globals.css` | Design system CSS variables and utilities |
| `src/app/api/cron/half-hour/route.ts` | 30-min AI surveillance with 30 psychology techniques |
| `src/app/api/validate-entry/route.ts` | Claude entry gatekeeper |

## Navigation (31 sidebar items)

| Section | Pages |
|---------|-------|
| **Core** | Alertas, Dashboard, Proyectos |
| **Data** | Analítica, Hub de Datos, AI Center, Reportes |
| **Work** | Auto-Standup, Focus, Reflexión |
| **Intel** | Vigilancia, Intel, Bienestar, Crónica, Consistencia, Contradicciones |
| **AI** | Ask Claude, Conflictos, Predicciones |
| **Pressure** | Arena, Presión, Precio/Hora, Intervención, Promesas Rotas, Contrato Vergüenza |
| **Trust** | Confiabilidad, Reciprocidad, Peer Verdict |
| **Progress** | Progreso (XP) |
| **Config** | Perfil, Ajustes |

## AI Systems (AI-Native Platform)

### Claude Entry Gatekeeper
Every entry goes through Claude (Haiku) before saving:
1. User submits → Claude validates quality, specificity, originality
2. If approved (score >= 60) → entry saved normally
3. If rejected → user can edit and retry
4. After attempt 2+ → "No fui productivo" button → entry saved as `flagged` with penalty

### 30-Minute AI Surveillance (`/api/cron/half-hour`)
Runs `*/30 * * * *`. For each org:
- Scans 20+ data sources (entries, health, focus, git, comms, profiles, baselines)
- Detects 18 anomaly types
- Applies **30 psychological techniques** to craft messages
- Sends public shame (with names) + private coaching (health only)

### 30 Psychological Techniques

| # | Technique | Use Case |
|---|-----------|----------|
| 1 | LOSS_FRAMING | Always frame as loss, never gain |
| 2 | SUNK_COST | "12 days invested. Throw it away?" |
| 3 | ENDOWMENT | "Your Trust 87 is YOURS" |
| 4 | PAIN_OF_PAYING | "Each empty hour = -3 points" |
| 5 | SOCIAL_PROOF | "4/5 already did. Only you left" |
| 6 | CONTRAST | Side-by-side with top performer |
| 7 | SPOTLIGHT | "The whole team SEES your 0h" |
| 8 | RECIPROCITY | "They verified 3 of yours. You: 0" |
| 9 | COMPETITIVE_AROUSAL | Head-to-head matchups |
| 10 | SOCIAL_FACILITATION | "Claude monitors in real-time" |
| 11 | IDENTITY | "Professionals don't leave 4h unexplained" |
| 12 | COMMITMENT | Quote their own promises against them |
| 13 | COGNITIVE_DISSONANCE | "You say it matters. 0 evidence says otherwise" |
| 14 | STATUS_QUO_BIAS | "Standup before 9 is the norm here" |
| 15 | GOAL_GRADIENT | "2h left. You're at 75%" |
| 16 | PROGRESS_PRINCIPLE | Celebrate micro-wins |
| 17 | FOOT_IN_THE_DOOR | "Just 1 hour with evidence. Can you?" |
| 18 | DOOR_IN_THE_FACE | Ask absurd, then real |
| 19 | SCARCITY | "Streak EXPIRES in 3 hours" |
| 20 | TEMPORAL_LANDMARKS | Monday = fresh start |
| 21 | PEAK_END_RULE | Last message shapes day memory |
| 22 | PLANNING_FALLACY | "You say 4h more. History: 1.2h" |
| 23 | HOT_COLD_GAP | "9am: plan NOW. 5pm you won't want to" |
| 24 | NARRATIVE | "3 weeks ago: worst streak. Today: 12 days. YOUR story" |
| 25 | VARIABLE_REINFORCEMENT | Unpredictable praise = addiction |
| 26 | ANCHORING | Compare to their own peak |
| 27 | MORAL_LICENSING | "Yesterday A+. 60% of A+ days → C next" |
| 28 | REACTANCE | "I don't think you can do 3h deep work" |
| 29 | LEARNED_HELPLESSNESS_PREVENTION | 3+ bad days → switch to competence |
| 30 | IMPLEMENTATION_INTENTION | "If not by 3pm → B to C" |

### Public Shame Rules
Performance issues are PUBLIC with full names. Health/wellbeing stays PRIVATE.

**Public (with names):** 0 hours, rejected entries, broken promises, no standup, no closeout, Trust < 50, broken streaks, accumulated flags, 0 evidence, ghost status, meeting overload, git mismatches

**Private:** bad sleep, high stress, low mood, personal issues, coaching tips

### AI API Routes

| Route | Model | Purpose |
|-------|-------|---------|
| `/api/validate-entry` | Haiku | Entry gatekeeper — blocks vague entries |
| `/api/claude-react` | Haiku | Real-time reactions to events |
| `/api/claude-brain` | Sonnet | Universal AI query (ask, lie_detector, etc.) |
| `/api/claude-audit` | Sonnet | Daily team accountability audit |
| `/api/claude-coach` | Sonnet | Personalized coaching |
| `/api/ai/analyze-entry` | Sonnet | Deep single-entry analysis |
| `/api/ai/enrich` | Sonnet | Batch data enrichment |
| `/api/ai/executive-report` | Sonnet | AI narrative reports (daily/weekly/monthly) |
| `/api/ai/deep-analysis` | Sonnet | Cross-dimensional correlations |
| `/api/ai-notifications` | Sonnet | Private + public AI notifications |
| `/api/ai-process-day` | Sonnet | Nightly per-person analysis |

## Data Collection (25 variables per hour)

### Entry Form Fields
| Category | Fields |
|----------|--------|
| **Core** | date, hour, category, title, description, project, proof_urls |
| **Subjective** | mood, energy, difficulty, focus_quality, value_rating, stress_level, confidence |
| **Quantitative** | interruptions, context_switches |
| **Classification** | output_type, tools_used, location, client_facing, could_be_async |
| **Context** | collaborators, blocker_detail, skills_tags, learning_notes |

### Daily Collection Sources
| Source | Variables | Frequency |
|--------|-----------|-----------|
| Time entries | 25 per hour | Per hour |
| Daily health | 15 (sleep, exercise, stress, clarity, motivation) | Daily |
| Daily closeout | 4 (summary, blockers, plan, mood) | Daily |
| Focus sessions | 12 per session | Per session |
| Communication log | 11 (messages, meetings, response time) | Daily |
| Git daily metrics | 15 (commits, LOC, PRs, reviews) | Daily |
| Weekly reflection | 18 (wins, struggles, ratings, growth) | Weekly |

## Cron Jobs

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/half-hour` | `*/30 * * * *` | AI surveillance + psychology messaging |
| `/api/cron/hourly` | `0 * * * *` | AI autopilot + notifications |
| `/api/cron/daily` | `0 6 * * *` | Flags, digest, AI review, achievements |
| `/api/cron/emails` | `30 17 * * 1-5` | Email digests, reminders |
| `/api/cron/auto-engine` | `15 * * * *` | Automated actions |

## Core Database Tables

| Table | Purpose |
|-------|---------|
| `time_entries` | Hour-by-hour work log (25 fields) |
| `daily_closeouts` | End-of-day summaries |
| `trust_score_history` | Daily trust scores |
| `activity_streaks` | Logging streaks |
| `accountability_flags` | Auto-generated warnings (10 types) |
| `entry_reactions` | Peer reactions |
| `daily_health` | Daily wellness check-in |
| `weekly_reflections` | Weekly retrospectives |
| `focus_sessions` | Deep work session tracking |
| `communication_log` | Daily comms metrics |
| `git_daily_metrics` | Git activity per day |
| `daily_aggregates` | Pre-computed daily rollups (40+ fields) |
| `weekly_aggregates` | Pre-computed weekly rollups |
| `personal_baselines` | 30-day personal norms |
| `ai_daily_insights` | AI analysis per person per day |
| `ai_work_profiles` | Persistent AI personality profiles |
| `ai_reviews` | All AI analysis results |
| `public_feed` | Team feed (AI + human) |
| `nudge_outcomes` | Psychology technique effectiveness tracking |

## Dashboard Psychology Components

| Component | Technique | What it shows |
|-----------|-----------|---------------|
| `SpotlightIndicator` | SPOTLIGHT | "Claude observa" — always visible |
| `GoalGradient` | GOAL_GRADIENT | Progress bar toward 8h target |
| `ScarcityTimer` | SCARCITY | Countdown to 6pm + streak expiration |
| `SunkCostCounter` | SUNK_COST | Investment counter (streak, hours, trust) |
| `CompetitiveWidget` | COMPETITIVE_AROUSAL | Head-to-head vs closest rival |
| `SocialProofBar` | SOCIAL_PROOF | Team completion rates |

## Design System (Palantir Style — Cyan-Steel + Black)

### Brand
- Primary: Cyan-steel (oklch hue ~210-220). Use `text-primary`, never hardcode `text-blue-600`
- No gradients, no shadows — flat, border-defined surfaces
- Category `deep_work` uses violet — the ONLY place violet appears

### Patterns
- Container: `max-w-Xxl mx-auto px-4 sm:px-6 py-8`
- Header: `text-xl font-mono font-bold tracking-tight uppercase`
- Section labels: `font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground`
- Numbers: `font-mono tabular-nums tracking-tight`
- Cards: `border border-border` — no shadows
- Loading: `animate-pulse font-mono text-xs tracking-widest uppercase` + "Cargando..."

### CSS Utilities
`.glass` `.bg-grid-palantir` `.bg-grid-dense` `.corner-marks` `.card-palantir` `.glow-line-top` `.label-mono` `.data-cell` `.palantir-divider` `.status-dot` `.animate-shimmer` `.animate-scan` `.animate-streak-fire` `.animate-danger-pulse` `.animate-countdown-tick` `.animate-eye-blink`

## Category Colors (never change these)

| Category | Color | Code |
|----------|-------|------|
| deep_work | violet | DW |
| meeting | blue | MT |
| review | amber | CR |
| admin | slate | AD |
| planning | emerald | PL |
| learning | pink | LR |
| break | green | BK |
| blocked | red | BL |
