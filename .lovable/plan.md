
## Plan: Obiteljska grupa se mora otvoriti na vrhu

### Što je stvarni problem
Problem nije više u samom `Family` ekranu nego u chatu unutar detalja grupe.

Kad se grupa otvori:
- `FamilyGroupDetailView` pokuša otići na vrh
- ali `FamilyChat` nakon učitavanja poruka radi `bottomRef.scrollIntoView(...)`
- to ne skrola samo chat nego povuče i cijelu stranicu prema dolje

Zato ekran završi “na polovici” ili niže.

### Rješenje
Popravak ću napraviti ovako:

1. **`src/components/family/FamilyChat.tsx`**
   - maknuti `bottomRef.scrollIntoView(...)`
   - chat skrolati **samo unutar svojeg vlastitog scroll kontejnera**
   - koristiti `scrollRef.current.scrollTop = scrollRef.current.scrollHeight`
   - na prvo učitavanje bez animacije, na nove poruke može ostati smooth samo unutar chata

2. **`src/components/family/FamilyGroupDetailView.tsx`**
   - ostaviti/pojačati reset na vrh pri mountu detalja grupe
   - po potrebi ga prebaciti u robusniji oblik (`useLayoutEffect` ili `requestAnimationFrame`) da se izvrši nakon rendera, ali prije nego korisnik vidi pomak

### Rezultat
Kad korisnik klikne grupu u Obitelji:
- detalj grupe se otvara normalno
- vrh ekrana ostaje na vrhu
- chat i dalje može skrolati svoje poruke unutar svog okvira
- stranica se više neće sama povlačiti dolje

### Datoteke
- `src/components/family/FamilyChat.tsx`
- `src/components/family/FamilyGroupDetailView.tsx`

### Što ne diram
- logiku grupa
- navigaciju
- back gumb
- globalni `ScrollToTop`
