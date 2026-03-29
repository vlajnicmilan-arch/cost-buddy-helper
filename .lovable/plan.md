

## Plan: Enable auto-update by default on first registration

### Analysis

After reviewing all the default values:
- **Sound notifications** — already default ON (no change needed)
- **Push notifications** — already default ON (no change needed)  
- **AI assistant** — already default ON (no change needed)
- **Auto-update** — defaults to OFF → **needs to be set to ON**

### Change

**File:** `src/pages/Onboarding.tsx`

At each point where onboarding completes (lines ~209-212, ~439-442, ~446-449), add:
```typescript
localStorage.setItem('pwa-auto-update', 'true');
```

This ensures that when a user finishes onboarding for the first time, automatic updates are enabled by default alongside the already-enabled sound notifications, push notifications, and AI assistant.

