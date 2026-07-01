import { supabase } from '@/integrations/supabase/client';

export interface Obra {
  id: string;
  nome: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  status: 'em_andamento' | 'concluida' | 'pausada' | 'cancelada';
  data_inicio?: string;
  data_previsao?: string;
  responsavel_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EapItem {
  id: string;
  obra_id: string;
  parent_id?: string;
  codigo?: string;
  descricao: string;
  pacote?: string;
  lote?: string;
  classificacao_adicional?: string;
  tipo: 'agrupador' | 'item';
  unidade?: string;
  quantidade?: number;
  predecessoras?: string[];
  sucessoras?: string[];
  avanco_base?: number;
  avanco_previsto?: number;
  avanco_realizado?: number;
  ordem?: number;
  data_inicio_prevista?: string;
  data_fim_prevista?: string;
  data_inicio_real?: string;
  data_fim_real?: string;
  tag_id?: string | null;
  created_at: string;
}

export interface DiarioObra {
  id: string;
  obra_id: string;
  data: string;
  clima: string;
  clima_manha: string;
  clima_tarde: string;
  temperatura_min?: number;
  temperatura_max?: number;
  mao_de_obra: string;
  atividades: string;
  observacoes?: string;
  fotos?: string[];
  created_by: string;
  created_at: string;
}

// === OBRAS ===
export async function fetchObras() {
  const { data, error } = await supabase
    .from('paver_obras')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Obra[];
}

export async function fetchObra(id: string) {
  const { data, error } = await supabase
    .from('paver_obras')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Obra | null;
}

export async function createObra(obra: Omit<Obra, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('paver_obras')
    .insert(obra)
    .select()
    .single();
  if (error) throw error;
  return data as Obra;
}

export async function updateObra(id: string, updates: Partial<Obra>) {
  const { data, error } = await supabase
    .from('paver_obras')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Obra;
}

export async function deleteObra(id: string) {
  const { error } = await supabase.from('paver_obras').delete().eq('id', id);
  if (error) throw error;
}

// === EAP ===

async function enrichWithComputedAvanco(items: EapItem[], obraId?: string): Promise<EapItem[]> {
  const itemsOnly = items.filter(i => i.tipo === 'item');
  if (itemsOnly.length === 0) return items;

  const { data: sums } = await supabase.rpc('get_eap_avanco_sums', {
    p_obra_id: obraId ?? null,
  });

  const sumMap = new Map<string, number>();
  for (const row of (sums || [])) {
    sumMap.set(row.eap_item_id, Number(row.sum_quantidade_dia) || 0);
  }

  return items.map(item => {
    if (item.tipo !== 'item') return item;
    const totalQtd = item.quantidade || 0;
    const sumQtdDia = sumMap.get(item.id) || 0;
    const avanco = totalQtd > 0
      ? Math.min(100, Math.round((sumQtdDia / totalQtd) * 10000) / 100)
      : 0;
    return { ...item, avanco_realizado: avanco };
  });
}

export async function fetchEapItems(obraId: string) {
  const { data, error } = await supabase
    .from('paver_eap_items')
    .select('*')
    .eq('obra_id', obraId)
    .order('ordem', { ascending: true });
  if (error) throw error;
  return enrichWithComputedAvanco(data as EapItem[], obraId);
}

export async function fetchAllEapItems() {
  const { data, error } = await supabase
    .from('paver_eap_items')
    .select('*')
    .eq('tipo', 'item');
  if (error) throw error;
  return enrichWithComputedAvanco(data as EapItem[]);
}

export async function insertEapItems(items: Omit<EapItem, 'id' | 'created_at'>[]) {
  const { data, error } = await supabase
    .from('paver_eap_items')
    .insert(items)
    .select();
  if (error) throw error;
  return data as EapItem[];
}

export async function deleteEapItemsByObra(obraId: string) {
  const { error } = await supabase.from('paver_eap_items').delete().eq('obra_id', obraId);
  if (error) throw error;
}

// === DIÁRIO DE OBRA ===
export async function fetchDiarios(obraId: string) {
  const { data, error } = await supabase
    .from('paver_diarios')
    .select('*')
    .eq('obra_id', obraId)
    .order('data', { ascending: false });
  if (error) throw error;
  return data as DiarioObra[];
}

export async function fetchAllDiarios() {
  const { data, error } = await supabase
    .from('paver_diarios')
    .select('*')
    .order('data', { ascending: false });
  if (error) throw error;
  return data as DiarioObra[];
}

export async function fetchDiariosThisMonth() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('paver_diarios')
    .select('*')
    .gte('data', firstDay);
  if (error) throw error;
  return data as DiarioObra[];
}

export async function createDiario(diario: Omit<DiarioObra, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('paver_diarios')
    .insert(diario)
    .select()
    .single();
  if (error) throw error;
  return data as DiarioObra;
}

export async function updateDiario(id: string, updates: Partial<DiarioObra>) {
  const { data, error } = await supabase
    .from('paver_diarios')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DiarioObra;
}

