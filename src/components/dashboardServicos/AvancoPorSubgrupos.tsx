import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Building2, Loader2, Hammer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchAllEapItems, fetchObras, type EapItem } from '@/services/api';
import { fetchServiceTags, type ServiceTag } from '@/services/serviceTagsApi';

function itemAvanco(item: EapItem): number {
  // enrichWithComputedAvanco já popula avanco_realizado (0-100)
  return Math.max(0, Math.min(100, item.avanco_realizado ?? 0));
}

interface ObraBlockProps {
  obraId: string;
  obraNome: string;
  items: EapItem[];
  tagsById: Map<string, ServiceTag>;
}


function ObraBlock({ obraNome, items, tagsById }: ObraBlockProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Apenas itens com tag atribuída; itens sem tag não entram nos indicadores.
  const groupedByServico = useMemo(() => {
    const map = new Map<string, EapItem[]>();
    for (const it of items.filter(i => i.tipo === 'item' && i.tag_id && tagsById.has(i.tag_id))) {
      const key = tagsById.get(it.tag_id!)!.nome;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items, tagsById]);

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
          <p className="text-sm text-muted-foreground font-body">Nenhum item com tag atribuída para esta obra.</p>
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
          // Agrupa por unidade para calcular % ponderada apenas entre itens compatíveis,
          // depois faz a média simples entre as unidades (evita misturar un com m, m² etc.)
          const byUnit = new Map<string, { tot: number; exec: number }>();
          for (const i of servItems) {
            const u = (i.unidade || '—').trim() || '—';
            const q = i.quantidade ?? 0;
            const cur = byUnit.get(u) ?? { tot: 0, exec: 0 };
            cur.tot += q;
            cur.exec += q * itemAvanco(i) / 100;
            byUnit.set(u, cur);
          }
          const unitPcts = Array.from(byUnit.values())
            .filter(v => v.tot > 0)
            .map(v => (v.exec / v.tot) * 100);
          const pct = unitPcts.length > 0
            ? unitPcts.reduce((a, b) => a + b, 0) / unitPcts.length
            : 0;
          const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
          const isOpen = expanded.has(servico);

          return (
            <div key={servico} className="border rounded-md">
              <button
                className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-muted/30 transition-colors"
                onClick={() => {
                  setExpanded(prev => {
                    const n = new Set(prev);
                    n.has(servico) ? n.delete(servico) : n.add(servico);
                    return n;
                  });
                }}
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                <Hammer className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="text-sm font-heading font-semibold flex-1 truncate">{servico}</span>
                <div className="flex items-center gap-2 w-[55%] max-w-md">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all bg-emerald-500"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="text-xs font-body font-semibold tabular-nums w-12 text-right">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground font-body whitespace-nowrap">
                    ({servItems.length} {servItems.length === 1 ? 'item' : 'itens'})
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t px-3 py-2 space-y-1 bg-muted/10">
                  {servItems.map(it => {
                    const av = itemAvanco(it);
                    const q = it.quantidade ?? 0;
                    const ex = q * av / 100;
                    return (
                      <div key={it.id} className="flex items-center gap-2 text-[11px] font-body py-1 px-2 rounded hover:bg-muted/40">
                        {it.codigo && (
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">{it.codigo}</span>
                        )}
                        <span className="flex-1 truncate">{it.descricao}</span>
                        <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                          <span className="font-semibold text-foreground">{fmt(ex)}</span>
                          {' / '}
                          <span className="font-semibold text-foreground">{fmt(q)}</span>
                          {it.unidade ? ` ${it.unidade}` : ''}
                        </span>
                        <span className="font-semibold tabular-nums w-12 text-right">{av.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
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

  const { data: tags = [], isLoading: loadingTags } = useQuery({
    queryKey: ['service-tags'],
    queryFn: fetchServiceTags,
    staleTime: 60_000,
  });

  const tagsById = useMemo(
    () => new Map(tags.map(tag => [tag.id, tag])),
    [tags],
  );

  const isLoading = loadingObras || loadingItems || loadingTags;

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
          tagsById={tagsById}
        />
      ))}
    </div>
  );
}
