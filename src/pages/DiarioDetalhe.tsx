import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Loader2, CloudSun, Cloud, CloudRain, Sun, Snowflake,
  User, Clock, Camera, Video, Eye, Building2, MapPin, FileDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { fetchObras, fetchEapItems, fetchPlantas, FotoLocalizada, PlantaObra } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { exportDiarioPdf } from '@/lib/exportDiarioPdf';
import CollapsibleClassification from '@/components/CollapsibleClassification';
import DxfPlantaViewer from '@/components/DxfPlantaViewer';

const climaOptions = [
  { value: 'ensolarado', label: 'Ensolarado', icon: Sun },
  { value: 'nublado', label: 'Nublado', icon: Cloud },
  { value: 'parcialmente_nublado', label: 'Parc. Nublado', icon: CloudSun },
  { value: 'chuvoso', label: 'Chuvoso', icon: CloudRain },
  { value: 'frio', label: 'Frio', icon: Snowflake },
];
const climaLabels: Record<string, string> = Object.fromEntries(climaOptions.map(c => [c.value, c.label]));

function isVideo(url: string) {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

function isDxf(url: string) {
  return url.toLowerCase().includes('.dxf');
}

interface DiarioAtividade {
  id: string;
  diario_id: string;
  eap_item_id: string;
  avanco_percentual: number;
  quantidade_dia: number;
}

export default function DiarioDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dxfViewerPlanta, setDxfViewerPlanta] = useState<PlantaObra | null>(null);
  const [highlightFotoId, setHighlightFotoId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Fetch the diário
  const { data: diario, isLoading } = useQuery({
    queryKey: ['diario-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paver_diarios')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch obra name
  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const obraNome = useMemo(() => obras.find(o => o.id === diario?.obra_id)?.nome || '', [obras, diario]);

  // Fetch EAP items for this obra
  const { data: eapItems = [] } = useQuery({
    queryKey: ['eap', diario?.obra_id],
    queryFn: () => fetchEapItems(diario!.obra_id),
    enabled: !!diario?.obra_id,
  });
  const eapItensOnly = useMemo(() => eapItems.filter(i => i.tipo === 'item'), [eapItems]);
  const eapMap = useMemo(() => new Map(eapItensOnly.map(i => [i.id, i])), [eapItensOnly]);

  // Fetch atividades for this diário
  const { data: atividades = [] } = useQuery({
    queryKey: ['diario-atividades', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paver_diario_atividades')
        .select('*')
        .eq('diario_id', id!);
      if (error) throw error;
      return data as DiarioAtividade[];
    },
    enabled: !!id,
  });

  // Fetch all avanço sums per eap_item for this obra to compute remaining
  const { data: avancoSums = [] } = useQuery({
    queryKey: ['eap-avanco-sums', diario?.obra_id],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_eap_avanco_sums', { p_obra_id: diario!.obra_id });
      return (data || []) as { eap_item_id: string; sum_quantidade_dia: number }[];
    },
    enabled: !!diario?.obra_id,
  });
  const avancoMap = useMemo(() => new Map(avancoSums.map(r => [r.eap_item_id, Number(r.sum_quantidade_dia)])), [avancoSums]);

  // Fetch profile
  const { data: profileName } = useQuery({
    queryKey: ['paver-profile', diario?.created_by],
    queryFn: async () => {
      const { data } = await supabase.from('paver_profiles').select('full_name').eq('id', diario!.created_by).single();
      return data?.full_name || 'Sem nome';
    },
    enabled: !!diario?.created_by,
  });

  // Fetch fotos localizadas linked to this diário
  const { data: fotosLocalizadas = [] } = useQuery({
    queryKey: ['fotos-localizadas-diario', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paver_fotos_localizadas')
        .select('*')
        .eq('diario_id', id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as FotoLocalizada[];
    },
    enabled: !!id,
  });

  // Fetch plantas for this obra (to allow viewing DXF)
  const { data: plantas = [] } = useQuery({
    queryKey: ['plantas', diario?.obra_id],
    queryFn: () => fetchPlantas(diario!.obra_id),
    enabled: !!diario?.obra_id,
  });

  // Group fotos by planta
  const fotosComPin = useMemo(() => fotosLocalizadas.filter(f => f.pos_x != null && f.pos_y != null), [fotosLocalizadas]);
  const plantasComFotos = useMemo(() => {
    const plantaIds = [...new Set(fotosComPin.map(f => f.planta_id))];
    return plantas.filter(p => plantaIds.includes(p.id) && isDxf(p.imagem_url));
  }, [fotosComPin, plantas]);

  // All fotos (from diario.fotos array + fotos localizadas)
  const allFotoUrls = useMemo(() => {
    const fromDiario = (diario?.fotos || []) as string[];
    const fromLocalizadas = fotosLocalizadas.map(f => f.foto_url);
    // Deduplicate
    return [...new Set([...fromDiario, ...fromLocalizadas])];
  }, [diario, fotosLocalizadas]);

  // Map foto URL to FotoLocalizada for pin info
  const fotoLocMap = useMemo(() => {
    const map = new Map<string, FotoLocalizada>();
    fotosLocalizadas.forEach(f => map.set(f.foto_url, f));
    return map;
  }, [fotosLocalizadas]);

  const ClimaIcon = ({ clima }: { clima: string }) => {
    const opt = climaOptions.find(c => c.value === clima);
    if (!opt) return null;
    const Icon = opt.icon;
    return <Icon className="h-4 w-4" />;
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const formatCreatedAt = (dateStr: string) =>
    new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!diario) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/diario-obra')}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <p className="text-sm text-muted-foreground font-body">Diário não encontrado.</p>
      </div>
    );
  }

  const visibleFotoIds = highlightFotoId ? new Set([highlightFotoId]) : new Set(fotosComPin.map(f => f.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/diario-obra')}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <h1 className="text-xl font-heading font-bold text-foreground flex-1">
          Diário de Obra — {formatDate(diario.data)}
        </h1>
        <Button
          size="sm"
          variant="outline"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await exportDiarioPdf({
                data: formatDate(diario.data),
                obraNome: obraNome,
                climaManha: diario.clima_manha || diario.clima,
                climaTarde: diario.clima_tarde || diario.clima,
                equipes: diario.mao_de_obra || '',
                observacoes: diario.observacoes || '',
                autor: profileName || 'Usuário',
                criadoEm: formatCreatedAt(diario.created_at),
                atividades: atividades.map(a => {
                  const item = eapMap.get(a.eap_item_id);
                  const totalQtd = item?.quantidade || 0;
                  const acumulado = avancoMap.get(a.eap_item_id) || 0;
                  const saldo = Math.max(0, totalQtd - acumulado);
                  const perc = totalQtd > 0 ? Math.min(100, Math.round((acumulado / totalQtd) * 10000) / 100) : 0;
                  return {
                    codigo: item?.codigo || '—',
                    descricao: item?.descricao || 'Item removido',
                    pacote: item?.pacote || '—',
                    lote: item?.lote || '—',
                    qtdTotal: totalQtd > 0 ? `${totalQtd} ${item?.unidade || 'un'}` : '—',
                    qtdDia: a.quantidade_dia > 0 ? `+${a.quantidade_dia}` : '—',
                    acumulada: acumulado > 0 ? `${Number(acumulado.toFixed(2))} ${item?.unidade || 'un'}` : '—',
                    saldo: totalQtd > 0 ? `${Number(saldo.toFixed(2))} ${item?.unidade || 'un'}` : '—',
                    percentual: `${perc}%`,
                  };
                }),
                fotoUrls: allFotoUrls,
              });
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileDown className="h-4 w-4 mr-1" />}
          Exportar PDF
        </Button>
      </div>

      {/* Header info */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs font-body text-muted-foreground">Obra</span>
              <p className="text-sm font-body font-medium flex items-center gap-1.5 mt-0.5">
                <Building2 className="h-3.5 w-3.5 text-accent" />{obraNome}
              </p>
            </div>
            <div>
              <span className="text-xs font-body text-muted-foreground">Clima Manhã</span>
              <p className="text-sm font-body flex items-center gap-1.5 mt-0.5">
                <ClimaIcon clima={diario.clima_manha || diario.clima} />
                {climaLabels[diario.clima_manha || diario.clima] || diario.clima}
              </p>
            </div>
            <div>
              <span className="text-xs font-body text-muted-foreground">Clima Tarde</span>
              <p className="text-sm font-body flex items-center gap-1.5 mt-0.5">
                <ClimaIcon clima={diario.clima_tarde || diario.clima} />
                {climaLabels[diario.clima_tarde || diario.clima] || diario.clima}
              </p>
            </div>
            <div>
              <span className="text-xs font-body text-muted-foreground">Equipes</span>
              <p className="text-sm font-body mt-0.5">{diario.mao_de_obra || '—'}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-border/50">
            <span className="flex items-center gap-1 text-xs text-muted-foreground font-body">
              <User className="h-3 w-3" />{profileName || 'Usuário'}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground font-body">
              <Clock className="h-3 w-3" />{formatCreatedAt(diario.created_at)}
            </span>
          </div>

          {diario.observacoes && (
            <div className="pt-2 border-t border-border/50">
              <span className="text-xs font-body text-muted-foreground">Observações</span>
              <p className="text-sm font-body mt-0.5 italic text-foreground/80">{diario.observacoes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atividades medidas */}
      <Card>
        <CardContent className="pt-6">
          {atividades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground font-body">
                {diario.atividades && diario.atividades !== 'Sem atividades registradas'
                  ? diario.atividades
                  : 'Nenhuma atividade medida neste diário.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-body text-xs">Código</TableHead>
                    <TableHead className="font-body text-xs">Descrição</TableHead>
                    <TableHead className="font-body text-xs">Pacote</TableHead>
                    <TableHead className="font-body text-xs">Lote</TableHead>
                    <TableHead className="font-body text-xs text-right">Qtd. Total</TableHead>
                    <TableHead className="font-body text-xs text-right">Qtd. Dia</TableHead>
                    <TableHead className="font-body text-xs text-right">Acumulada</TableHead>
                    <TableHead className="font-body text-xs text-right">Saldo</TableHead>
                    <TableHead className="font-body text-xs text-right">%</TableHead>
                    <TableHead className="font-body text-xs w-20">Progresso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atividades.map(a => {
                    const item = eapMap.get(a.eap_item_id);
                    const totalQtd = item?.quantidade || 0;
                    const acumulado = avancoMap.get(a.eap_item_id) || 0;
                    const saldo = Math.max(0, totalQtd - acumulado);
                    const percTotal = totalQtd > 0 ? Math.min(100, Math.round((acumulado / totalQtd) * 10000) / 100) : 0;

                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{item?.codigo || '—'}</TableCell>
                        <TableCell className="text-sm font-body">
                          <div>
                            {item?.descricao || 'Item removido'}
                            {item?.classificacao_adicional && (
                              <CollapsibleClassification text={item.classificacao_adicional} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-body text-muted-foreground">{item?.pacote || '—'}</TableCell>
                        <TableCell className="text-xs font-body text-muted-foreground">{item?.lote || '—'}</TableCell>
                        <TableCell className="text-sm font-body text-right">{totalQtd > 0 ? `${totalQtd} ${item?.unidade || 'un'}` : '—'}</TableCell>
                        <TableCell className="text-sm font-body text-right font-medium text-accent">{a.quantidade_dia > 0 ? `+${a.quantidade_dia}` : '—'}</TableCell>
                        <TableCell className="text-sm font-body text-right">{acumulado > 0 ? `${Number(acumulado.toFixed(2))} ${item?.unidade || 'un'}` : '—'}</TableCell>
                        <TableCell className="text-sm font-body text-right">{totalQtd > 0 ? `${Number(saldo.toFixed(2))} ${item?.unidade || 'un'}` : '—'}</TableCell>
                        <TableCell className="text-sm font-body text-right font-medium">{percTotal}%</TableCell>
                        <TableCell>
                          <Progress value={percTotal} className="h-2" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fotos e Vídeos */}
      {allFotoUrls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Camera className="h-5 w-5 text-accent" />
              Fotos e Vídeos ({allFotoUrls.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {allFotoUrls.map((url, i) => {
                const fotoLoc = fotoLocMap.get(url);
                const hasDxfPin = fotoLoc && fotoLoc.pos_x != null && fotoLoc.pos_y != null;
                const planta = hasDxfPin ? plantas.find(p => p.id === fotoLoc.planta_id) : null;

                return (
                  <div key={i} className="relative group">
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="aspect-square rounded-md overflow-hidden border border-border bg-muted relative block">
                      {isVideo(url) ? (
                        <>
                          <video src={url} className="w-full h-full object-cover" muted />
                          <div className="absolute top-1 left-1">
                            <Badge variant="secondary" className="text-[8px] px-1 h-4"><Video className="h-2.5 w-2.5" /></Badge>
                          </div>
                        </>
                      ) : (
                        <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </div>
                    </a>
                    {/* Pin indicator + button */}
                    {hasDxfPin && planta && isDxf(planta.imagem_url) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute bottom-1 right-1 h-6 px-1.5 text-[10px] gap-1 opacity-80 hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setHighlightFotoId(fotoLoc.id);
                          setDxfViewerPlanta(planta);
                        }}
                      >
                        <MapPin className="h-3 w-3" />Ver na planta
                      </Button>
                    )}
                    {fotoLoc?.descricao && (
                      <p className="text-[10px] text-muted-foreground font-body mt-1 truncate">{fotoLoc.descricao}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick access: view all pins on DXF */}
            {plantasComFotos.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground font-body mb-2">Visualizar posição na planta:</p>
                <div className="flex flex-wrap gap-2">
                  {plantasComFotos.map(p => (
                    <Button key={p.id} size="sm" variant="outline" className="text-xs gap-1.5"
                      onClick={() => { setHighlightFotoId(null); setDxfViewerPlanta(p); }}>
                      <MapPin className="h-3 w-3 text-accent" />
                      {p.nome || 'Planta DXF'}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DXF Viewer Dialog */}
      <Dialog open={!!dxfViewerPlanta} onOpenChange={v => { if (!v) { setDxfViewerPlanta(null); setHighlightFotoId(null); } }}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 overflow-hidden">
          {dxfViewerPlanta && (
            <DxfPlantaViewer
              planta={dxfViewerPlanta}
              obraId={diario.obra_id}
              canEdit={false}
              visibleFotoIds={visibleFotoIds}
              onClose={() => { setDxfViewerPlanta(null); setHighlightFotoId(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
