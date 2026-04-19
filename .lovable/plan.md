

## Što gradimo (3 stvari u jednom tijeku)

### 1) Premjesti projekt — pridruženi član može sam mijenjati kontekst

Nakon prihvaćanja, član mora moći reći: "ovo želim u Personal" ili "premjesti u moj poslovni profil X". Trenutno: jednom prihvaćeno = zauvijek tu.

**Gdje**: u `ProjectMembersTab.tsx` (i/ili `ProjectDetailDialog`), za **trenutnog korisnika** (red ispod njegovog imena u listi članova), dodajemo mali "Lokacija kod mene" picker:
- Radio/segment: Personal / Business
- Ako Business → dropdown svojih `business_profiles`
- Spremanje u `project_members.member_context` + `member_business_profile_id` (sam svoj red)

**Backend**: postojeća RLS pravila moraju dozvoliti članu da update-a **samo svoj** red u `project_members` za polja `member_context` i `member_business_profile_id`. Provjerit ćemo i po potrebi dodati RLS politiku (`UPDATE` na vlastiti red).

### 2) Handle slučaj kad član nema poslovni profil

U `JoinProject.tsx` i `NotificationsDropdown.tsx` (gdje već postoji izbor konteksta pri prihvaćanju):
- Ako vlasnik je predložio **Business**, a član nema niti jedan business profile → prikazujemo info poruku: *"Voditelj predlaže poslovni mod, ali ti nemaš poslovni profil."*
- Dva CTA gumba:
  - **"Stavi u Osobne financije"** (fallback) — prihvati s `member_context = 'personal'`
  - **"Kreiraj poslovni profil"** — vodi na kreiranje (ili otvara mali dijalog za brzo kreiranje), pa nakon toga nastavlja prihvaćanje
- Isto logika i za istu situaciju nakon prihvaćanja u "Premjesti projekt" pickeru iz točke 1.

### 3) Spoji ulogu + početne tab-dozvole u jedan poziv (vlasnikov tijek)

Trenutno: vlasnik bira ulogu pri pozivu, ali **tab-dozvole** postavlja zasebno preko Shield ikone tek **nakon** što član prihvati. To je dva koraka i lako se zaboravi.

Promjena u `ProjectMembersTab.tsx` (sekcija "Pozovi članove"):
- Ispod izbora uloge dodajemo mali **collapsible/accordion** "Početne dozvole (opcionalno)" s checkboxima za optional tab-ove (`overview`, `milestones`, `workers`, `collaborators`, `funding`, `transactions`)
- Pametni defaulti po ulozi:
  - `member` → sve true
  - `viewer` → samo `overview` + `milestones` true, ostalo false
- Kad vlasnik klikne **"Pošalji pozivnicu"** ili **"Generiraj link"**, šaljemo i `default_permissions` JSON u `project_invitations`
- Pri prihvaćanju (u `accept-project-invitation` Edge funkciji) — odmah bulk-insertaj te permissions u `project_member_permissions` umjesto da Shield dialog kasnije

**Dodaci u bazi**:
- Nova kolona `project_invitations.default_permissions jsonb` (default `{}`)

**Update Edge funkcija**:
- `send-member-invitation` i `useProjectMembers.generateInviteLink` šalju `default_permissions`
- `accept-project-invitation` i `respond-to-invitation` čitaju `default_permissions` i bulk-upsertaju u `project_member_permissions`

## Kratko o redoslijedu

1. Migracija: `project_invitations.default_permissions` + RLS update na `project_members` (član može updateati svoj `member_context`/`member_business_profile_id`)
2. UI vlasnika: collapsible "Početne dozvole" u poziv-sekciji
3. Edge funkcije: prijenos i primjena `default_permissions`
4. UI člana: "Lokacija kod mene" picker + "premjesti" funkcija
5. UI prihvaćanja: handling kad nema business profila (poruka + 2 CTA)

## Što ostaje neriješeno (svjesno)

- Ne diramo postojeći Shield dialog — ostaje za naknadne izmjene
- Ne radimo "prebaci sve projekte iz Personal u Business" bulk akciju — to je drugi zahtjev

