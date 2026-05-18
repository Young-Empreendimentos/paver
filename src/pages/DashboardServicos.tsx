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
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-accent" />
            Executado vs Total (por tag)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 border border-dashed border-border rounded-md text-sm font-body text-muted-foreground">
            Em breve
          </div>
        </CardContent>
      </Card>

      {/* Section C */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-accent" />
            Executado por Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 border border-dashed border-border rounded-md text-sm font-body text-muted-foreground">
            Em breve
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
