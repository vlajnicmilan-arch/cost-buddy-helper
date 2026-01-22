export interface CustomPaymentSource {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_PAYMENT_ICONS = [
  '💳', '💵', '🏦', '📱', '💰', '🪙', '💎', '🏧',
  '📲', '💸', '🔐', '🎴', '🏪', '🛒', '💼', '🎁',
  '✨', '⭐', '🔷', '🔶', '🟢', '🔵', '🟣', '🟠'
];

export const DEFAULT_PAYMENT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', 
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#6b7280', '#78716c', '#000000'
];

// Suggested payment sources that user can quickly add
export const SUGGESTED_PAYMENT_SOURCES = [
  { name: 'PayPal', icon: '🅿️', color: '#003087' },
  { name: 'Google Pay', icon: '🔷', color: '#4285F4' },
  { name: 'Apple Pay', icon: '🍎', color: '#000000' },
  { name: 'Samsung Pay', icon: '📱', color: '#1428A0' },
  { name: 'Venmo', icon: '💙', color: '#008CFF' },
  { name: 'Zelle', icon: '💜', color: '#6D1ED4' },
  { name: 'Wise', icon: '🌍', color: '#00B386' },
  { name: 'N26', icon: '🏦', color: '#36A18B' },
  { name: 'Monzo', icon: '💳', color: '#FF5252' },
  { name: 'Klarna', icon: '🛍️', color: '#FFB3C7' },
  { name: 'Curve', icon: '⚫', color: '#000000' },
  { name: 'Skrill', icon: '💸', color: '#872E9A' },
];
