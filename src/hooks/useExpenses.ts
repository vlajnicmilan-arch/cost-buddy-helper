import { useState } from 'react';
import { Expense } from '@/types/expense';

const generateId = () => Math.random().toString(36).substring(2, 9);

const INITIAL_EXPENSES: Expense[] = [
  {
    id: generateId(),
    amount: 45.50,
    description: 'Konzum - tjedna kupovina',
    category: 'food',
    date: new Date(2026, 0, 21),
    type: 'expense',
  },
  {
    id: generateId(),
    amount: 15.00,
    description: 'Uber do posla',
    category: 'transport',
    date: new Date(2026, 0, 20),
    type: 'expense',
  },
  {
    id: generateId(),
    amount: 89.99,
    description: 'Nova majica - H&M',
    category: 'shopping',
    date: new Date(2026, 0, 19),
    type: 'expense',
  },
  {
    id: generateId(),
    amount: 12.00,
    description: 'Netflix pretplata',
    category: 'entertainment',
    date: new Date(2026, 0, 18),
    type: 'expense',
  },
  {
    id: generateId(),
    amount: 150.00,
    description: 'Račun za struju',
    category: 'bills',
    date: new Date(2026, 0, 17),
    type: 'expense',
  },
  {
    id: generateId(),
    amount: 2500.00,
    description: 'Plaća',
    category: 'other',
    date: new Date(2026, 0, 15),
    type: 'income',
  },
];

export const useExpenses = () => {
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);

  const addExpense = (expense: Omit<Expense, 'id'>) => {
    const newExpense: Expense = {
      ...expense,
      id: generateId(),
    };
    setExpenses(prev => [newExpense, ...prev]);
  };

  const deleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const totalExpenses = expenses
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalIncome = expenses
    .filter(e => e.type === 'income')
    .reduce((sum, e) => sum + e.amount, 0);

  const balance = totalIncome - totalExpenses;

  const expensesByCategory = expenses
    .filter(e => e.type === 'expense')
    .reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);

  return {
    expenses,
    addExpense,
    deleteExpense,
    totalExpenses,
    totalIncome,
    balance,
    expensesByCategory,
  };
};
