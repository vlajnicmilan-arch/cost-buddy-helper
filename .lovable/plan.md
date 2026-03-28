

# Plan: Optimizacija performansi aplikacije

## Pregled problema

Index.tsx ima **1051 linija** i mnogo je "težak" — učitava sve hookove, dijaloške prozore i logiku odjednom. `TransactionItem` poziva `useCustomPaymentSources()` i `useCustomCategories()` **unutar svake instance**, što znači N poziva za N transakcija.

## Optimizacije (po prioritetu)

### 1. Memoizacija TransactionItem komponente
- Omotaj `TransactionItem` u `React.memo` s custom comparatorom
- Trenutno se **svaka transakcija** re-renderira kad se bilo koji state promijeni (npr. selekcija jednog checkboxa re-renderira svih 50 vidljivih)

### 2. Izvlačenje hook podataka iz TransactionItem
- `TransactionItem` poziva `useCustomPaymentSources()` i `useCustomCategories()` — ovi hookovi se izvršavaju za **svaku** instancu komponente
- Prebaciti te podatke u `contextLookup` prop koji se već koristi, tako da se dohvaćaju jednom u roditelju i prosljeđuju kao prop

### 3. Smanjenje re-renderiranja na Index stranici
- Dodaj `React.memo` na `SummaryCard`, `SummarySection`, `PaymentSourcesSection`, `QuickLinksSection`
- Ove sekcije se nepotrebno re-renderiraju kad se npr. otvori/zatvori dijalog

### 4. Optimizacija framer-motion u TransactionItem
- Svaka transakcija kreira `useMotionValue`, `useTransform`, `useAnimation` — to su 3 hooka × 50 vidljivih stavki = 150 motion instanci
- Opcija: koristiti CSS swipe umjesto framer-motion, ili lazy-inicijalizirati motion samo kad korisnik počne swipeat

### 5. Razdvajanje Index.tsx na manje dijelove
- Izvuci "Business mode" renderiranje (~300 linija) u zasebnu komponentu `BusinessHomePage`
- Izvuci "Personal mode" transaction list sekciju u zasebnu komponentu
- Ovo smanjuje kognitivno opterećenje i pomaže React-u s granularnijim re-renderiranjem

## Tehnički detalji

**Faza 1** (najveći utjecaj):
- `TransactionItem`: dodaj `React.memo`, prebaci `customPaymentSources` i `customCategories` u `contextLookup` prop
- Procjena: smanjenje re-renderiranja za ~80% na transaction listi

**Faza 2** (srednji utjecaj):
- `React.memo` na `SummaryCard`, sekcijske komponente
- Izvuci business mode u `BusinessHomePage.tsx`

**Faza 3** (polish):
- Lazy-load framer-motion animacija za swipe
- Razmotri zamjenu `motion.div` s običnim `div` + CSS transitions za transaction items

## Što se NE mijenja
- Postojeća paginacija (50 stavki) — dobro radi
- Lazy loading ruta — već implementiran
- Virtualizacija u `VirtualTransactionList` — već postoji za specifične slučajeve
- Realtime subscription — već optimiziran

