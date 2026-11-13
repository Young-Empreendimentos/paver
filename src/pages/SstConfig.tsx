import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchSstDocumentos, createSstDocumento, updateSstDocumento, deleteSstDocumento,
  type SstDocumento, type SstEscopo, type SstFrequencia,
} from '@/services/api';
import { SST_ESCOPOS, SST_FREQUENCIAS } from '@/lib/sst';

interface DocForm {
  nome: string;
  escopo: SstEscopo;
  frequencia: SstFrequencia;
  obrigatorio: boolean;
  dispensa_mei: boolean;
  exclusivo_mei: boolean;
  ordem: number;
  ativo: boolean;
  vigencia_inicio: string; // 'YYYY-MM-DD' ou '' (desde sempre)
}
const emptyForm: DocForm = {
  nome: '', escopo: 'empresa', frequencia: 'fixo',
  obrigatorio: true, dispensa_mei: false, exclusivo_mei: false, ordem: 0, ativo: true,
  vigencia_inicio: '',
};

const GRUPOS: { escopo: SstEscopo; frequencia: SstFrequencia; titulo: string }[] = [
  { escopo: 'empresa', frequencia: 'fixo', titulo: 'Empresa — fixos (cadastro, 1x no início)' },
  { escopo: 'empresa', frequencia: 'toda_medicao', titulo: 'Empresa — por medição (mensais)' },
  { escopo: 'empresa', frequencia: 'medicao_dia_1', titulo: 'Empresa — só medição dia 1' },
  { escopo: 'empresa', frequencia: 'medicao_dia_16', titulo: 'Empresa — só medição dia 16' },
  { escopo: 'pessoa', frequencia: 'fixo', titulo: 'Funcionário — fixos' },
  { escopo: 'pessoa', frequencia: 'toda_medicao', titulo: 'Funcionário — por medição' },
  { escopo: 'pessoa', frequencia: 'medicao_dia_1', titulo: 'Funcionário — só medição dia 1' },
  { escopo: 'pessoa', frequencia: 'medicao_dia_16', titulo: 'Funcionário — só medição dia 16' },
];

