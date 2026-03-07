export interface CustomCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_CATEGORY_ICONS = [
  // Shopping & Food
  '🛒', '🛍️', '🧺', '☕', '🍕', '🍔', '🍣', '🥗',
  '🍷', '🧁', '🍦', '🥐', '🥩', '🫕',
  // Home & Living
  '🏠', '🏡', '🪴', '🛋️', '🧹', '🔑', '🪑', '💡',
  // Transport
  '🚗', '⛽', '🚌', '🚲', '✈️', '🛳️', '🚕', '🛵',
  // Health & Wellness
  '💊', '🏥', '🧘', '🏋️', '💇', '🧴', '🦷', '👓',
  // Entertainment
  '🎮', '🎬', '🎵', '🎭', '🎨', '📺', '🎪', '🎸',
  // Education & Work
  '📚', '🎓', '💼', '📝', '🖥️', '💻', '📱', '🖨️',
  // Clothing & Accessories
  '👕', '👗', '👟', '👜', '⌚', '💍', '🧢', '👔',
  // Pets & Nature
  '🐕', '🐈', '🌱', '🌻', '🐠', '🦜',
  // Finance & Goals
  '💰', '🏦', '📊', '🎯', '⭐', '🏆', '💎', '📈',
  // Gifts & Special
  '🎁', '🎂', '💐', '🎊', '❤️', '🌈',
  // Kids & Family
  '👶', '🧸', '🎠', '🍼', '🏫', '🎒',
  // Tools & Services
  '🔧', '🔨', '⚙️', '🧰', '📦', '📮',
  // Other
  '🏖️', '⛷️', '🧳', '📸', '🎤', '🧪',
  // People
  '🙍‍♂️', '🙍‍♀️'
];

export const DEFAULT_CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', 
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#be123c', '#9333ea', '#4f46e5',
  '#0369a1', '#0d9488', '#15803d', '#b45309',
  '#6b7280', '#78716c', '#44403c', '#000000'
];
