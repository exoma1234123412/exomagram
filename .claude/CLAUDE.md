# .claude/ Directory Guide

This directory contains all Claude Code configuration for Exomagram.

## What's here

```
.claude/
├── agents/          15 specialized AI workers (invoke with @agent-name)
├── skills/          10 slash commands (invoke with /skill-name)
├── rules/           5 auto-loading rules (fire when matching files are touched)
├── settings.json    3 hooks (run automatically on events)
└── this file        You're reading it
```

## First time? Start here

- Want to **build something**? → `@speedrun build X` or `@architect plan X`
- Want to **understand the code**? → `@onboard how does X work?`
- Want to **check quality**? → `/check-all`
- Want to **scaffold**? → `/new-page` or `/new-api`
- **Confused about anything**? → Read the root `CLAUDE.md`
