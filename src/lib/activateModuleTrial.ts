/**
 * Jedina putanja aktivacije probnog razdoblja modula.
 *
 * Isti RPC koji koristi gumb "Isprobaj besplatno 30 dana" u
 * `ModuleUpgradeDialog`. Bez izravnog upisa u tablicu entitlementa.
 */
import { supabase } from '@/integrations/supabase/client';

export type TrialModule = 'smjer' | 'krug' | 'projekti';

export interface ActivateModuleTrialResult {
  activated?: boolean;
  already_used?: boolean;
  period_end?: string;
}

export const activateModuleTrial = async (
  module: TrialModule,
): Promise<ActivateModuleTrialResult> => {
  const { data, error } = await supabase.rpc('activate_module_trial', { _module: module });
  if (error) throw error;
  return (data ?? {}) as ActivateModuleTrialResult;
};