export async function deleteDiario(id: string) {
  // 1. Get all atividades for this diário before deleting
  const { data: atividades } = await supabase
    .from('paver_diario_atividades')
    .select('eap_item_id')
    .eq('diario_id', id);

  const affectedItemIds = [...new Set((atividades || []).map((a: any) => a.eap_item_id))];

  // 2. Delete the diário (cascades to paver_diario_atividades)
  const { error } = await supabase.from('paver_diarios').delete().eq('id', id);
  if (error) throw error;

  // 3. Update data_inicio_real / data_fim_real for affected items (avanco_realizado is computed dynamically)
  for (const itemId of affectedItemIds) {
    const { data: eapItem } = await supabase
      .from('paver_eap_items')
      .select('quantidade')
      .eq('id', itemId)
      .single();

    const { data: remaining } = await supabase
      .from('paver_diario_atividades')
      .select('quantidade_dia')
      .eq('eap_item_id', itemId);

    const totalQtd = eapItem?.quantidade || 0;
    const sumQtdDia = (remaining || []).reduce((sum: number, r: any) => sum + (r.quantidade_dia || 0), 0);
    const newAvanco = totalQtd > 0
      ? Math.min(100, Math.round((sumQtdDia / totalQtd) * 10000) / 100)
      : 0;

    const updateFields: Record<string, any> = {};

    if (sumQtdDia === 0) {
      updateFields.data_inicio_real = null;
      updateFields.data_fim_real = null;
    } else if (newAvanco < 100) {
      updateFields.data_fim_real = null;
    }

    if (Object.keys(updateFields).length > 0) {
      await supabase.from('paver_eap_items').update(updateFields).eq('id', itemId);
    }
  }
}

// === PROFILES & ROLES (admin) ===
export interface UserWithRole {
  id: string;
  full_name?: string;
  email?: string;
  roles: string[];
  ativo: boolean;
}

export async function fetchAllUsers(): Promise<UserWithRole[]> {
  const { data: profiles, error: pErr } = await supabase
    .from('paver_profiles')
    .select('id, full_name, ativo');
  if (pErr) throw pErr;

  const { data: roles, error: rErr } = await supabase
    .from('paver_user_roles')
    .select('user_id, role');
  if (rErr) throw rErr;

  const userIds = (profiles || []).map((p: any) => p.id);
  let emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: emailData } = await supabase.rpc('get_user_emails', { user_ids: userIds });
    if (emailData) {
      emailMap = Object.fromEntries((emailData as any[]).map(e => [e.id, e.email]));
    }
  }

  return (profiles || []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    email: emailMap[p.id] || '',
    ativo: p.ativo ?? true,
    roles: (roles || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
  }));
}

export async function createProfile(userId: string, fullName?: string) {
  const { error } = await supabase
    .from('paver_profiles')
    .upsert({ id: userId, full_name: fullName ?? null } as any, { onConflict: 'id' });
  if (error) throw error;
}

export async function toggleUserAtivo(userId: string, ativo: boolean) {
  const { error } = await supabase
    .from('paver_profiles')
    .update({ ativo } as any)
    .eq('id', userId);
  if (error) throw error;
}

export async function updateProfileName(userId: string, name: string) {
  const { error } = await supabase
    .from('paver_profiles')
    .update({ full_name: name } as any)
    .eq('id', userId);
  if (error) throw error;
}

export async function assignRole(userId: string, role: string) {
  const { error } = await supabase
    .from('paver_user_roles')
    .insert({ user_id: userId, role: role as any });
  if (error) throw error;
}

export async function removeRole(userId: string, role: string) {
  const { error } = await supabase
    .from('paver_user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role as any);
  if (error) throw error;
}

// === RELATÓRIO FOTOGRÁFICO ===
export interface PlantaObra {
  id: string;
  obra_id: string;
  nome: string;
  imagem_url: string;
  created_at: string;
}

export interface FotoLocalizada {
  id: string;
  planta_id: string;
  obra_id: string;
  foto_url: string;
  descricao?: string;
  pos_x: number;
  pos_y: number;
  pacote?: string;
  tipo_servico?: string;
  diario_id?: string;
  created_by: string;
  created_at: string;
}

export async function fetchPlantas(obraId: string) {
  const { data, error } = await supabase
    .from('paver_plantas')
    .select('*')
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as PlantaObra[];
}

export async function createPlanta(planta: Omit<PlantaObra, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('paver_plantas')
    .insert(planta)
    .select()
    .single();
  if (error) throw error;
  return data as PlantaObra;
}

export async function deletePlanta(id: string) {
  const { error } = await supabase.from('paver_plantas').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchFotosLocalizadas(plantaId: string) {
  const { data, error } = await supabase
    .from('paver_fotos_localizadas')
    .select('*')
    .eq('planta_id', plantaId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as FotoLocalizada[];
}

export async function fetchAllFotosLocalizadas() {
  const { data, error } = await supabase
    .from('paver_fotos_localizadas')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as FotoLocalizada[];
}

export async function createFotoLocalizada(foto: Omit<FotoLocalizada, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('paver_fotos_localizadas')
    .insert(foto)
    .select()
    .single();
  if (error) throw error;
  return data as FotoLocalizada;
}

export async function deleteFotoLocalizada(id: string) {
  const { error } = await supabase.from('paver_fotos_localizadas').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadFile(bucket: string, path: string, file: File) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}