export default function SstConfig() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SstDocumento | null>(null);
  const [form, setForm] = useState<DocForm>(emptyForm);

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ['sst-documentos-all'],
    queryFn: () => fetchSstDocumentos(true),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sst-documentos-all'] });
    queryClient.invalidateQueries({ queryKey: ['sst-documentos'] });
  };

  const close = () => { setDialogOpen(false); setEditing(null); setForm(emptyForm); };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        escopo: form.escopo,
        frequencia: form.frequencia,
        obrigatorio: form.obrigatorio,
        dispensa_mei: form.escopo === 'pessoa' ? form.dispensa_mei : false,
        exclusivo_mei: form.escopo === 'pessoa' ? form.exclusivo_mei : false,
        ordem: Number(form.ordem) || 0,
        ativo: form.ativo,
        vigencia_inicio: form.frequencia === 'fixo' ? null : (form.vigencia_inicio || null),
      };
      if (editing) await updateSstDocumento(editing.id, payload);
      else await createSstDocumento({ ...payload, created_by: user!.id });
    },
    onSuccess: () => { invalidate(); toast({ title: editing ? 'Documento atualizado!' : 'Documento criado!' }); close(); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSstDocumento,
    onSuccess: () => { invalidate(); toast({ title: 'Documento removido' }); },
    onError: (e: any) => toast({
      title: 'Não foi possível remover',
      description: 'Se já houver status/arquivos ligados, desative em vez de excluir. ' + (e.message ?? ''),
      variant: 'destructive',
    }),
  });

  const toggleAtivo = (d: SstDocumento) =>
    updateSstDocumento(d.id, { ativo: !d.ativo }).then(invalidate).catch((e) =>
      toast({ title: 'Erro', description: e.message, variant: 'destructive' }));

  const openNew = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (d: SstDocumento) => {
    setEditing(d);
    setForm({
      nome: d.nome, escopo: d.escopo, frequencia: d.frequencia, obrigatorio: d.obrigatorio,
      dispensa_mei: d.dispensa_mei, exclusivo_mei: d.exclusivo_mei, ordem: d.ordem, ativo: d.ativo,
      vigencia_inicio: d.vigencia_inicio ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast({ title: 'Nome obrigatório', variant: 'destructive' }); return; }
    saveMut.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link to="/sst"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
              <Settings2 className="h-6 w-6 text-accent" /> Configurações SST
            </h1>
            <p className="text-muted-foreground font-body">Documentos exigidos, frequência e regras de MEI</p>
          </div>
        </div>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-body" onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Novo documento
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : (
        <div className="space-y-5">
          {GRUPOS.map((g) => {
            const docs = documentos.filter((d) => d.escopo === g.escopo && d.frequencia === g.frequencia);
            if (docs.length === 0) return null;
            return (
              <Card key={`${g.escopo}-${g.frequencia}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-heading">{g.titulo} <span className="text-muted-foreground font-body font-normal">({docs.length})</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`font-body text-sm truncate ${d.ativo ? '' : 'line-through text-muted-foreground'}`}>{d.nome}</span>
                          {!d.obrigatorio && <Badge variant="secondary" className="text-[10px] font-body">opcional</Badge>}
                          {d.vigencia_inicio && (
                            <Badge variant="outline" className="text-[10px] font-body">
                              a partir de {d.vigencia_inicio.slice(5, 7)}/{d.vigencia_inicio.slice(0, 4)}
                            </Badge>
                          )}
                          {d.dispensa_mei && <Badge variant="outline" className="text-[10px] font-body">MEI dispensa</Badge>}
                          {d.exclusivo_mei && <Badge variant="outline" className="text-[10px] font-body">só MEI</Badge>}
                          {!d.ativo && <Badge variant="outline" className="text-[10px] font-body">inativo</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center gap-1.5 mr-2">
                          <Switch checked={d.ativo} onCheckedChange={() => toggleAtivo(d)} />
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-heading">Excluir documento?</AlertDialogTitle>
                              <AlertDialogDescription className="font-body">
                                "{d.nome}" sairá do catálogo. Se já houver status/arquivos ligados, prefira <b>desativar</b>. Ação irreversível.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMut.mutate(d.id)} className="bg-destructive text-destructive-foreground font-body">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{editing ? 'Editar documento' : 'Novo documento'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-body">Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required className="font-body" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-body">Escopo</Label>
                <Select value={form.escopo} onValueChange={(v) => setForm({ ...form, escopo: v as SstEscopo })}>
                  <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SST_ESCOPOS.map((o) => <SelectItem key={o.value} value={o.value} className="font-body">{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-body">Frequência</Label>
                <Select value={form.frequencia} onValueChange={(v) => setForm({ ...form, frequencia: v as SstFrequencia })}>
                  <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SST_FREQUENCIAS.map((o) => <SelectItem key={o.value} value={o.value} className="font-body">{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-body">Ordem</Label>
                <Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} className="font-body" />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch checked={form.obrigatorio} onCheckedChange={(v) => setForm({ ...form, obrigatorio: v })} />
                <Label className="font-body">Obrigatório</Label>
              </div>
            </div>
            {form.frequencia !== 'fixo' && (
              <div className="space-y-2">
                <Label className="font-body">Exigido a partir de (opcional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={form.vigencia_inicio}
                    onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })}
                    className="font-body"
                  />
                  {form.vigencia_inicio && (
                    <Button type="button" variant="ghost" size="sm" className="font-body shrink-0"
                      onClick={() => setForm({ ...form, vigencia_inicio: '' })}>
                      Limpar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-body">
                  Deixe vazio para exigir desde sempre. Se preencher, medições anteriores a essa data não cobram o documento.
                </p>
              </div>
            )}
            {form.escopo === 'pessoa' && (
              <div className="rounded-md border border-border p-3 space-y-3">
                <p className="text-xs text-muted-foreground font-body">Regras de funcionário MEI</p>
                <div className="flex items-center gap-2">
                  <Switch checked={form.dispensa_mei} onCheckedChange={(v) => setForm({ ...form, dispensa_mei: v, exclusivo_mei: v ? false : form.exclusivo_mei })} />
                  <Label className="font-body text-sm">MEI dispensa este documento</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.exclusivo_mei} onCheckedChange={(v) => setForm({ ...form, exclusivo_mei: v, dispensa_mei: v ? false : form.dispensa_mei })} />
                  <Label className="font-body text-sm">Exigido só de MEI</Label>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label className="font-body">Ativo</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={close} className="font-body">Cancelar</Button>
              <Button type="submit" disabled={saveMut.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
