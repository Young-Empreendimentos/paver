import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, FileBarChart, TrendingUp, ClipboardList, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { fetchObras, fetchAllEapItems, fetchDiariosThisMonth } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { PendingAccessRequests } from '@/components/PendingAccessRequests';

const statusLabels: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  pausada: 'Pausada',
  cancelada: 'Cancelada',
};

const statusColors: Record<string, string> = {
  em_andamento: 'bg-blue-500/10 text-blue-700',
  concluida: 'bg-green-500/10 text-green-700',
  pausada: 'bg-yellow-500/10 text-yellow-700',
  cancelada: 'bg-red-500/10 text-red-700',
};

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: eapItems = [] } = useQuery({
    queryKey: ['eap-all'],
    queryFn: fetchAllEapItems,
  });

  const { data: diariosMonth = [] } = useQuery({
    queryKey: ['diarios-month'],
    queryFn: fetchDiariosThisMonth,
  });

  const obrasAtivas = obras.filter(o => o.status === 'em_andamento').length;
  const totalFotos = diariosMonth.reduce((sum, d) => sum + (d.fotos?.length || 0), 0);

  // Average progress across all EAP items
  const avgAvanco = eapItems.length > 0
    ? eapItems.reduce((sum, i) => sum + (i.avanco_realizado || 0), 0) / eapItems.length
    : 0;

  // Detect obras with items missing planned dates
  const obrasWithMissingDates = useMemo(() => {
    const obraMap = new Map<string, { total: number; missing: number }>();
    for (const item of eapItems) {
      if (!obraMap.has(item.obra_id)) obraMap.set(item.obra_id, { total: 0, missing: 0 });
      const entry = obraMap.get(item.obra_id)!;
      entry.total++;
      if (!item.data_inicio_prevista || !item.data_fim_prevista) {
        entry.missing++;
      }
    }
    const result: { obraId: string; obraName: string; total: number; missing: number }[] = [];
    for (const [obraId, counts] of obraMap.entries()) {
      if (counts.missing > 0) {
        const obra = obras.find(o => o.id === obraId);
        result.push({
          obraId,
          obraName: obra?.nome || 'Obra desconhecida',
          ...counts,
        });
      }
    }
    return result;
  }, [eapItems, obras]);

  const stats = [
    { title: 'Obras Ativas', value: String(obrasAtivas), icon: Building2, description: `${obras.length} total cadastradas` },
    { title: 'Diários este Mês', value: String(diariosMonth.length), icon: ClipboardList, description: 'Registros no mês atual' },
    { title: 'Fotos no Mês', value: String(totalFotos), icon: FileBarChart, description: 'Fotos em diários este mês' },
    { title: 'Avanço Médio', value: `${avgAvanco.toFixed(1)}%`, icon: TrendingUp, description: `${eapItems.length} itens de EAP` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground font-body">Visão geral dos empreendimentos</p>
      </div>

      {/* Solicitações de acesso pendentes (somente admins) */}
      <PendingAccessRequests />

      {/* Missing dates alerts */}
      {obrasWithMissingDates.length > 0 && (
        <div className="space-y-2">
          {obrasWithMissingDates.map(({ obraId, obraName, total, missing }) => (
            <Alert key={obraId} variant="destructive" className="cursor-pointer" onClick={() => navigate(`/datas-eap?obra=${obraId}&filter=sem-datas`)}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="font-heading text-sm">
                {obraName} — {missing} atividade{missing > 1 ? 's' : ''} sem datas previstas
              </AlertTitle>
              <AlertDescription className="font-body text-xs">
                {missing} de {total} atividades não possuem datas de início ou fim previstas. Clique para visualizar e corrigir.
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium font-body text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-heading">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1 font-body">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Obras recentes */}
      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground mb-3">Obras Recentes</h2>
        {obras.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground font-body">Nenhuma obra cadastrada ainda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {obras.slice(0, 6).map(obra => {
              const missingInfo = obrasWithMissingDates.find(o => o.obraId === obra.id);
              return (
                <Card
                  key={obra.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/eap`)}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-heading font-semibold leading-tight">{obra.nome}</h3>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ml-2 ${statusColors[obra.status]}`}>
                        {statusLabels[obra.status]}
                      </Badge>
                    </div>
                    {obra.cidade && (
                      <p className="text-xs text-muted-foreground font-body">{obra.cidade}, {obra.estado}</p>
                    )}
                    {missingInfo && (
                      <div className="mt-2 flex items-center gap-1.5 text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-[10px] font-body font-medium">
                          {missingInfo.missing} atividade{missingInfo.missing > 1 ? 's' : ''} sem datas
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
