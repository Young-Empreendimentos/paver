
import { paverDb } from '@/integrations/supabase/paver';

export interface ServiceTag {
  id: string;
  nome: string;
  unidade_permitida: string;
  created_at: string;
}

export async function fetchServiceTags(): Promise<ServiceTag[]> {
  const { data, error } = await paverDb
    .from('paver_service_tags' as any)
    .select('*')
    .order('nome');
  if (error) throw error;
  return (data || []) as unknown as ServiceTag[];
}
