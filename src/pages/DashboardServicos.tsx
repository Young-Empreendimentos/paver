import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Activity, Layers, PieChart, CalendarRange } from 'lucide-react';
import { fetchObras } from '@/services/api';
import AvancoPorSubgrupos from '@/components/dashboardServicos/AvancoPorSubgrupos';
import ExecutadoVsTotal from '@/components/dashboardServicos/ExecutadoVsTotal';
import ExecutadoPorPeriodo from '@/components/dashboardServicos/ExecutadoPorPeriodo';

const ALL = 'all';

export default function DashboardServicos() {
  const [obraId, setObraId] = useState<string>(ALL);

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10">
          <Activity className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard de Serviços</h1>
          <p className="text-muted-foreground font-body text-sm">
            Indicadores de avanço por serviço, tag e período
          </p>
        </div>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="space-y-1.5 flex-1 max-w-md">
              <Label htmlFor="obra-filter" className="text-xs font-body text-muted-foreground">
                Obra
              </Label>
              <Select value={obraId} onValueChange={setObraId}>
                <SelectTrigger id="obra-filter" className="font-body text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="font-body">Todas as obras</SelectItem>
                  {obras.map(o => (
                    <SelectItem key={o.id} value={o.id} className="font-body">
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section A */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent" />
          <h2 className="text-base font-heading font-semibold">Avanço por Subgrupos</h2>
        </div>
        <AvancoPorSubgrupos obraId={obraId} />
      </section>

      {/* Section B */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-accent" />
          <h2 className="text-base font-heading font-semibold">Executado vs Total (por tag)</h2>
        </div>
        <ExecutadoVsTotal obraId={obraId} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-accent" />
          <h2 className="text-base font-heading font-semibold">Executado por Período</h2>
        </div>
        <ExecutadoPorPeriodo obraId={obraId} />
      </section>
    </div>
  );
}
