
import { paverDb } from '@/integrations/supabase/paver';

export type DependencyRuleType = 'servico_em_pacote' | 'pacote_em_servico';

export interface DependencyRule {
  id: string;
  obra_id: string;
  tipo: DependencyRuleType;
  predecessor: string;
  successor: string;
  created_by: string;
  created_at: string;
}

export async function fetchDependencyRules(obraId: string) {
  const { data, error } = await paverDb
    .from('paver_dependency_rules' as any)
    .select('*')
    .eq('obra_id', obraId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as DependencyRule[];
}

export async function createDependencyRule(
  obraId: string,
  tipo: DependencyRuleType,
  predecessor: string,
  successor: string,
  userId: string
) {
  const { data, error } = await paverDb
    .from('paver_dependency_rules' as any)
    .insert({ obra_id: obraId, tipo, predecessor, successor, created_by: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as DependencyRule;
}

export async function deleteDependencyRule(id: string) {
  const { error } = await paverDb
    .from('paver_dependency_rules' as any)
    .delete()
    .eq('id', id);
  if (error) throw error;
}
