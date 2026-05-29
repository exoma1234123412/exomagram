---
paths:
  - "src/app/(app)/**/page.tsx"
---

# Page Rules (Palantir Style)

Every page MUST follow these patterns:

- Container: `max-w-Xxl mx-auto px-4 sm:px-6 py-8`
- Header: `text-xl font-mono font-bold tracking-tight uppercase`
- Subtitle: `text-xs font-mono text-muted-foreground`
- Loading state: `animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase` with "Cargando..."
- Section spacing: `mb-8`
- Section labels: `font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40`
- Icons in headers: `text-primary` (never hardcode blue-600)
- Numbers: `font-mono tabular-nums tracking-tight`
- No rounded corners — system default (--radius: 0.125rem)
- No shadows — use borders for elevation

Every page MUST load org membership:
```tsx
const [orgId, setOrgId] = useState<string | null>(null);
useEffect(() => { /* loadOrg pattern */ }, []);
```

When creating a new page, also add a nav entry in `src/components/layout/sidebar.tsx`.
