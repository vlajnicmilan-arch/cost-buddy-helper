

## Plan: Zamjena AI avatara s uploadanom slikom + glow efekti

### Što se radi
Zamjena trenutnog SVG avatara s uploadanom slikom plavog orba, uz dinamičke glow/pulse CSS animacije ovisno o raspoloženju (mood).

### Promjene

| Datoteka | Promjena |
|---|---|
| `src/assets/vm_balance_avatar.png` | Kopirati uploadanu sliku u assets |
| `src/components/ai-avatar/FloatingAIAvatar.tsx` | Zamijeniti `<SVGAvatar>` s `<img>` tagom koji koristi importanu sliku. Ukloniti `useBlinking`/`useEyeMovement` importove. Dodati mood-ovisne glow efekte putem framer-motion `boxShadow` animacija |

### Glow efekti po raspoloženju

```text
neutral  → blagi plavi glow (0 0 20px cyan)
happy    → jači plavi glow + pulse (0 0 40px cyan)
thinking → pulsirajući glow (animira intenzitet gore-dolje)
worried  → crvenkasto-narančasti glow (0 0 25px orange)
proud    → zlatni intenzivni glow (0 0 45px gold)
```

### Tehnički detalji
- Slika se importa kao ES6 modul: `import avatarImg from "@/assets/vm_balance_avatar.png"`
- Glow se postiže putem framer-motion `animate={{ boxShadow: ... }}` na `<motion.div>` wrapperu oko `<img>`
- `<img>` tag dobiva `rounded-full` klasu za kružni oblik
- Postojeće floating animacije (y: [0, -4, 0]) i mood animacije (scale/rotate) ostaju nepromijenjene
- Pulse ring na dnu ostaje kao interaction hint
- Ne treba novi APK build — ovo je web-only promjena

