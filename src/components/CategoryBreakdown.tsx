import { CATEGORIES } from '@/types/expense';
import { motion } from 'framer-motion';

interface CategoryBreakdownProps {
  expensesByCategory: Record<string, number>;
  total: number;
}

export const CategoryBreakdown = ({ expensesByCategory, total }: CategoryBreakdownProps) => {
  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const sortedCategories = CATEGORIES
    .map(cat => ({
      ...cat,
      amount: expensesByCategory[cat.id] || 0,
      percentage: total > 0 ? ((expensesByCategory[cat.id] || 0) / total) * 100 : 0,
    }))
    .filter(cat => cat.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (sortedCategories.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Po kategorijama</h3>
        <p className="text-muted-foreground text-sm">Još nema troškova</p>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6"
    >
      <h3 className="text-lg font-semibold mb-4">Po kategorijama</h3>
      <div className="space-y-4">
        {sortedCategories.map((cat, index) => (
          <motion.div 
            key={cat.id} 
            className="space-y-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{cat.icon}</span>
                <span className="text-sm font-medium">{cat.name}</span>
              </div>
              <span className="text-sm font-mono font-medium text-muted-foreground">
                {formatAmount(cat.amount)}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${cat.percentage}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                style={{
                  backgroundColor: `hsl(var(--${cat.color}))`,
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
