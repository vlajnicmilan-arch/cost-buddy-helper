

## Analiza zahtjeva

Korisnik želi da pri **slanju pozivnice na projekt** pošiljatelj može odlučiti:
1. **Gdje** će se projekt prikazati pridruženom članu — u **Osobnim financijama** ili u **Poslovnom modu** (i u kojem poslovnom profilu, ako ih ima više)
2. **Kakve dozvole/uloga** će član imati (već postoji djelomično: `manager`/`member`/`viewer` + tab permissions)

Trenutno se projekt uvijek pojavljuje u "Osobnim financijama" kod pozvanog korisnika jer projekti imaju jedan jedini `business_profile_id` vezan za vlasnika — pridruženi član nema svoj kontekst gdje to staviti.

## Istraživanje koje moram provesti prije plana

Trebam pogledati:
- `useProjectMembers.ts` (već vidim) i `generateInviteLink` — gdje se sprema rola
- `accept-project-invitation` Edge funkciju — što se događa pri prihvaćanju
- `ProjectShareDialog.tsx` / `ProjectCollaboratorDialog.tsx` — UI za slanje pozivnice
- `useProjects.ts` — kako se projekti filtriraju za prikaz (Personal vs Business)
- `JoinProject.tsx` — flow prihvaćanja
- Strukturu `project_members` tablice — postoji li već kolona za "vidljivost" / "kontekst"
- `BusinessModeView` / `PersonalModeView` — logika filtriranja projekata po profilu

