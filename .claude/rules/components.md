---
paths:
  - "src/components/**/*.tsx"
  - "!src/components/ui/**"
---

# Component Rules (Palantir Style)

- Cards: `border border-border transition-colors duration-200 hover:border-primary/30` — no shadows, border-only
- Dialogs: no rounded corners (system default from --radius: 0.125rem)
- Buttons: no rounded corners, use `font-mono text-xs` for labels
- Stat boxes: `bg-accent/30 border border-border`
- Avatars in lists: `ring-1 ring-border`
- Brand color: `text-primary` — never hardcode `text-blue-600` or `text-violet-600`
- Category deep_work: violet is OK (it's the category color, not brand)
- CTA buttons: flat `bg-primary` — no gradients, no shadows
- Empty states: icon in `w-16 h-16 border border-border` container
- Error messages: wrap in `bg-destructive/5 border border-destructive/20`
- Typography: headers use `font-mono font-bold uppercase tracking-tight`
- Data values: use `font-mono tabular-nums` for numbers
- Section labels: `font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground`
- NEVER use opacity below /60 on text. Minimum contrast: `text-muted-foreground` (0.58 lightness on dark)
- Inactive icons: `text-muted-foreground` not `/50` or `/40`
