import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { InstallmentPlan, Installment, InstallmentPlanWithProgress } from '@/types/installment';
import { toast } from 'sonner';
import { addMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

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

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

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
          status: 'planned',
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
          status: 'planned'
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
