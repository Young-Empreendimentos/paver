import { useMemo, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, addMonths, format, isWithinInterval, parseISO,
  isBefore, isEqual,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { fetchServiceTags, type ServiceTag } from '@/services/serviceTagsApi';

type Granularity = 'week' | 'month';
type Mode = 'period' | 'cumulative';
type TagKey = 'agua' | 'pluvial' | 'cloacal' | 'pavimentacao';

const TAG_DEFS: { key: TagKey; label: string; short: string; match: RegExp; color: string }[] = [
  { key: 'agua',         label: 'Rede de água',  short: 'Água',     match: /rede\s+de\s+[áa]gua/i, color: '#0ea5e9' },
  { key: 'pluvial',      label: 'Rede pluvial',  short: 'Pluvial',  match: /pluvial/i,             color: '#64748b' },
  { key: 'cloacal',      label: 'Rede cloacal',  short: 'Cloacal',  match: /cloacal/i,             color: '#b45309' },
  { key: 'pavimentacao', label: 'Pavimentação',  short: 'Pavim.',   match: /pavimenta/i,           color: '#3f3f46' },
];

const VISIBLE = 6;
const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

interface DiarioRow {
  quantidade_dia: number;
  data: string; // YYYY-MM-DD
  eap_item: {
    obra_id: string;
    tag_id: string | null;
  } | null;
}

async function fetchDiarioHistorico(): Promise<DiarioRow[]> {
  const { data, error } = await supabase
    .from('paver_diario_atividades')
    .select('quantidade_dia, paver_diarios!inner(data), paver_eap_items!inner(obra_id, tag_id)')
    .not('paver_eap_items.tag_id', 'is', null);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    quantidade_dia: Number(r.quantidade_dia) || 0,
    data: r.paver_diarios.data,
    eap_item: r.paver_eap_items ? { obra_id: r.paver_eap_items.obra_id, tag_id: r.paver_eap_items.tag_id } : null,
  }));
}

interface Props {
  obraId: string; // 'all' or specific id
}

interface Period {
  start: Date;
  end: Date;
  label: string;
  key: string;
}

