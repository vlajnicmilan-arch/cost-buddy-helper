## Semafor: ispravan horizontalni redoslijed

Na pravom cestovnom semaforu položenom horizontalno boje idu slijeva nadesno: **crveno → žuto → zeleno**. Trenutno je u `ActiveProjectsStrip.tsx` (komponenta `BigTrafficLight`) obrnuto (zeleno → žuto → crveno).

### Promjena

`src/components/home/ActiveProjectsStrip.tsx`, linije 72–74 — zamijeni redoslijed `dot(...)` poziva tako da je crveno prvo, žuto u sredini, zeleno zadnje. Logika, boje, pulsiranje i a11y label ostaju iste.

```tsx
{dot(level === 'red', 'hsl(var(--destructive))', 'traffic-dot-crit')}
{dot(level === 'yellow', 'hsl(var(--warning))', 'traffic-dot-warn')}
{dot(level === 'green', 'hsl(var(--income))')}
```

To je sve — jedna mikroizmjena, bez i18n/RLS/DB promjena.
