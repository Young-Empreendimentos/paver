import { supabase } from './client';

/**
 * As tabelas `paver_*` foram movidas do schema `public` para um schema dedicado
 * chamado `paver` (os nomes continuam iguais). Use `paverDb` para TODO acesso a
 * tabela do Paver (leitura/escrita/embedded selects):
 *
 *   paverDb.from('paver_obras').select(...)
 *
 * RPC, auth e storage continuam no client `supabase` (schema `public`):
 *   supabase.rpc('get_eap_avanco_sums', ...)
 *   supabase.auth...  /  supabase.storage.from('diarios-pdf')...
 *
 * Obs.: os tipos gerados (types.ts) ainda listam as tabelas `paver_` sob `public`
 * (via views de compatibilidade), então reaproveitamos a tipagem de `supabase.from`.
 * Em runtime, este client aponta para o schema `paver`.
 */
export const paverDb = supabase.schema('paver' as any) as unknown as Pick<typeof supabase, 'from'>;
