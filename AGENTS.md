# Tehničke odluke

- Osobni izbornik kategorija ima jednu implementaciju: `TreeCategoryOptions` + `src/lib/categoryTreeOptions.ts` (skupine iz `categoryTree`); projektni i poslovni registar ostaju zasebni. Zašto: jedan izvor istine za dvije razine i stare ključeve.
