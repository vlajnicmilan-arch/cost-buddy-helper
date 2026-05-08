
## Cilj

Picker ikona u `QuickAddCategoryInline` (i drugdje gdje se koristi `DEFAULT_CATEGORY_ICONS`) proširiti na ~150 ikona s vidljivim naslovima grupa, balansirano po sekcijama i bez semantičkih duplikata.

## Što se mijenja

### 1. `src/types/customCategory.ts`
Refaktorirati `DEFAULT_CATEGORY_ICONS` iz `string[]` u **grupiranu strukturu**:

```ts
export interface CategoryIconGroup {
  key: string;        // i18n ključ, npr. "categoryIcons.groups.food"
  icons: string[];
}

export const DEFAULT_CATEGORY_ICON_GROUPS: CategoryIconGroup[] = [...];

// Backward compat - flat lista za stari kod
export const DEFAULT_CATEGORY_ICONS = DEFAULT_CATEGORY_ICON_GROUPS.flatMap(g => g.icons);
```

### 2. Sekcije i ikone (~150 ukupno)

| Grupa (i18n) | Ikone |
|---|---|
| **Hrana i piće** (8) | 🛒 ☕ 🍕 🍣 🥗 🍷 🍰 🍺 |
| **Restorani i izlasci** (6) | 🍽️ 🥡 🍻 🍹 🥂 🧋 |
| **Dom** (10) | 🏠 🛋️ 🛏️ 🪑 🛁 🚿 💡 🔌 🧹 🧯 |
| **Režije i računi** (8) | 💧 🔥 ⚡ 📡 📞 🗑️ 🧾 🏦 |
| **Transport** (10) | 🚗 ⛽ 🚌 🚆 🚲 🛵 🏍️ ✈️ 🛳️ 🅿️ |
| **Putovanja** (8) | 🧳 🏕️ 🏖️ 🏔️ 🏝️ 🗺️ 🧭 🎒 |
| **Zdravlje i wellness** (10) | 💊 🏥 🩺 💉 🦷 👓 🧘 🏋️ 💆 🧴 |
| **Ljepota i njega** (6) | 💇 💅 💄 🪒 🧼 🪞 |
| **Odjeća i moda** (8) | 👕 👗 👟 👜 ⌚ 💍 🧥 👠 |
| **Sport i rekreacija** (10) | ⚽ 🏀 🎾 🏊 🚴 🏃 ⛳ 🥋 🎿 🏂 |
| **Hobiji i kreativnost** (10) | 🎨 🎸 🎻 🎤 🎲 ♟️ 🧩 🧶 🪡 📷 |
| **Zabava** (10) | 🎮 🎬 🎵 🎭 📺 🎟️ 🎢 🎪 🃏 🎰 |
| **Edukacija** (8) | 📚 🎓 📝 🏫 🔬 🧪 🌐 ✏️ |
| **Posao i ured** (10) | 💼 🖥️ 📱 🖨️ 📅 📂 📎 ✂️ 🗂️ 📋 |
| **Financije** (8) | 💰 📊 📈 💳 💸 🏧 🧾 📉 |
| **Štednja i ciljevi** (6) | 🎯 ⭐ 🏆 💎 🐷 🪙 |
| **Pokloni i prilike** (8) | 🎁 🎂 💐 🎊 🍾 🎀 💌 🪅 |
| **Djeca i obitelj** (8) | 👶 🧸 🍼 🎠 🎒 🏫 🚸 🪀 |
| **Kućni ljubimci** (6) | 🐕 🐈 🐠 🐦 🦴 🐾 |
| **Vrt i priroda** (8) | 🌱 🪴 🌳 🌻 🌵 🍂 🐝 🦋 |
| **Tehnologija** (8) | 💻 ⌨️ 🖱️ 🎧 🔋 🛜 💾 🛰️ |
| **Alat i popravci** (8) | 🔧 🔨 ⚙️ 🧰 📦 🪛 🪚 🧱 |
| **Donacije i zajednica** (6) | 🤝 🕊️ 🛐 ⛪ 🎗️ ❤️ |

**Ukupno: ~152 ikone**, hrana/restorani svedeno s 14 → 14 (ali raspodijeljeno u 2 jasne grupe), dodane potpuno nove kategorije: Sport, Hobiji, Vrt, Tech, Donacije, Ljepota, Štednja, Režije.

### 3. `QuickAddCategoryInline` (icon picker dio)
Promijeniti renderiranje:
- Prije: `<div className="grid grid-cols-6">{DEFAULT_CATEGORY_ICONS.map(...)}</div>`
- Poslije: `DEFAULT_CATEGORY_ICON_GROUPS.map(group => (<><h4>{t(group.key)}</h4><div className="grid grid-cols-6">{group.icons.map(...)}</div></>))`

Naslov: `text-xs font-medium text-muted-foreground mt-3 mb-1.5`. Picker je već scrollable container.

### 4. i18n (`hr.json`, `en.json`, `de.json`)
Dodati `categoryIcons.groups.*` ključeve za 23 sekcije.

Primjer (hr):
```json
"categoryIcons": {
  "groups": {
    "food": "Hrana i piće",
    "diningOut": "Restorani i izlasci",
    "home": "Dom",
    "utilities": "Režije i računi",
    "transport": "Transport",
    ...
  }
}
```

## Što se NE mijenja

- `DEFAULT_CATEGORY_COLORS` — ostaje
- Logika spremanja kategorije (`useCustomCategories`) — ne dira se
- Postojeće korisničke kategorije s emoji ikonama koje više nisu u defaultu (npr. 🍔, 🥩) ostaju netaknute u DB
- Ostala mjesta koja importaju `DEFAULT_CATEGORY_ICONS` rade dalje (backward compat flat array)
- `useCustomIncomeCategories` picker — ako koristi istu listu, automatski dobiva novu strukturu

## Tehničke napomene

- Bez DB migracije
- Bez novih dependencija
- Picker već ima fiksnu visinu i `overflow-y-auto`, dodatne sekcije samo produže scroll
- 6 ikona po retku × max 10 ikona = max ~2 retka po grupi → vizualno čisto na 384px

## Otvoreno pitanje

Ima li slučajeva gdje se `DEFAULT_CATEGORY_ICONS` koristi i izvan picker-a (npr. random fallback ikona)? Tijekom implementacije provjerit ću `rg "DEFAULT_CATEGORY_ICONS"` i prilagoditi ako treba.
