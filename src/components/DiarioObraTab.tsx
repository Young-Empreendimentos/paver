import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Plus, Loader2, CloudSun, Cloud, CloudRain, Sun, Snowflake, Pencil, Trash2, ClipboardList, User, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDiarios, createDiario, deleteDiario, DiarioObra } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { formatDateOnlyPtBr, todayDateOnly } from '@/lib/dateOnly';

const climaOptions = [
  { value: 'ensolarado', label: 'Ensolarado', icon: Sun },
  { value: 'nublado', label: 'Nublado', icon: Cloud },
  { value: 'parcialmente_nublado', label: 'Parcialmente Nublado', icon: CloudSun },
  { value: 'chuvoso', label: 'Chuvoso', icon: CloudRain },
  { value: 'frio', label: 'Frio', icon: Snowflake },
];

const climaLabels: Record<string, string> = Object.fromEntries(climaOptions.map(c => [c.value, c.label]));

interface DiarioFormData {
  data: string;
  clima: string;
  temperatura_min: string;
  temperatura_max: string;
  mao_de_obra: string;
  atividades: string;
  observacoes: string;
}

const emptyForm: DiarioFormData = {
  data: todayDateOnly(),
  clima: 'ensolarado',
  temperatura_min: '',
  temperatura_max: '',
  mao_de_obra: '0',
  atividades: '',
  observacoes: '',
};

interface DiarioObraTabProps {
  obraId: string;
}

export default function DiarioObraTab({ obraId }: DiarioObraTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('engenharia');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<DiarioFormData>(emptyForm);

  const { data: diarios = [], isLoading } = useQuery({
    queryKey: ['diarios', obraId],
    queryFn: () => fetchDiarios(obraId),
  });

  // Fetch profile names for created_by users
  const userIds = [...new Set(diarios.map(d => d.created_by).filter(Boolean))];
  const { data: profilesMap = {} } = useQuery({
    queryKey: ['paver-profiles', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      const { data } = await supabase
        .from('paver_profiles')
        .select('id, full_name')
        .in('id', userIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.full_name || 'Sem nome'; });
      return map;
    },
    enabled: userIds.length > 0,
  });

  const formatCreatedAt = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: DiarioFormData) => createDiario({
      obra_id: obraId,
      data: data.data,
      clima: data.clima,
      clima_manha: data.clima,
      clima_tarde: data.clima,
      mao_de_obra: data.mao_de_obra || '',
      atividades: data.atividades,
      observacoes: data.observacoes || undefined,
      created_by: user!.id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios', obraId] });
      toast({ title: 'Diário registrado!' });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDiario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios', obraId] });
      queryClient.invalidateQueries({ queryKey: ['eap'] });
      queryClient.invalidateQueries({ queryKey: ['eap-all'] });
      queryClient.invalidateQueries({ queryKey: ['eap-items-balance'] });
      toast({ title: 'Diário excluído e avanço recalculado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const ClimaIcon = ({ clima }: { clima: string }) => {
    const opt = climaOptions.find(c => c.value === clima);
    if (!opt) return null;
    const Icon = opt.icon;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-heading">Diário de Obra</CardTitle>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                <Plus className="h-4 w-4 mr-2" />
                Novo Registro
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading">Novo Diário de Obra</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-body">Data</Label>
                    <Input type="date" value={form.data} onChange={e => {
                      const novaData = e.target.value;
                      const hoje = todayDateOnly();
                      if (novaData && novaData !== hoje) {
                        const [y, m, d] = novaData.split('-');
                        const ok = window.confirm(`Você está lançando este diário para ${d}/${m}/${y}, diferente de hoje (${hoje.split('-').reverse().join('/')}). Confirmar?`);
                        if (!ok) return;
                      }
                      setForm({ ...form, data: novaData });
                    }} required className="font-body" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body">Clima</Label>
                    <Select value={form.clima} onValueChange={v => setForm({ ...form, clima: v })}>
                      <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {climaOptions.map(c => (
                          <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="font-body">Temp. Mín (°C)</Label>
                    <Input type="number" value={form.temperatura_min} onChange={e => setForm({ ...form, temperatura_min: e.target.value })} className="font-body" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body">Temp. Máx (°C)</Label>
                    <Input type="number" value={form.temperatura_max} onChange={e => setForm({ ...form, temperatura_max: e.target.value })} className="font-body" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body">Mão de Obra</Label>
                    <Input type="number" value={form.mao_de_obra} onChange={e => setForm({ ...form, mao_de_obra: e.target.value })} className="font-body" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-body">Atividades Executadas *</Label>
                  <Textarea value={form.atividades} onChange={e => setForm({ ...form, atividades: e.target.value })} required rows={3} className="font-body" />
                </div>
                <div className="space-y-2">
                  <Label className="font-body">Observações</Label>
                  <Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} className="font-body" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="font-body">Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : diarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground font-body">Nenhum diário registrado para esta obra.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {diarios.map(diario => (
              <div key={diario.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-heading font-semibold">
                      {formatDateOnlyPtBr(diario.data, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                      <ClimaIcon clima={diario.clima} />
                      {climaLabels[diario.clima] || diario.clima}
                    </Badge>
                    {(diario.temperatura_min || diario.temperatura_max) && (
                      <span className="text-xs text-muted-foreground font-body">
                        {diario.temperatura_min}°–{diario.temperatura_max}°C
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] font-body">
                      {diario.mao_de_obra} trabalhadores
                    </Badge>
                    {hasRole('admin') && (
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
                  </div>
                </div>
                <p className="text-sm text-foreground font-body">{diario.atividades}</p>
                {diario.observacoes && (
                  <p className="text-xs text-muted-foreground font-body italic">{diario.observacoes}</p>
                )}
                {/* User and timestamp info */}
                <div className="flex items-center gap-4 pt-1 border-t border-border/50">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-body">
                    <User className="h-3 w-3" />
                    {profilesMap[diario.created_by] || 'Usuário desconhecido'}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-body">
                    <Clock className="h-3 w-3" />
                    {formatCreatedAt(diario.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
