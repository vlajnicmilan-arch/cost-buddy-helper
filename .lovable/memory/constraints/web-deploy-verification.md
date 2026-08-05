---
name: Provjera web objave ide preko hasha assetsa, ne preko version.json
description: version.json prati samo APK/nativnu ljusku; web objava se provjerava usporedbom naziva i sadržaja Vite assets datoteka sa živom stranicom
type: constraint
---

`public/version.json` mijenja se isključivo pri izradi novog APK-a (okidač za `android-build.yml`,
izvor za `publish-version-manifest`). **Web objava ga ne dira** — usporedba te verzije sa živom
stranicom ne dokazuje da je nova verzija weba gore.

Ispravna provjera:
1. `curl -s https://vmbalance.com/ | grep -oE '(src|href)="/assets/[^"]+"'`
2. `npx vite build`, isto nad `dist/index.html`
3. Nazivi se ne poklapaju → sumnja; konačan dokaz je skinuti živi chunk i tražiti niz koji
   postoji samo u novom kodu (npr. novi i18n ključ). Hash sam po sebi može varirati po build
   okolini i kad je izvor identičan.

Prijedlog za poslije launcha: commit SHA kroz Vite `define`, izložen u ekranu s verzijom.
