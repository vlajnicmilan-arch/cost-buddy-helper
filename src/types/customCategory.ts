export interface CustomCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryIconGroup {
  /** i18n key under categoryIcons.groups.* */
  key: string;
  /** Fallback Croatian label if translation missing */
  fallback: string;
  icons: string[];
}

/**
 * Grouped icon catalogue for the category picker (~152 icons across 23 groups).
 * Designed for the custom-category creation flow — not used as a fixed catalogue
 * elsewhere in the app. Groups render with small section headers.
 */
export const DEFAULT_CATEGORY_ICON_GROUPS: CategoryIconGroup[] = [
  { key: 'food', fallback: 'Hrana i piće', icons: ['🛒', '☕', '🍕', '🍣', '🥗', '🍷', '🍰', '🍺'] },
  { key: 'diningOut', fallback: 'Restorani i izlasci', icons: ['🍽️', '🥡', '🍻', '🍹', '🥂', '🧋'] },
  { key: 'home', fallback: 'Dom', icons: ['🏠', '🛋️', '🛏️', '🪑', '🛁', '🚿', '💡', '🔌', '🧹', '🧯'] },
  { key: 'utilities', fallback: 'Režije i računi', icons: ['💧', '🔥', '⚡', '📡', '📞', '🗑️', '🧾', '🏦'] },
  { key: 'transport', fallback: 'Transport', icons: ['🚗', '⛽', '🚌', '🚆', '🚲', '🛵', '🏍️', '✈️', '🛳️', '🅿️'] },
  { key: 'travel', fallback: 'Putovanja', icons: ['🧳', '🏕️', '🏖️', '🏔️', '🏝️', '🗺️', '🧭', '🎒'] },
  { key: 'health', fallback: 'Zdravlje i wellness', icons: ['💊', '🏥', '🩺', '💉', '🦷', '👓', '🧘', '🏋️', '💆', '🧴'] },
  { key: 'beauty', fallback: 'Ljepota i njega', icons: ['💇', '💅', '💄', '🪒', '🧼', '🪞'] },
  { key: 'clothing', fallback: 'Odjeća i moda', icons: ['👕', '👗', '👟', '👜', '⌚', '💍', '🧥', '👠'] },
  { key: 'sport', fallback: 'Sport i rekreacija', icons: ['⚽', '🏀', '🎾', '🏊', '🚴', '🏃', '⛳', '🥋', '🎿', '🏂'] },
  { key: 'hobbies', fallback: 'Hobiji i kreativnost', icons: ['🎨', '🎸', '🎻', '🎤', '🎲', '♟️', '🧩', '🧶', '🪡', '📷'] },
  { key: 'entertainment', fallback: 'Zabava', icons: ['🎮', '🎬', '🎵', '🎭', '📺', '🎟️', '🎢', '🎪', '🃏', '🎰'] },
  { key: 'education', fallback: 'Edukacija', icons: ['📚', '🎓', '📝', '🏫', '🔬', '🧪', '🌐', '✏️'] },
  { key: 'workOffice', fallback: 'Posao i ured', icons: ['💼', '🖥️', '📱', '🖨️', '📅', '📂', '📎', '✂️', '🗂️', '📋'] },
  { key: 'finance', fallback: 'Financije', icons: ['💰', '📊', '📈', '💳', '💸', '🏧', '🧮', '📉'] },
  { key: 'savings', fallback: 'Štednja i ciljevi', icons: ['🎯', '⭐', '🏆', '💎', '🐷', '🪙'] },
  { key: 'gifts', fallback: 'Pokloni i prilike', icons: ['🎁', '🎂', '💐', '🎊', '🍾', '🎀', '💌', '🪅'] },
  { key: 'family', fallback: 'Djeca i obitelj', icons: ['👶', '🧸', '🍼', '🎠', '🚸', '🪀', '👨‍👩‍👧', '👵'] },
  { key: 'pets', fallback: 'Kućni ljubimci', icons: ['🐕', '🐈', '🐠', '🐦', '🦴', '🐾'] },
  { key: 'gardenNature', fallback: 'Vrt i priroda', icons: ['🌱', '🪴', '🌳', '🌻', '🌵', '🍂', '🐝', '🦋'] },
  { key: 'tech', fallback: 'Tehnologija', icons: ['💻', '⌨️', '🖱️', '🎧', '🔋', '🛜', '💾', '🛰️'] },
  { key: 'tools', fallback: 'Alat i popravci', icons: ['🔧', '🔨', '⚙️', '🧰', '📦', '🪛', '🪚', '🧱'] },
  { key: 'community', fallback: 'Donacije i zajednica', icons: ['🤝', '🕊️', '🛐', '⛪', '🎗️', '❤️'] },
];

/** Backward-compatible flat list (deduplicated, preserves group order). */
export const DEFAULT_CATEGORY_ICONS: string[] = Array.from(
  new Set(DEFAULT_CATEGORY_ICON_GROUPS.flatMap((g) => g.icons))
);

export const DEFAULT_CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#be123c', '#9333ea', '#4f46e5',
  '#0369a1', '#0d9488', '#15803d', '#b45309',
  '#6b7280', '#78716c', '#44403c', '#000000'
];
