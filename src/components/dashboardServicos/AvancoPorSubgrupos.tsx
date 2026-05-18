import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Layers, Building2, Loader2, Package, Hammer, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { fetchAllEapItems, fetchObras, type EapItem } from '@/services/api';

type Subgroup = 'Material' | 'Serviço' | 'Outros';

function classify(item: EapItem): Subgroup {
  const desc = (item.descricao || '').toLowerCase();
  // Serviço (mão de obra)
  if (/m[aã]o\s*de\s*obra|^m\.?o\.?\b|\bmão\s*de\s*obra\b/i.test(desc)) return 'Serviço';
  // Material precisa ter unidade física mensurável
  if (item.unidade && item.unidade.trim() !== '') return 'Material';
  return 'Outros';
}

function itemAvanco(item: EapItem): number {
  // enrichWithComputedAvanco já popula avanco_realizado (0-100)
  return Math.max(0, Math.min(100, item.avanco_realizado ?? 0));
}

interface ObraBlockProps {
  obraId: string;
  obraNome: string;
  items: EapItem[];
}

const subgroupOrder: Subgroup[] = ['Material', 'Serviço', 'Outros'];
const subgroupIcon: Record<Subgroup, typeof Package> = {
  Material: Package,
  'Serviço': Hammer,
  Outros: MoreHorizontal,
};
const subgroupColor: Record<Subgroup, string> = {
  Material: 'bg-blue-500',
  'Serviço': 'bg-emerald-500',
  Outros: 'bg-amber-500',
};

function ObraBlock({ obraNome, items }: ObraBlockProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groupedByServico = useMemo(() => {
    const map = new Map<string, EapItem[]>();
    for (const it of items.filter(i => i.tipo === 'item')) {
      const key = it.lote || 'Sem serviço';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  if (groupedByServico.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-accent" />
            {obraNome}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground font-body">Nenhum serviço encontrado para esta obra.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-accent" />
          {obraNome}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {groupedByServico.map(([servico, servItems]) => {
          // Build subgroups
          const buckets: Record<Subgroup, EapItem[]> = { Material: [], 'Serviço': [], Outros: [] };
          for (const it of servItems) buckets[classify(it)].push(it);

          return (
            <div key={servico} className="border rounded-md">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                <Layers className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="text-sm font-heading font-semibold flex-1 truncate">{servico}</span>
                <Badge variant="secondary" className="text-[10px] font-body">{servItems.length}</Badge>
              </div>

              <div className="divide-y">
                {subgroupOrder.map(sg => {
                  const subItems = buckets[sg];
                  if (subItems.length === 0 && sg === 'Outros') return null;
                  if (subItems.length === 0) return null;

                  const sum = subItems.reduce((s, i) => s + itemAvanco(i), 0);
                  const avg = subItems.length > 0 ? sum / subItems.length : 0;
                  const key = `${servico}::${sg}`;
                  const isOpen = expanded.has(key);
                  const Icon = subgroupIcon[sg];

                  return (
                    <div key={sg} className="px-3 py-2">
                      <button
                        className="w-full flex items-center gap-2 text-left"
                        onClick={() => {
                          setExpanded(prev => {
                            const n = new Set(prev);
                            n.has(key) ? n.delete(key) : n.add(key);
                            return n;
                          });
                        }}
                      >
                        {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-body font-medium w-20 shrink-0">{sg}</span>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', subgroupColor[sg])}
                              style={{ width: `${avg}%` }}
                            />
                          </div>
                          <span className="text-xs font-body font-semibold tabular-nums w-10 text-right">
                            {avg.toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-muted-foreground font-body whitespace-nowrap">
                            ({subItems.length} {subItems.length === 1 ? 'item' : 'itens'})
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="mt-2 ml-8 space-y-1">
                          {subItems.map(it => {
                            const av = itemAvanco(it);
                            return (
                              <div key={it.id} className="flex items-center gap-2 text-[11px] font-body py-1 px-2 rounded hover:bg-muted/40">
                                {it.codigo && (
                                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{it.codigo}</span>
                                )}
                                <span className="flex-1 truncate">{it.descricao}</span>
                                <span className="text-muted-foreground whitespace-nowrap">
                                  {(it.quantidade ?? 0).toLocaleString('pt-BR')} {it.unidade || ''}
                                </span>
                                <span className="font-semibold tabular-nums w-10 text-right">{av.toFixed(0)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface Props {
  obraId: string; // 'all' or specific id
}

export default function AvancoPorSubgrupos({ obraId }: Props) {
  const { data: obras = [], isLoading: loadingObras } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
    staleTime: 30_000,
  });

  const { data: allItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ['eap-all-with-avanco'],
    queryFn: fetchAllEapItems,
    staleTime: 30_000,
  });

  const isLoading = loadingObras || loadingItems;

  const obrasToShow = useMemo(() => {
    if (obraId === 'all') return obras;
    return obras.filter(o => o.id === obraId);
  }, [obras, obraId]);

  const itemsByObra = useMemo(() => {
    const m = new Map<string, EapItem[]>();
    for (const it of allItems) {
      if (!m.has(it.obra_id)) m.set(it.obra_id, []);
      m.get(it.obra_id)!.push(it);
    }
    return m;
  }, [allItems]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </CardContent>
      </Card>
    );
  }

  if (obrasToShow.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm font-body text-muted-foreground">
          Nenhuma obra encontrada.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {obrasToShow.map(o => (
        <ObraBlock
          key={o.id}
          obraId={o.id}
          obraNome={o.nome}
          items={itemsByObra.get(o.id) || []}
        />
      ))}
    </div>
  );
}
