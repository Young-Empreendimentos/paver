import type { SstDocumento, SstStatus, SstStatusValor, SstFrequencia, SstEscopo } from '@/services/api';

// ---------- Rótulos ----------
export const SST_FREQUENCIAS: { value: SstFrequencia; label: string; curto: string }[] = [
  { value: 'fixo', label: 'Fixo (1x, no início do serviço)', curto: 'Fixo' },
  { value: 'toda_medicao', label: 'Toda medição', curto: 'Toda medição' },
  { value: 'medicao_dia_1', label: 'Só na medição do dia 1', curto: 'Dia 1' },
  { value: 'medicao_dia_16', label: 'Só na medição do dia 16', curto: 'Dia 16' },
];

export const SST_ESCOPOS: { value: SstEscopo; label: string }[] = [
  { value: 'empresa', label: 'Empresa (empreiteiro)' },
  { value: 'pessoa', label: 'Pessoa (funcionário)' },
];

export function freqCurta(f: SstFrequencia): string {
  return SST_FREQUENCIAS.find((x) => x.value === f)?.curto ?? f;
}

export const SST_STATUS_META: Record<SstStatusValor, { label: string; badge: string; dot: string }> = {
  aprovado: {
    label: 'Aprovado',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
    dot: 'bg-emerald-500',
  },
  pendente: {
    label: 'Pendente',
    badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    dot: 'bg-amber-500',
  },
  nao_se_aplica: {
    label: 'Não se aplica',
    badge: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground/40',
  },
};

export const SST_STATUS_OPCOES: { value: SstStatusValor; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'nao_se_aplica', label: 'Não se aplica' },
];

// ---------- Medições (dia 1 e dia 16 de cada mês) ----------
export interface Medicao {
  data: string; // 'YYYY-MM-DD'
  dia: 1 | 16;
  label: string;
}

export function medicoesDoMes(ano: number, mes1a12: number): Medicao[] {
  const mm = String(mes1a12).padStart(2, '0');
  return [
    { data: `${ano}-${mm}-01`, dia: 1, label: `Medição dia 1 · ${mm}/${ano}` },
    { data: `${ano}-${mm}-16`, dia: 16, label: `Medição dia 16 · ${mm}/${ano}` },
  ];
}

/** Um documento por medição aparece nesta medição? (fixo nunca é por medição) */
export function docAplicaNaMedicao(doc: SstDocumento, m: Medicao): boolean {
  // Vigência: documento só é exigido a partir da data configurada (medições anteriores não cobram).
  if (doc.vigencia_inicio && m.data < doc.vigencia_inicio) return false;
  if (doc.frequencia === 'toda_medicao') return true;
  if (doc.frequencia === 'medicao_dia_1') return m.dia === 1;
  if (doc.frequencia === 'medicao_dia_16') return m.dia === 16;
  return false;
}

export const isDocMedicao = (doc: SstDocumento) => doc.frequencia !== 'fixo';

// ---------- Regra MEI (docs de pessoa) ----------
/** Um documento de pessoa aplica a este funcionário, considerando MEI? */
export function docPessoaAplica(doc: SstDocumento, isMei: boolean): boolean {
  if (doc.exclusivo_mei) return isMei; // só MEI precisa
  if (doc.dispensa_mei && isMei) return false; // MEI dispensa
  return true;
}

// ---------- Índice de status ----------
export function sstKey(
  documentoId: string,
  empreiteiroId: string | null,
  empregadoId: string | null,
  medicao: string | null,
): string {
  return [documentoId, empreiteiroId ?? '-', empregadoId ?? '-', medicao ?? '-'].join('::');
}

export function indexStatus(rows: SstStatus[]): Map<string, SstStatus> {
  const m = new Map<string, SstStatus>();
  for (const r of rows) m.set(sstKey(r.documento_id, r.empreiteiro_id, r.empregado_id, r.medicao), r);
  return m;
}

export function statusValor(
  map: Map<string, SstStatus>,
  documentoId: string,
  empreiteiroId: string | null,
  empregadoId: string | null,
  medicao: string | null,
): SstStatus | undefined {
  return map.get(sstKey(documentoId, empreiteiroId, empregadoId, medicao));
}

// ---------- Resumo (tem × falta) ----------
export interface Resumo {
  total: number; // itens exigidos (obrigatórios) aplicáveis
  aprovado: number;
  pendente: number; // o que falta
  naoSeAplica: number;
  opcionaisPendentes: number; // não-obrigatórios ainda pendentes (não contam como falta)
}

export function resumoVazio(): Resumo {
  return { total: 0, aprovado: 0, pendente: 0, naoSeAplica: 0, opcionaisPendentes: 0 };
}

/** Conta um item exigido no resumo, dado o status atual (ou undefined = pendente). */
export function contaItem(r: Resumo, doc: SstDocumento, s: SstStatus | undefined) {
  const valor = s?.status ?? 'pendente';
  if (!doc.obrigatorio) {
    // Opcional: só entra na conta quando foi resolvido (aprovado / não se aplica).
    if (valor === 'aprovado') {
      r.aprovado += 1;
      r.total += 1;
    } else if (valor === 'nao_se_aplica') {
      r.naoSeAplica += 1;
      r.total += 1;
    } else {
      r.opcionaisPendentes += 1;
    }
    return;
  }
  r.total += 1;
  if (valor === 'aprovado') r.aprovado += 1;
  else if (valor === 'nao_se_aplica') r.naoSeAplica += 1;
  else r.pendente += 1;
}

/** % concluído = aprovados / (exigidos - não se aplica). */
export function pctResumo(r: Resumo): number {
  const base = r.total - r.naoSeAplica;
  if (base <= 0) return 100;
  return Math.round((r.aprovado / base) * 100);
}
