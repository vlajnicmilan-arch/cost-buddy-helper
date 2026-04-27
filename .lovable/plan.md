## Problem

Na kartici Novčanika ("Kredit Vinka") iznos je prikazan u boji koju je korisnik odabrao za izvor plaćanja (crna). Pošto je tema aplikacije tamna (slate-900), iznos se gotovo gubi na pozadini i jedva je čitljiv.

Trenutno se boja iznosa postavlja iz `source.color` bez ikakve pozadinske zaštite:

```tsx
<span style={{ color: source.balance >= 0 ? source.color : undefined }}>
  {formatAmount(source.balance)}
</span>
```

## Rješenje

Dodati polu-prozirnu pozadinsku "pločicu" (chip/badge) iza iznosa na svakoj kartici Novčanika. Pločica je dovoljno svijetla da iznos bude čitljiv i kad je boja teksta jednaka pozadini, ali dovoljno prozirna da se vidi gradient pozadine kartice.

### Vizualni prikaz

```text
┌─────────────────────────────┐
│ 🪙  Kredit Vinka            │
│                             │
│  ┌──────────────────┐       │   ← polu-prozirna ploča
│  │ 30.000,00 €      │       │     (bg: foreground/8%)
│  └──────────────────┘       │
└─────────────────────────────┘
```

## Tehničke promjene

**Datoteka:** `src/components/home/PaymentSourcesSection.tsx`

- Element `<p>` koji prikazuje `formatAmount(source.balance)` (linije 126-133) zamotati u `inline-block` kontejner s:
  - `bg-foreground/[0.06]` (vrlo suptilno svijetla pozadina u dark mode, suptilno tamna u light mode — automatski se prilagođava temi)
  - `backdrop-blur-sm` da se pozadina kartice nazire kroz pločicu
  - `px-2 py-1 rounded-md` za udobno padding/zaobljenje
  - Suptilna `border border-foreground/5` za bolju definiciju ruba

- Tako iznos **uvijek** ima minimalni kontrast prema pozadini, neovisno o tome koju boju je korisnik odabrao za izvor (čak i čista crna ili boja blizu `slate-900`).

- Promjena se odnosi samo na "expanded" pločice ispod glavnog "Financije" trigger-a — glavni totalBalance ostaje nepromijenjen jer koristi `text-primary` (teal) koji uvijek ima dobar kontrast.

## Što ostaje isto

- Odabrana boja izvora plaćanja (`source.color`) i dalje boji tekst iznosa
- Lijevi border, ikona, naziv, gradient pozadina kartice — sve ostaje kako je
- Konverzija valuta i prikaz broja kartica nepromijenjeni

Nakon implementacije svi iznosi će biti čitljivi bez obzira na odabranu boju izvora.