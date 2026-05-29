---
paths:
  - "src/app/(app)/**/page.tsx"
---

# Page Rules

Every page MUST follow these patterns:

- Container: `max-w-Xxl mx-auto px-4 sm:px-6 py-8`
- Header: `text-2xl font-bold tracking-tight`
- Loading state: branded pulse loader (blue gradient square + "Cargando..." text)
- Section spacing: `mb-8`
- Icons in headers: `text-primary` (never hardcode blue-600)
- Numbers: `tabular-nums tracking-tight`

Every page MUST load org membership:
```tsx
const [orgId, setOrgId] = useState<string | null>(null);
useEffect(() => { /* loadOrg pattern */ }, []);
```

When creating a new page, also add a nav entry in `src/components/layout/sidebar.tsx`.
