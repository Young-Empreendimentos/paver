import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, CloudSun, Cloud, CloudRain, Sun, Snowflake, Trash2,
  ClipboardList, User, Clock, Check, Camera, ChevronRight, Building2, FileDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, fetchAllDiarios, deleteDiario, fetchEapItems, DiarioObra } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { exportDiarioPdf } from '@/lib/exportDiarioPdf';

const climaOptions = [
  { value: 'ensolarado', label: 'Ensolarado', icon: Sun },
  { value: 'nublado', label: 'Nublado', icon: Cloud },
  { value: 'parcialmente_nublado', label: 'Parc. Nublado', icon: CloudSun },
  { value: 'chuvoso', label: 'Chuvoso', icon: CloudRain },
  { value: 'frio', label: 'Frio', icon: Snowflake },
];

const climaLabels: Record<string, string> = Object.fromEntries(climaOptions.map(c => [c.value, c.label]));

export default function DiarioObraPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const canEdit = isAdmin || hasRole('engenharia');

  const canModifyDiario = (diario: DiarioObra) => {
    if (isAdmin) return true;
    if (diario.created_by !== user?.id) return false;
    const created = new Date(diario.created_at);
    return (Date.now() - created.getTime()) <= 2 * 24 * 60 * 60 * 1000;
  };

  const [selectedObraId, setSelectedObraId] = useState<string>('all');
  const [exportingId, setExportingId] = useState<string | null>(null);

  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const obrasMap = useMemo(() => new Map(obras.map(o => [o.id, o.nome])), [obras]);

  const { data: allDiarios = [], isLoading } = useQuery({
    queryKey: ['diarios-all'],
    queryFn: fetchAllDiarios,
  });

  const diarios = useMemo(() => {
    if (!selectedObraId || selectedObraId === 'all') return allDiarios;
    return allDiarios.filter(d => d.obra_id === selectedObraId);
  }, [allDiarios, selectedObraId]);

  // Fetch atividades for all diários
  const allDiarioIds = allDiarios.map(d => d.id);
  const { data: allAtividades = [] } = useQuery({
    queryKey: ['diario-atividades-all', allDiarioIds.length],
    queryFn: async () => {
      if (allDiarioIds.length === 0) return [];
      // Batch in chunks of 200 to avoid query limits
      const chunks: string[][] = [];
      for (let i = 0; i < allDiarioIds.length; i += 200) chunks.push(allDiarioIds.slice(i, i + 200));
      const results = await Promise.all(chunks.map(async chunk => {
        const { data } = await supabase.from('paver_diario_atividades').select('diario_id, eap_item_id').in('diario_id', chunk);
        return data || [];
      }));
      return results.flat() as { diario_id: string; eap_item_id: string }[];
    },
    enabled: allDiarioIds.length > 0,
  });

  // Fetch EAP item descriptions for referenced items
  const eapItemIds = [...new Set(allAtividades.map(a => a.eap_item_id))];
  const { data: eapDescMap = {} } = useQuery({
    queryKey: ['eap-desc-map', eapItemIds.length],
    queryFn: async () => {
      if (eapItemIds.length === 0) return {};
      const chunks: string[][] = [];
      for (let i = 0; i < eapItemIds.length; i += 200) chunks.push(eapItemIds.slice(i, i + 200));
      const results = await Promise.all(chunks.map(async chunk => {
        const { data } = await supabase.from('paver_eap_items').select('id, descricao').in('id', chunk);
        return data || [];
      }));
      const map: Record<string, string> = {};
      results.flat().forEach((i: any) => { map[i.id] = i.descricao; });
      return map;
    },
    enabled: eapItemIds.length > 0,
  });

  const getAtividadesSummary = (diarioId: string): string => {
    const items = allAtividades.filter(a => a.diario_id === diarioId);
    if (items.length === 0) return '—';
    const descs = items.map(a => eapDescMap[a.eap_item_id] || 'Item').filter(Boolean);
    return descs.join(', ');
  };

  // Fetch fotos localizadas counts per diário
  const { data: fotosLocCountMap = {} } = useQuery({
    queryKey: ['fotos-loc-counts', allDiarioIds.length],
    queryFn: async () => {
      if (allDiarioIds.length === 0) return {};
      const chunks: string[][] = [];
      for (let i = 0; i < allDiarioIds.length; i += 200) chunks.push(allDiarioIds.slice(i, i + 200));
      const results = await Promise.all(chunks.map(async chunk => {
        const { data } = await supabase.from('paver_fotos_localizadas').select('diario_id').in('diario_id', chunk);
        return data || [];
      }));
      const map: Record<string, number> = {};
      results.flat().forEach((r: any) => { map[r.diario_id] = (map[r.diario_id] || 0) + 1; });
      return map;
    },
    enabled: allDiarioIds.length > 0,
  });

  const userIds = [...new Set(allDiarios.map(d => d.created_by).filter(Boolean))];
  const { data: profilesMap = {} } = useQuery({
    queryKey: ['paver-profiles', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      const { data } = await supabase.from('paver_profiles').select('id, full_name').in('id', userIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.full_name || 'Sem nome'; });
      return map;
    },
    enabled: userIds.length > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDiario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios-all'] });
      queryClient.invalidateQueries({ queryKey: ['eap'] });
      queryClient.invalidateQueries({ queryKey: ['eap-all'] });
      queryClient.invalidateQueries({ queryKey: ['eap-items-balance'] });
      toast({ title: 'Diário excluído e avanço recalculado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const handleExportPdf = async (diario: DiarioObra) => {
    setExportingId(diario.id);
    try {
      const obraNome = obrasMap.get(diario.obra_id) || 'Obra';
      const { data: ativs } = await supabase.from('paver_diario_atividades').select('*').eq('diario_id', diario.id);
      const atividadesList = ativs || [];
      const eapItems = await fetchEapItems(diario.obra_id);
      const eapItensOnly = eapItems.filter(i => i.tipo === 'item');
      const localEapMap = new Map(eapItensOnly.map(i => [i.id, i]));
      const { data: sums } = await supabase.rpc('get_eap_avanco_sums', { p_obra_id: diario.obra_id });
      const localAvancoMap = new Map((sums || []).map((r: any) => [r.eap_item_id, Number(r.sum_quantidade_dia)]));
      const { data: prof } = await supabase.from('paver_profiles').select('full_name').eq('id', diario.created_by).single();
      const { data: fotosLoc } = await supabase.from('paver_fotos_localizadas').select('foto_url').eq('diario_id', diario.id);
      const allFotoUrls = [...new Set([...(diario.fotos || []), ...(fotosLoc || []).map((f: any) => f.foto_url)])];
      const fmtDate = (ds: string) => new Date(ds + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      await exportDiarioPdf({
        data: fmtDate(diario.data),
        obraNome,
        climaManha: diario.clima_manha || diario.clima,
        climaTarde: diario.clima_tarde || diario.clima,
        equipes: diario.mao_de_obra || '',
        observacoes: diario.observacoes || '',
        autor: prof?.full_name || 'Usuário',
        criadoEm: formatCreatedAt(diario.created_at),
        atividades: atividadesList.map((a: any) => {
          const item = localEapMap.get(a.eap_item_id);
          const totalQtd = item?.quantidade || 0;
          const acumulado = localAvancoMap.get(a.eap_item_id) || 0;
          const saldo = Math.max(0, totalQtd - acumulado);
          const perc = totalQtd > 0 ? Math.min(100, Math.round((acumulado / totalQtd) * 10000) / 100) : 0;
          return {
            codigo: item?.codigo || '—', descricao: item?.descricao || 'Item removido',
            pacote: item?.pacote || '—', lote: item?.lote || '—',
            qtdTotal: totalQtd > 0 ? `${totalQtd} ${item?.unidade || 'un'}` : '—',
            qtdDia: a.quantidade_dia > 0 ? `+${a.quantidade_dia}` : '—',
            acumulada: acumulado > 0 ? `${Number(acumulado.toFixed(2))} ${item?.unidade || 'un'}` : '—',
            saldo: totalQtd > 0 ? `${Number(saldo.toFixed(2))} ${item?.unidade || 'un'}` : '—',
            percentual: `${perc}%`,
          };
        }),
        fotoUrls: allFotoUrls,
      });
    } catch (err: any) {
      toast({ title: 'Erro ao exportar', description: err.message, variant: 'destructive' });
    } finally {
      setExportingId(null);
    }
  };

  const ClimaIcon = ({ clima }: { clima: string }) => {
    const opt = climaOptions.find(c => c.value === clima);
    if (!opt) return null;
    const Icon = opt.icon;
    return <Icon className="h-4 w-4" />;
  };

  const formatCreatedAt = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end flex-wrap gap-3">
        {canEdit && selectedObraId && selectedObraId !== 'all' && (
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"
            onClick={() => navigate(`/diario-obra/novo?obra=${selectedObraId}`)}>
            <Plus className="h-4 w-4 mr-2" />Novo Registro
          </Button>
        )}
      </div>

      <div className="max-w-xs">
        <Label className="font-body text-sm">Filtrar por Obra</Label>
        <Select value={selectedObraId} onValueChange={setSelectedObraId}>
          <SelectTrigger className="font-body mt-1"><SelectValue placeholder="Todas as obras" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-body">Todas as obras</SelectItem>
            {obras.map(o => (
              <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
          ) : diarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground font-body">Nenhum diário registrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {diarios.map(diario => {
                const fotoCount = (diario.fotos?.length || 0) + (fotosLocCountMap[diario.id] || 0);
                const obraNome = obrasMap.get(diario.obra_id) || 'Obra desconhecida';
                return (
                  <div
                    key={diario.id}
                    className="border rounded-lg p-3 space-y-1.5 cursor-pointer hover:bg-muted/30 transition-colors group"
                    onClick={() => navigate(`/diario-obra/${diario.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-sm font-heading font-semibold whitespace-nowrap">
                          {new Date(diario.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <Badge variant="outline" className="text-[10px] flex items-center gap-1 shrink-0">
                          <ClimaIcon clima={diario.clima_manha || diario.clima} />
                          Manhã - {climaLabels[diario.clima_manha || diario.clima] || diario.clima}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] flex items-center gap-1 shrink-0">
                          <ClimaIcon clima={diario.clima_tarde || diario.clima} />
                          Tarde - {climaLabels[diario.clima_tarde || diario.clima] || diario.clima}
                        </Badge>
                        {fotoCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            <Camera className="h-3 w-3 mr-0.5" />{fotoCount}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                          disabled={exportingId === diario.id}
                          onClick={() => handleExportPdf(diario)}
                        >
                          {exportingId === diario.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                        </Button>
                        {canModifyDiario(diario) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="font-heading">Excluir diário?</AlertDialogTitle>
                                <AlertDialogDescription className="font-body">Essa ação é irreversível.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(diario.id)} className="bg-destructive text-destructive-foreground font-body">Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    {/* Obra name */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body truncate">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{obraNome}</span>
                    </div>

                    {/* Atividades medidas */}
                    <p className="text-xs font-body text-foreground/70 truncate">
                      <span className="text-muted-foreground">Atividades medidas: </span>
                      {(() => {
                        const summary = getAtividadesSummary(diario.id);
                        return summary.length > 40 ? summary.slice(0, 40) + '…' : summary;
                      })()}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center gap-4 pt-1 border-t border-border/50">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-body">
                        <User className="h-3 w-3" />{profilesMap[diario.created_by] || 'Usuário'}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-body">
                        <Clock className="h-3 w-3" />{formatCreatedAt(diario.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
