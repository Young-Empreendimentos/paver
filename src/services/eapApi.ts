
import { paverDb } from '@/integrations/supabase/paver';
import type { EapItem } from '@/services/api';

// === UPDATE EAP ITEM ===
export async function updateEapItem(id: string, updates: Partial<EapItem>) {
  const { data, error } = await paverDb
    .from('paver_eap_items')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as EapItem;
}

// === DELETE SINGLE EAP ITEM ===
export async function deleteEapItem(id: string) {
  const { error } = await paverDb.from('paver_eap_items').delete().eq('id', id);
  if (error) throw error;
}

// === INSERT SINGLE EAP ITEM ===
export async function insertSingleEapItem(item: Omit<EapItem, 'id' | 'created_at'>) {
  const { data, error } = await paverDb
    .from('paver_eap_items')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data as EapItem;
}

// === BULK UPDATE EAP ITEMS ===
export async function bulkUpdateEapItems(items: { id: string; updates: Partial<EapItem> }[]) {
  const results = [];
  for (const item of items) {
    const { data, error } = await paverDb
      .from('paver_eap_items')
      .update(item.updates as any)
      .eq('id', item.id)
      .select()
      .single();
    if (error) throw error;
    results.push(data);
  }
  return results as EapItem[];
}

// === BASELINES ===
export interface EapBaseline {
  id: string;
  obra_id: string;
  nome: string;
  created_by: string;
  created_at: string;
}

export interface EapBaselineItem {
  id: string;
  baseline_id: string;
  eap_item_id: string;
  avanco_previsto: number;
  data_inicio_prevista?: string;
  data_fim_prevista?: string;
  created_at: string;
}

export async function fetchBaselines(obraId: string) {
  const { data, error } = await paverDb
    .from('paver_eap_baselines')
    .select('*')
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as EapBaseline[];
}

export async function fetchBaselineItems(baselineId: string) {
  const { data, error } = await paverDb
    .from('paver_eap_baseline_items')
    .select('*')
    .eq('baseline_id', baselineId);
  if (error) throw error;
  return data as EapBaselineItem[];
}

export async function createBaseline(obraId: string, nome: string, userId: string, eapItems: EapItem[]) {
  // Create baseline
  const { data: baseline, error: bErr } = await paverDb
    .from('paver_eap_baselines')
    .insert({ obra_id: obraId, nome, created_by: userId })
    .select()
    .single();
  if (bErr) throw bErr;

  // Snapshot all items
  const items = eapItems
    .filter(i => i.tipo === 'item')
    .map(i => ({
      baseline_id: baseline.id,
      eap_item_id: i.id,
      avanco_previsto: i.avanco_previsto || 0,
      data_inicio_prevista: i.data_inicio_prevista || null,
      data_fim_prevista: i.data_fim_prevista || null,
    }));

  if (items.length > 0) {
    const { error: iErr } = await paverDb
      .from('paver_eap_baseline_items')
      .insert(items);
    if (iErr) throw iErr;
  }

  return baseline as EapBaseline;
}

export async function deleteBaseline(id: string) {
  const { error } = await paverDb.from('paver_eap_baselines').delete().eq('id', id);
  if (error) throw error;
}

// === DEPENDENCY CALCULATION (Finish-Start) ===
export function calculateDependencyDates(items: EapItem[]): Map<string, { inicio: string; fim: string }> {
  const itemMap = new Map<string, EapItem>();
  items.forEach(i => itemMap.set(i.id, i));

  // Also index by codigo
  const codigoMap = new Map<string, EapItem>();
  items.forEach(i => { if (i.codigo) codigoMap.set(i.codigo, i); });

  const result = new Map<string, { inicio: string; fim: string }>();
  const visited = new Set<string>();

  function resolve(item: EapItem): { inicio: string; fim: string } | null {
    if (result.has(item.id)) return result.get(item.id)!;
    if (visited.has(item.id)) return null; // circular
    visited.add(item.id);

    let latestPredEnd: Date | null = null;

    if (item.predecessoras && item.predecessoras.length > 0) {
      for (const predRef of item.predecessoras) {
        const predItem = itemMap.get(predRef) || codigoMap.get(predRef);
        if (predItem) {
          const predDates = resolve(predItem);
          if (predDates) {
            const predEnd = new Date(predDates.fim);
            if (!latestPredEnd || predEnd > latestPredEnd) {
              latestPredEnd = predEnd;
            }
          }
        }
      }
    }

    // If item already has dates, use them; otherwise calculate from predecessors
    let inicio: Date;
    if (latestPredEnd) {
      // FS: start day after predecessor ends
      inicio = new Date(latestPredEnd);
      inicio.setDate(inicio.getDate() + 1);
    } else if (item.data_inicio_prevista) {
      inicio = new Date(item.data_inicio_prevista);
    } else {
      return null;
    }

    // Calculate end date: if item has duration (from existing dates), preserve it
    let fim: Date;
    if (item.data_inicio_prevista && item.data_fim_prevista) {
      const originalDuration = Math.round(
        (new Date(item.data_fim_prevista).getTime() - new Date(item.data_inicio_prevista).getTime()) /
        (1000 * 60 * 60 * 24)
      );
      fim = new Date(inicio);
      fim.setDate(fim.getDate() + originalDuration);
    } else if (item.data_fim_prevista) {
      fim = new Date(item.data_fim_prevista);
    } else {
      // Default 7-day duration
      fim = new Date(inicio);
      fim.setDate(fim.getDate() + 7);
    }

    const entry = {
      inicio: inicio.toISOString().split('T')[0],
      fim: fim.toISOString().split('T')[0],
    };
    result.set(item.id, entry);
    return entry;
  }

  items.filter(i => i.tipo === 'item').forEach(i => resolve(i));
  return result;
}
