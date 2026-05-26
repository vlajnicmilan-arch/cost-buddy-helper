---
name: Project Worker Notifications
description: Workeri (project_members.role='worker') ne primaju broadcast push s projekta — samo manager/member dobivaju notify-project-transaction / notify-project-activity / notify-note-added
type: feature
---

Filtriranje `.neq('role', 'worker')` dodano u member fetch u:
- supabase/functions/notify-project-transaction/index.ts
- supabase/functions/notify-project-activity/index.ts
- supabase/functions/notify-note-added/index.ts

Owner se notificira preko zasebnog `project.user_id` puta (nikad nije worker svog projekta). `check-milestone-budgets` i `check-milestone-deadlines` već filtriraju samo `role='manager'`.

Razlog: radnik je dodan u tim radi vidljivosti svog dnevnika rada, ne treba opće broadcast push poruke o transakcijama/fazama. Ako se ikad doda per-milestone assignment workera, tu logiku treba zasebno proširiti.
