# Tehničke odluke

- Osobni izbornik kategorija ima jednu implementaciju: `TreeCategoryOptions` + `src/lib/categoryTreeOptions.ts` (skupine iz `categoryTree`); projektni i poslovni registar ostaju zasebni. Zašto: jedan izvor istine za dvije razine i stare ključeve.
- Automatsko razvrstavanje kategorija ide kroz jednu provjeru `categoryAssign` (zrcalo `src/lib` ↔ `_shared`); poslužiteljske funkcije bez klijenta koriste nove ključeve samo uz `SERVER_CATEGORY_TREE_ENABLED`. Zašto: stara objavljena aplikacija ne smije dobiti nove ključeve.
