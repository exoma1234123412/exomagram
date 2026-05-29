---
paths:
  - "src/components/**/*.tsx"
  - "!src/components/ui/**"
---

# Component Rules

- Cards: `transition-all duration-300 hover:shadow-lg hover:shadow-primary/5`
- Dialogs: `rounded-2xl` on DialogContent
- Buttons: `rounded-xl`
- Stat boxes: `bg-accent/40 rounded-xl`
- Avatars in lists: `ring-2 ring-background shadow-sm`
- Brand color: `text-primary` — never hardcode `text-blue-600` or `text-violet-600`
- Category deep_work: violet is OK (it's the category color, not brand)
- Gradient CTA buttons: `from-blue-600 to-blue-700 shadow-blue-600/25`
- Empty states: icon in `w-16 h-16 rounded-2xl bg-primary/10` container
- Error messages: wrap in `bg-destructive/5 border border-destructive/20 rounded-xl`
