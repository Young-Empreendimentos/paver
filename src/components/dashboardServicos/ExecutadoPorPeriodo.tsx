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

import { paverDb } from '@/integrations/supabase/paver';
import { fetchServiceTags, type ServiceTag } from '@/services/serviceTagsApi';

type Granularity = 'week' | 'month';
type Mode = 'period' | 'cumulative';

const COLORS = [
  '#0ea5e9', '#64748b', '#b45309', '#3f3f46',
  '#10b981', '#8b5cf6', '#f43f5e', '#06b6d4',
];

const VISIBLE = 6;
const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

interface DiarioRow {
  quantidade_dia: number;
  data: string;
  eap_item: {
    obra_id: string;
    tag_id: string | null;
  } | null;
}

async function fetchDiarioHistorico(): Promise<DiarioRow[]> {
  const [atvRes, diariosRes, itemsRes] = await Promise.all([
    paverDb.from('paver_diario_atividades').select('quantidade_dia, diario_id, eap_item_id'),
    paverDb.from('paver_diarios').select('id, data'),
    paverDb.from('paver_eap_items').select('id, obra_id, tag_id').not('tag_id', 'is', null),
  ]);
  if (atvRes.error) throw atvRes.error;
  if (diariosRes.error) throw diariosRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const diarioById = new Map((diariosRes.data || []).map((d: any) => [d.id, d.data as string]));
  const itemById = new Map(
    (itemsRes.data || []).map((i: any) => [i.id, { obra_id: i.obra_id as string, tag_id: i.tag_id as string | null }]),
  );

  const rows: DiarioRow[] = [];
  for (const a of (atvRes.data || []) as any[]) {
    const item = itemById.get(a.eap_item_id);
    const data = diarioById.get(a.diario_id);
    if (!item || !data) continue;
    rows.push({
      quantidade_dia: Number(a.quantidade_dia) || 0,
      data,
      eap_item: item,
    });
  }
  return rows;
}

interface Props {
  obraId: string;
}

interface Period {
  start: Date;
  end: Date;
  label: string;
  key: string;
}

function buildPeriods(granularity: Granularity, anchor: Date): Period[] {
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
      const sameMonth = format(start, 'MM') === format(end, 'MM');
      const label = sameMonth
        ? `${format(start, 'd')}–${format(end, 'd/MMM', { locale: ptBR })}`
        : `${format(start, 'd/MMM', { locale: ptBR })}–${format(end, 'd/MMM', { locale: ptBR })}`;
      periods.push({
        start, end,
        label,
        key: format(start, 'yyyy-ww'),
      });
    }
  }
  return periods;
}

interface TagDef {
  id: string;
  label: string;
  short: string;
  color: string;
  unidade: string;
}

export default function ExecutadoPorPeriodo({ obraId }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [mode, setMode] = useState<Mode>('period');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: rows = [], isLoading: loadingRows } = useQuery({
    queryKey: ['diario-historico-tags'],
    queryFn: fetchDiarioHistorico,
    staleTime: 0,
  });

  const { data: tags = [], isLoading: loadingTags } = useQuery({
    queryKey: ['service-tags'],
    queryFn: fetchServiceTags,
    staleTime: 0,
  });

  const tagDefs: TagDef[] = useMemo(
    () => tags.map((t, i) => {
      const stripped = t.nome.replace(/^MO de (execução de )?/i, '').trim();
      return {
        id: t.id,
        label: t.nome,
        short: stripped.charAt(0).toUpperCase() + stripped.slice(1),
        color: COLORS[i % COLORS.length],
        unidade: t.unidade_permitida || '',
      };
    }),
    [tags],
  );

  const tagIds = useMemo(() => new Set(tagDefs.map(t => t.id)), [tagDefs]);

  const filteredRows = useMemo(
    () => rows.filter(r =>
      r.eap_item &&
      r.eap_item.tag_id &&
      tagIds.has(r.eap_item.tag_id) &&
      (obraId === 'all' || r.eap_item.obra_id === obraId),
    ),
    [rows, obraId, tagIds],
  );

  const periods = useMemo(() => buildPeriods(granularity, anchor), [granularity, anchor]);

  const chartData = useMemo(() => {
    return periods.map(p => {
      const point: Record<string, any> = { label: p.label, key: p.key };
      for (const def of tagDefs) {
        let total = 0;
        for (const r of filteredRows) {
          if (r.eap_item!.tag_id !== def.id) continue;
          const d = parseISO(r.data);
          if (mode === 'period') {
            if (isWithinInterval(d, { start: p.start, end: p.end })) total += r.quantidade_dia;
          } else {
            if (isBefore(d, p.end) || isEqual(d, p.end)) total += r.quantidade_dia;
          }
        }
        point[def.id] = Math.round(total * 100) / 100;
      }
      return point;
    });
  }, [periods, filteredRows, tagDefs, mode]);

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

  // Group tag defs by unidade for separate charts
  const tagsByUnit = useMemo(() => {
    const m = new Map<string, TagDef[]>();
    for (const def of tagDefs) {
      const u = def.unidade || '—';
      if (!m.has(u)) m.set(u, []);
      m.get(u)!.push(def);
    }
    return Array.from(m.entries());
  }, [tagDefs]);

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

        <div ref={scrollRef} onWheel={onWheel} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tagsByUnit.map(([unit, defs]) => (
            <ChartCard
              key={unit}
              title={`Unidade: ${unit}`}
              data={chartData}
              tagDefs={defs}
              unit={unit}
            />
          ))}
        </div>

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
              {tagDefs.map(def => (
                <tr key={def.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: def.color }} />
                      <span className="truncate max-w-[240px]" title={def.label}>{def.short}</span>
                    </div>
                  </td>
                  {chartData.map(d => (
                    <td key={d.key} className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                      {fmtNum(d[def.id])}<span className="text-[10px] ml-0.5">{def.unidade}</span>
                    </td>
                  ))}
                </tr>
              ))}
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
  tagDefs: TagDef[];
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
                      const def = tagDefs.find(d => d.id === p.dataKey);
                      if (!def) return null;
                      const v = Number(p.value) || 0;
                      const prevV = prev ? Number(prev[def.id]) || 0 : 0;
                      const diff = v - prevV;
                      return (
                        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: def.color }} />
                          <span className="flex-1">{def.short}</span>
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
                key={def.id}
                type="monotone"
                dataKey={def.id}
                name={def.short}
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
