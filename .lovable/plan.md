

# Plan: Zamjena hero slike na landing stranici

## Trenutno stanje
- `hero-receipt-scan.webp` (27 KB) — generička slika skeniranja računa
- Koristi se u hero sekciji (desktop i mobile)

## Nova slika
**Pexels #6693631** — "Smartphone Calculator and Dollar Bills on Papers on Table Top"
- Autor: Tima Miroshnichenko
- Licenca: Pexels (Free to use, no attribution required)
- URL: `https://images.pexels.com/photos/6693631/pexels-photo-6693631.jpeg`
- Flat lay stil: mobitel s kalkulatorom, novčanice, financijski papiri na stolu

## Koraci

### 1. Preuzeti i komprimirati sliku
- Preuzeti original s Pexels-a
- Resize na 1200px širine (dovoljno za hero)
- Konvertirati u WebP (kvaliteta 80%)
- Spremiti kao `src/assets/hero-receipt-scan.webp` (zamjena postojeće)

### 2. Bez promjena koda
- Postojeći import (`import heroImage from '@/assets/hero-receipt-scan.webp'`) ostaje isti
- Alt tekst promijeniti u nešto prikladnije za novu sliku

## Datoteke za promjenu
| Datoteka | Akcija |
|---|---|
| `src/assets/hero-receipt-scan.webp` | Zamjena novom slikom |
| `src/pages/Landing.tsx` | Ažurirati alt tekst na img tagovima (2 mjesta) |

## Očekivani rezultat
- Profesionalnija hero slika koja bolje komunicira financijsko praćenje
- Ista ili manja veličina datoteke (WebP kompresija)
- Nema utjecaja na performanse ili bundle

