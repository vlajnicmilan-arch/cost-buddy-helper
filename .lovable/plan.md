

## Problem

Fajl `version.json` se nalazi u korijenu projekta umjesto u `public/` folderu. Vite samo servira fajlove iz `public/` kao statičke resurse. Zato `/version.json` ne postoji na produkciji i provjera ažuriranja uvijek javlja "Provjera nije uspjela".

## Rješenje

1. **Premjestiti `version.json` u `public/` folder** -- tako će Vite automatski uključiti taj fajl u build i bit će dostupan na `https://cost-buddy-helper.lovable.app/version.json`.

2. **Objaviti (Publish) izmjenu** -- nakon premještanja, kliknuti Update u publish dijalogu da nova verzija ode na produkciju.

3. **Testirati na mobitelu** -- otvoriti nativnu aplikaciju i provjeriti da "Provjera ažuriranja" više ne javlja grešku.

## Tehnički detalj

- Fajl `version.json` sadrži `{ "version": "1.3.3" }`
- `PWAUpdatePrompt.tsx` na nativnoj platformi dohvaća `/version.json` s produkcijskog URL-a
- Kada fajl ne postoji (404), `fetchLatestVersion()` vraća `null` i prikazuje se toast greška
- Premještanje u `public/` folder rješava problem bez ikakvih drugih promjena u kodu