function buildPeriods(granularity: Granularity, anchor: Date): Period[] {
  // anchor = end period; build VISIBLE periods ending at anchor
  const periods: Period[] = [];
  for (let i = VISIBLE - 1; i >= 0; i--) {
    if (granularity === 'month') {
      const d = addMonths(anchor, -i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      periods.push({
        start, end,
        label: format(start, 'MMM/yy', { locale: ptBR }),
        key: format(start, 'yyyy-MM'),
      });
    } else {
      const d = addWeeks(anchor, -i);
      const start = startOfWeek(d, { weekStartsOn: 1 });
      const end = endOfWeek(d, { weekStartsOn: 1 });
      periods.push({
        start, end,
        label: `Sem ${format(start, 'w', { locale: ptBR })}`,
        key: format(start, 'yyyy-ww'),
      });
    }
  }
  return periods;
}

export default function ExecutadoPorPeriodo({ obraId }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [mode, setMode] = useState<Mode>('period');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: rows = [], isLoading: loadingRows } = useQuery({
    queryKey: ['diario-historico-tags'],
    queryFn: fetchDiarioHistorico,
    staleTime: 30_000,
  });

  const { data: tags = [], isLoading: loadingTags } = useQuery({
    queryKey: ['service-tags'],
    queryFn: fetchServiceTags,
    staleTime: 60_000,
  });

  const tagsByKey = useMemo(() => {
    const m = new Map<TagKey, ServiceTag | undefined>();
    for (const def of TAG_DEFS) m.set(def.key, tags.find(t => def.match.test(t.nome)));
    return m;
  }, [tags]);

  const tagIdToKey = useMemo(() => {
    const m = new Map<string, TagKey>();
    for (const [k, t] of tagsByKey.entries()) if (t) m.set(t.id, k);
    return m;
  }, [tagsByKey]);

  const filteredRows = useMemo(
    () => rows.filter(r =>
      r.eap_item &&
      r.eap_item.tag_id &&
      tagIdToKey.has(r.eap_item.tag_id) &&
      (obraId === 'all' || r.eap_item.obra_id === obraId),
    ),
    [rows, obraId, tagIdToKey],
  );

  const periods = useMemo(() => buildPeriods(granularity, anchor), [granularity, anchor]);

  // chartData: array of { label, agua, pluvial, cloacal, pavimentacao }
  const chartData = useMemo(() => {
    return periods.map(p => {
      const point: Record<string, any> = { label: p.label, key: p.key };
      for (const def of TAG_DEFS) {
        let total = 0;
        for (const r of filteredRows) {
          const tk = tagIdToKey.get(r.eap_item!.tag_id!);
          if (tk !== def.key) continue;
          const d = parseISO(r.data);
          if (mode === 'period') {
            if (isWithinInterval(d, { start: p.start, end: p.end })) total += r.quantidade_dia;
          } else {
            // acumulado: até o fim do período
            if (isBefore(d, p.end) || isEqual(d, p.end)) total += r.quantidade_dia;
          }
        }
        point[def.key] = Math.round(total * 100) / 100;
      }
      return point;
    });
  }, [periods, filteredRows, tagIdToKey, mode]);

  const navigate = (dir: -1 | 1) => {
    setAnchor(prev => granularity === 'month' ? addMonths(prev, dir * 3) : addWeeks(prev, dir * 3));
  };

  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < 10) return;
    e.preventDefault();
    setAnchor(prev => granularity === 'month'
      ? addMonths(prev, e.deltaX > 0 ? 1 : -1)
      : addWeeks(prev, e.deltaX > 0 ? 1 : -1));
  };

  const isLoading = loadingRows || loadingTags;
  const hasData = filteredRows.length > 0;

  // split tags into 2 charts by unit (m vs m²)
  const metersTags = TAG_DEFS.filter(d => d.key !== 'pavimentacao');
  const sqmTags = TAG_DEFS.filter(d => d.key === 'pavimentacao');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </CardContent>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm font-body text-muted-foreground">
          Sem histórico de execução para itens com tag. Lance avanços nos diários para visualizar.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-body text-muted-foreground">Granularidade:</span>
            <ToggleGroup type="single" size="sm" value={granularity}
              onValueChange={v => v && setGranularity(v as Granularity)}>
              <ToggleGroupItem value="week" className="text-xs">Semana</ToggleGroupItem>
              <ToggleGroupItem value="month" className="text-xs">Mês</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-body text-muted-foreground">Modo:</span>
            <ToggleGroup type="single" size="sm" value={mode}
              onValueChange={v => v && setMode(v as Mode)}>
              <ToggleGroupItem value="period" className="text-xs">No período</ToggleGroupItem>
              <ToggleGroupItem value="cumulative" className="text-xs">Acumulado</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-body text-muted-foreground px-2 tabular-nums">
              {periods[0]?.label} — {periods[periods.length - 1]?.label}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Charts */}
        <div ref={scrollRef} onWheel={onWheel} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Redes lineares (m)" data={chartData} tagDefs={metersTags} unit="m" />
          <ChartCard title="Pavimentação (m²)" data={chartData} tagDefs={sqmTags} unit="m²" />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-body border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-heading font-semibold">Tag</th>
                {periods.map(p => (
                  <th key={p.key} className="text-right py-2 px-2 font-heading font-semibold tabular-nums">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TAG_DEFS.map(def => {
                const unit = def.key === 'pavimentacao' ? 'm²' : 'm';
                return (
                  <tr key={def.key} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: def.color }} />
                        {def.short}
                      </div>
                    </td>
                    {chartData.map(d => (
                      <td key={d.key} className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                        {fmtNum(d[def.key])}<span className="text-[10px] ml-0.5">{unit}</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, data, tagDefs, unit }: {
  title: string;
  data: any[];
  tagDefs: typeof TAG_DEFS;
  unit: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs font-heading font-semibold mb-2 text-muted-foreground">{title}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(v)} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const idx = data.findIndex(d => d.label === label);
                const prev = idx > 0 ? data[idx - 1] : null;
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 shadow-md text-xs font-body">
                    <div className="font-semibold mb-1">{label}</div>
                    {payload.map((p: any) => {
                      const def = tagDefs.find(d => d.key === p.dataKey);
                      if (!def) return null;
                      const v = Number(p.value) || 0;
                      const prevV = prev ? Number(prev[def.key]) || 0 : 0;
                      const diff = v - prevV;
                      return (
                        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: def.color }} />
                          <span className="flex-1">{def.label}</span>
                          <span className="tabular-nums font-semibold">{fmtNum(v)} {unit}</span>
                          {prev && (
                            <span className={`tabular-nums text-[10px] ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {diff >= 0 ? '+' : ''}{fmtNum(diff)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {tagDefs.map(def => (
              <Line
                key={def.key}
                type="monotone"
                dataKey={def.key}
                name={def.label}
                stroke={def.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
