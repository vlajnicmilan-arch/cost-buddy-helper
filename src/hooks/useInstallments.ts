import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { InstallmentPlan, Installment, InstallmentPlanWithProgress } from '@/types/installment';
import { toast } from 'sonner';
import { addMonths, startOfMonth, endOfMonth, isWithinInterval, isBefore, startOfToday } from 'date-fns';

interface CreateInstallmentPlanInput {
  description: string;
  total_amount: number;
  installment_count: number;
  first_payment_date: Date;
  category: string;
  payment_source?: string;
  payment_source_card_id?: string | null;
  type: 'expense' | 'income';
}

export const useInstallments = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const [plans, setPlans] = useState<InstallmentPlanWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const isLocalMode = storageMode === 'local';

  const fetchPlans = useCallback(async () => {
    if (isLocalMode) {
      // Local mode - use localStorage
      const stored = localStorage.getItem('installment_plans');
      const storedInstallments = localStorage.getItem('installments');
      
      if (stored) {
        const localPlans: InstallmentPlan[] = JSON.parse(stored).map((p: any) => ({
          ...p,
          first_payment_date: new Date(p.first_payment_date)
        }));
        
        const localInstallments: Installment[] = storedInstallments 
          ? JSON.parse(storedInstallments).map((i: any) => ({
              ...i,
              due_date: new Date(i.due_date)
            }))
          : [];

        const plansWithProgress = localPlans.map(plan => {
          const planInstallments = localInstallments.filter(i => i.plan_id === plan.id);
          const paidInstallments = planInstallments.filter(i => i.status === 'paid');
          const paidAmount = paidInstallments.reduce((sum, i) => sum + i.amount, 0);
          const nextInstallment = planInstallments
            .filter(i => i.status === 'planned')
            .sort((a, b) => a.due_date.getTime() - b.due_date.getTime())[0];

          return {
            ...plan,
            installments: planInstallments,
            paidCount: paidInstallments.length,
            totalCount: planInstallments.length,
            paidAmount,
            remainingAmount: plan.total_amount - paidAmount,
            nextInstallment
          };
        });

        setPlans(plansWithProgress);
      }
      setLoading(false);
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch plans with installments
      const { data: plansData, error: plansError } = await supabase
        .from('installment_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (plansError) throw plansError;

      if (!plansData || plansData.length === 0) {
        setPlans([]);
        setLoading(false);
        return;
      }

      const planIds = plansData.map(p => p.id);
      const { data: installmentsData, error: installmentsError } = await supabase
        .from('installments')
        .select('*')
        .in('plan_id', planIds)
        .order('installment_number', { ascending: true });

      if (installmentsError) throw installmentsError;

      const plansWithProgress: InstallmentPlanWithProgress[] = plansData.map(plan => {
        const planInstallments: Installment[] = (installmentsData || [])
          .filter(i => i.plan_id === plan.id)
          .map(i => ({
            ...i,
            due_date: new Date(i.due_date),
            amount: Number(i.amount),
            status: i.status as 'planned' | 'paid'
          }));
        
        const paidInstallments = planInstallments.filter(i => i.status === 'paid');
        const paidAmount = paidInstallments.reduce((sum, i) => sum + i.amount, 0);
        const nextInstallment = planInstallments
          .filter(i => i.status === 'planned')
          .sort((a, b) => a.due_date.getTime() - b.due_date.getTime())[0];

        return {
          ...plan,
          type: plan.type as 'expense' | 'income',
          total_amount: Number(plan.total_amount),
          first_payment_date: new Date(plan.first_payment_date),
          installments: planInstallments,
          paidCount: paidInstallments.length,
          totalCount: planInstallments.length,
          paidAmount,
          remainingAmount: Number(plan.total_amount) - paidAmount,
          nextInstallment
        };
      });

      setPlans(plansWithProgress);
    } catch (error) {
      console.error('Error fetching installment plans:', error);
      toast.error('Greška pri učitavanju planova rata');
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode]);

  // Auto-mark due installments as paid
  const autoMarkDueInstallments = useCallback(async () => {
    const today = startOfToday();

    if (isLocalMode) {
      const stored = localStorage.getItem('installments');
      if (!stored) return false;
      const installments = JSON.parse(stored);
      let changed = false;
      const updated = installments.map((i: any) => {
        if (i.status === 'planned' && isBefore(new Date(i.due_date), new Date(today.getTime() + 86400000))) {
          changed = true;
          return { ...i, status: 'paid', paid_at: new Date(i.due_date).toISOString() };
        }
        return i;
      });
      if (changed) {
        localStorage.setItem('installments', JSON.stringify(updated));
      }
      return changed;
    }

    if (!user) return false;

    try {
      const { data: dueInstallments } = await supabase
        .from('installments')
        .select('id, due_date')
        .eq('user_id', user.id)
        .eq('status', 'planned')
        .lte('due_date', today.toISOString().split('T')[0]);

      if (dueInstallments && dueInstallments.length > 0) {
        for (const inst of dueInstallments) {
          await supabase
            .from('installments')
            .update({ status: 'paid', paid_at: inst.due_date })
            .eq('id', inst.id)
            .eq('user_id', user.id);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error auto-marking installments:', error);
      return false;
    }
  }, [user, isLocalMode]);

  // One-time backfill: create missing expense records for orphan installment plans & clean duplicates
  const backfillMissingExpenses = useCallback(async () => {
    if (isLocalMode || !user) return;

    try {
      // Fetch all installment plans
      const { data: allPlans } = await supabase
        .from('installment_plans')
        .select('id, description, total_amount, category, payment_source, payment_source_card_id, type, first_payment_date, installment_count')
        .eq('user_id', user.id);

      if (!allPlans || allPlans.length === 0) return;

      // Fetch ALL expenses with 'rata' in note
      const { data: existingExpenses } = await supabase
        .from('expenses')
        .select('id, note, description, amount, created_at')
        .eq('user_id', user.id)
        .like('note', '%rata%')
        .order('created_at', { ascending: true });

      // Build a map: key = "description|amount|note" -> list of expense ids
      const expenseMap = new Map<string, string[]>();
      for (const e of existingExpenses || []) {
        const key = `${e.description}|${e.amount}|${e.note}`;
        const ids = expenseMap.get(key) || [];
        ids.push(e.id);
        expenseMap.set(key, ids);
      }

      // Delete duplicates (keep first, delete rest)
      const idsToDelete: string[] = [];
      for (const [, ids] of expenseMap) {
        if (ids.length > 1) {
          idsToDelete.push(...ids.slice(1));
        }
      }

      if (idsToDelete.length > 0) {
        await supabase
          .from('expenses')
          .delete()
          .in('id', idsToDelete);
        console.log(`Cleaned up ${idsToDelete.length} duplicate installment expenses`);
      }

      // Now check which plans still need an expense record
      const existingDescriptions = new Set(
        (existingExpenses || [])
          .filter(e => !idsToDelete.includes(e.id))
          .map(e => `${e.description}|${e.amount}`)
      );

      const missingPlans = allPlans.filter(plan => 
        !existingDescriptions.has(`${plan.description}|${plan.total_amount}`)
      );

      if (missingPlans.length === 0) return;

      const expensesToInsert = missingPlans.map(plan => ({
        user_id: user.id,
        amount: Number(plan.total_amount),
        description: plan.description,
        category: plan.category,
        date: plan.first_payment_date,
        type: plan.type || 'expense',
        payment_source: plan.payment_source,
        payment_source_card_id: plan.payment_source_card_id,
        note: `${plan.installment_count}x rata`,
      }));

      const { error } = await supabase
        .from('expenses')
        .insert(expensesToInsert);

      if (error) {
        console.error('Error backfilling installment expenses:', error);
      }
    } catch (error) {
      console.error('Error in backfillMissingExpenses:', error);
    }
  }, [user, isLocalMode]);

  useEffect(() => {
    const run = async () => {
      const changed = await autoMarkDueInstallments();
      await backfillMissingExpenses();
      await fetchPlans();
      if (changed) await fetchPlans();
    };
    run();
  }, [autoMarkDueInstallments, backfillMissingExpenses, fetchPlans]);

  const createPlan = async (input: CreateInstallmentPlanInput): Promise<InstallmentPlan | null> => {
    const { total_amount, installment_count, first_payment_date } = input;
    
    // Calculate installment amount with rounding adjustment for last installment
    const baseAmount = Math.floor((total_amount / installment_count) * 100) / 100;
    const totalBase = baseAmount * (installment_count - 1);
    const lastAmount = Math.round((total_amount - totalBase) * 100) / 100;

    if (isLocalMode) {
      const planId = crypto.randomUUID();
      const newPlan: InstallmentPlan = {
        id: planId,
        user_id: 'local',
        ...input,
        first_payment_date: input.first_payment_date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Generate installments
      const installments: Installment[] = [];
      for (let i = 0; i < installment_count; i++) {
        const dueDate = addMonths(first_payment_date, i);
        const amount = i === installment_count - 1 ? lastAmount : baseAmount;
        
        installments.push({
          id: crypto.randomUUID(),
          plan_id: planId,
          user_id: 'local',
          installment_number: i + 1,
          amount,
          due_date: dueDate,
          status: i === 0 ? 'paid' : 'planned',
          paid_at: i === 0 ? new Date().toISOString() : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      // Save to localStorage
      const existingPlans = JSON.parse(localStorage.getItem('installment_plans') || '[]');
      const existingInstallments = JSON.parse(localStorage.getItem('installments') || '[]');
      
      localStorage.setItem('installment_plans', JSON.stringify([...existingPlans, newPlan]));
      localStorage.setItem('installments', JSON.stringify([...existingInstallments, ...installments]));
      
      await fetchPlans();
      toast.success('Plan plaćanja na rate kreiran');
      return newPlan;
    }

    if (!user) return null;

    try {
      // Create plan
      const { data: planData, error: planError } = await supabase
        .from('installment_plans')
        .insert({
          user_id: user.id,
          description: input.description,
          total_amount: input.total_amount,
          installment_count: input.installment_count,
          first_payment_date: input.first_payment_date.toISOString().split('T')[0],
          category: input.category,
          payment_source: input.payment_source,
          payment_source_card_id: input.payment_source_card_id,
          type: input.type
        })
        .select()
        .single();

      if (planError) throw planError;

      // Generate installments
      const installmentsToInsert = [];
      for (let i = 0; i < installment_count; i++) {
        const dueDate = addMonths(first_payment_date, i);
        const amount = i === installment_count - 1 ? lastAmount : baseAmount;
        
        installmentsToInsert.push({
          plan_id: planData.id,
          user_id: user.id,
          installment_number: i + 1,
          amount,
          due_date: dueDate.toISOString().split('T')[0],
          status: i === 0 ? 'paid' : 'planned',
          paid_at: i === 0 ? new Date().toISOString() : null
        });
      }

      const { error: installmentsError } = await supabase
        .from('installments')
        .insert(installmentsToInsert);

      if (installmentsError) throw installmentsError;

      await fetchPlans();
      toast.success('Plan plaćanja na rate kreiran');
      return {
        ...planData,
        type: planData.type as 'expense' | 'income',
        first_payment_date: new Date(planData.first_payment_date),
        total_amount: Number(planData.total_amount)
      };
    } catch (error) {
      console.error('Error creating installment plan:', error);
      toast.error('Greška pri kreiranju plana rata');
      return null;
    }
  };

  const markInstallmentPaid = async (installmentId: string) => {
    if (isLocalMode) {
      const stored = localStorage.getItem('installments');
      if (stored) {
        const installments = JSON.parse(stored);
        const updated = installments.map((i: any) => 
          i.id === installmentId 
            ? { ...i, status: 'paid', paid_at: new Date().toISOString() }
            : i
        );
        localStorage.setItem('installments', JSON.stringify(updated));
        await fetchPlans();
        toast.success('Rata označena kao plaćena');
      }
      return;
    }

    if (!user) return;

    try {
      const { error } = await supabase
        .from('installments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', installmentId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchPlans();
      toast.success('Rata označena kao plaćena');
    } catch (error) {
      console.error('Error marking installment as paid:', error);
      toast.error('Greška pri ažuriranju rate');
    }
  };

  const markInstallmentUnpaid = async (installmentId: string) => {
    if (isLocalMode) {
      const stored = localStorage.getItem('installments');
      if (stored) {
        const installments = JSON.parse(stored);
        const updated = installments.map((i: any) => 
          i.id === installmentId 
            ? { ...i, status: 'planned', paid_at: null }
            : i
        );
        localStorage.setItem('installments', JSON.stringify(updated));
        await fetchPlans();
        toast.success('Rata označena kao neplaćena');
      }
      return;
    }

    if (!user) return;

    try {
      const { error } = await supabase
        .from('installments')
        .update({ status: 'planned', paid_at: null })
        .eq('id', installmentId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchPlans();
      toast.success('Rata označena kao neplaćena');
    } catch (error) {
      console.error('Error marking installment as unpaid:', error);
      toast.error('Greška pri ažuriranju rate');
    }
  };

  const deletePlan = async (planId: string) => {
    if (isLocalMode) {
      const storedPlans = localStorage.getItem('installment_plans');
      const storedInstallments = localStorage.getItem('installments');
      
      if (storedPlans) {
        const plans = JSON.parse(storedPlans).filter((p: any) => p.id !== planId);
        localStorage.setItem('installment_plans', JSON.stringify(plans));
      }
      
      if (storedInstallments) {
        const installments = JSON.parse(storedInstallments).filter((i: any) => i.plan_id !== planId);
        localStorage.setItem('installments', JSON.stringify(installments));
      }
      
      await fetchPlans();
      toast.success('Plan plaćanja obrisan');
      return;
    }

    if (!user) return;

    try {
      const { error } = await supabase
        .from('installment_plans')
        .delete()
        .eq('id', planId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchPlans();
      toast.success('Plan plaćanja obrisan');
    } catch (error) {
      console.error('Error deleting installment plan:', error);
      toast.error('Greška pri brisanju plana');
    }
  };

  // Get installments for a specific month (for budget calculations)
  const getInstallmentsForMonth = useCallback((date: Date): Installment[] => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    
    return plans.flatMap(plan => 
      (plan.installments || []).filter(installment => 
        isWithinInterval(installment.due_date, { start: monthStart, end: monthEnd })
      )
    );
  }, [plans]);

  // Get total installment amount for a specific month
  const getMonthlyInstallmentTotal = useCallback((date: Date, type?: 'expense' | 'income'): number => {
    const monthInstallments = getInstallmentsForMonth(date);
    
    return monthInstallments
      .filter(i => {
        if (!type) return true;
        const plan = plans.find(p => p.id === i.plan_id);
        return plan?.type === type;
      })
      .reduce((sum, i) => sum + i.amount, 0);
  }, [getInstallmentsForMonth, plans]);

  return {
    plans,
    loading,
    createPlan,
    markInstallmentPaid,
    markInstallmentUnpaid,
    deletePlan,
    refetch: fetchPlans,
    getInstallmentsForMonth,
    getMonthlyInstallmentTotal
  };
};
