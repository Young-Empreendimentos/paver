import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2, Droplets, CloudRain, Waves, Construction } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchAllEapItems, fetchObras, type EapItem } from '@/services/api';
import { fetchServiceTags, type ServiceTag } from '@/services/serviceTagsApi';
import { cn } from '@/lib/utils';

type TagKey = 'agua' | 'pluvial' | 'cloacal' | 'pavimentacao';

const TAG_DEFS: { key: TagKey; label: string; match: RegExp; icon: typeof Droplets; barClass: string; iconClass: string }[] = [
  { key: 'agua',        label: 'Rede de água',  match: /rede\s+de\s+[áa]gua/i,   icon: Droplets,     barClass: 'bg-sky-500',     iconClass: 'text-sky-600' },
  { key: 'pluvial',     label: 'Rede pluvial',  match: /pluvial/i,                icon: CloudRain,    barClass: 'bg-slate-400',   iconClass: 'text-slate-500' },
  { key: 'cloacal',     label: 'Rede cloacal',  match: /cloacal/i,                icon: Waves,        barClass: 'bg-amber-700/70', iconClass: 'text-amber-700' },
  { key: 'pavimentacao',label: 'Pavimentação',  match: /pavimenta/i,              icon: Construction, barClass: 'bg-zinc-700',    iconClass: 'text-zinc-700' },
];

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtPct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ObraCardProps {
  obraNome: string;
  items: EapItem[];
  tagsByKey: Map<TagKey, ServiceTag | undefined>;
}

function ObraCard({ obraNome, items, tagsByKey }: ObraCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-accent" />
          {obraNome}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {TAG_DEFS.map(def => {
          const tag = tagsByKey.get(def.key);
          const Icon = def.icon;
          const matching = tag
            ? items.filter(i => i.tipo === 'item' && i.tag_id === tag.id)
            : [];

          const total = matching.reduce((s, i) => s + (i.quantidade ?? 0), 0);
          const executado = matching.reduce(
            (s, i) => s + (i.quantidade ?? 0) * Math.max(0, Math.min(100, i.avanco_realizado ?? 0)) / 100,
            0,
          );
          const pct = total > 0 ? (executado / total) * 100 : 0;
          const unidade = tag?.unidade_permitida ?? '';
          const empty = matching.length === 0 || total === 0;

          return (
            <div key={def.key} className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-body">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', def.iconClass)} />
                <span className="font-heading font-semibold w-32 shrink-0">{def.label}</span>
                {empty ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="text-muted-foreground tabular-nums">
                    <span className="font-semibold text-foreground">{fmtNum(executado)}</span> {unidade} executados
                    {' / '}
                    <span className="font-semibold text-foreground">{fmtNum(total)}</span> {unidade}
                    {' '}
                    <span className="text-foreground">({fmtPct(pct)}%)</span>
                  </span>
                )}
              </div>
              {!empty && (
                <div className="h-2 bg-muted rounded-full overflow-hidden ml-[136px]">
                  <div
                    className={cn('h-full rounded-full transition-all', def.barClass)}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
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
  obraId: string;
}

export default function ExecutadoVsTotal({ obraId }: Props) {
  const { data: obras = [], isLoading: loadingObras } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
    staleTime: 0,
  });

  const { data: allItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ['eap-all-with-avanco'],
    queryFn: fetchAllEapItems,
    staleTime: 0,
  });

  const { data: tags = [], isLoading: loadingTags } = useQuery({
    queryKey: ['service-tags'],
    queryFn: fetchServiceTags,
    staleTime: 0,
  });

  const tagsByKey = useMemo(() => {
    const m = new Map<TagKey, ServiceTag | undefined>();
    for (const def of TAG_DEFS) {
      m.set(def.key, tags.find(t => def.match.test(t.nome)));
    }
    return m;
  }, [tags]);

  const itemsByObra = useMemo(() => {
    const m = new Map<string, EapItem[]>();
    for (const it of allItems) {
      if (!m.has(it.obra_id)) m.set(it.obra_id, []);
      m.get(it.obra_id)!.push(it);
    }
    return m;
  }, [allItems]);

  const obrasToShow = useMemo(
    () => (obraId === 'all' ? obras : obras.filter(o => o.id === obraId)),
    [obras, obraId],
  );

  const hasAnyTagged = useMemo(
    () => allItems.some(i => i.tag_id),
    [allItems],
  );

  const isLoading = loadingObras || loadingItems || loadingTags;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </CardContent>
      </Card>
    );
  }

  if (!hasAnyTagged) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm font-body text-muted-foreground">
          Nenhum item com tag atribuída. Atribua tags no orçamento para ver os indicadores.
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
        <ObraCard
          key={o.id}
          obraNome={o.nome}
          items={itemsByObra.get(o.id) || []}
          tagsByKey={tagsByKey}
        />
      ))}
    </div>
  );
}
