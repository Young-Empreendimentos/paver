import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HardHat, Plus, Pencil, Trash2, Loader2, Search, Users, Phone, FileText, ExternalLink, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchEmpreiteiros, createEmpreiteiro, updateEmpreiteiro, deleteEmpreiteiro,
  fetchAllEmpregados, createEmpregado, updateEmpregado, deleteEmpregado,
  uploadPrivateFile, getSignedUrl, EMPREITEIROS_BUCKET,
  type Empreiteiro, type Empregado,
} from '@/services/api';

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_');

// Miniatura de imagem guardada no bucket privado (busca URL assinada).
function SignedThumb({ path }: { path?: string | null }) {
  const { data: url } = useQuery({
    queryKey: ['signed-url', path],
    queryFn: () => getSignedUrl(EMPREITEIROS_BUCKET, path as string, 3600),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
      {path && url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserRound className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
}

// ============ Empregados de um empreiteiro (dialog) ============
interface EmpregadoForm {
  nome_completo: string;
  cpf: string;
  rg: string;
  telefone: string;
  ativo: boolean;
}
const emptyEmpregado: EmpregadoForm = { nome_completo: '', cpf: '', rg: '', telefone: '', ativo: true };

function EmpregadosDialog({
  empreiteiro, empregados, open, onOpenChange,
}: {
  empreiteiro: Empreiteiro | null;
  empregados: Empregado[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Empregado | null>(null);
  const [form, setForm] = useState<EmpregadoForm>(emptyEmpregado);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['empregados-all'] });

  const closeForm = () => {
    setFormOpen(false); setEditing(null); setForm(emptyEmpregado);
    setFotoFile(null); setDocFile(null);
  };

  const uploadFiles = async (empregadoId: string) => {
    const updates: Partial<Empregado> = {};
    if (fotoFile) {
      const p = `empregados/${empregadoId}/foto_${Date.now()}_${slug(fotoFile.name)}`;
      updates.foto_path = await uploadPrivateFile(EMPREITEIROS_BUCKET, p, fotoFile);
    }
    if (docFile) {
      const p = `empregados/${empregadoId}/doc_${Date.now()}_${slug(docFile.name)}`;
      updates.documento_path = await uploadPrivateFile(EMPREITEIROS_BUCKET, p, docFile);
    }
    return updates;
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const emp = await createEmpregado({
        empreiteiro_id: empreiteiro!.id,
        nome_completo: form.nome_completo,
        cpf: form.cpf || null,
        rg: form.rg || null,
        telefone: form.telefone || null,
        ativo: form.ativo,
        foto_path: null,
        documento_path: null,
        created_by: user!.id,
      });
      const updates = await uploadFiles(emp.id);
      if (Object.keys(updates).length) await updateEmpregado(emp.id, updates);
    },
    onSuccess: () => { invalidate(); toast({ title: 'Empregado cadastrado!' }); closeForm(); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: async (id: string) => {
      await updateEmpregado(id, {
        nome_completo: form.nome_completo,
        cpf: form.cpf || null,
        rg: form.rg || null,
        telefone: form.telefone || null,
        ativo: form.ativo,
      });
      const updates = await uploadFiles(id);
      if (Object.keys(updates).length) await updateEmpregado(id, updates);
    },
    onSuccess: () => { invalidate(); toast({ title: 'Empregado atualizado!' }); closeForm(); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteEmpregado,
    onSuccess: () => { invalidate(); toast({ title: 'Empregado removido' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const openDoc = async (path: string) => {
    try {
      const url = await getSignedUrl(EMPREITEIROS_BUCKET, path, 300);
      window.open(url, '_blank', 'noopener');
    } catch (e: any) {
      toast({ title: 'Erro ao abrir', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (emp: Empregado) => {
    setEditing(emp);
    setForm({
      nome_completo: emp.nome_completo,
      cpf: emp.cpf || '', rg: emp.rg || '', telefone: emp.telefone || '',
      ativo: emp.ativo,
    });
    setFotoFile(null); setDocFile(null);
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome_completo.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (editing) updateMut.mutate(editing.id);
    else createMut.mutate();
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Empregados — {empreiteiro?.razao_social}
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"
            onClick={() => { setForm(emptyEmpregado); setEditing(null); setFotoFile(null); setDocFile(null); setFormOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1" /> Novo empregado
          </Button>
        </div>

        {empregados.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground font-body">
            Nenhum empregado cadastrado ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {empregados.map((emp) => (
              <Card key={emp.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <SignedThumb path={emp.foto_path} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-body font-medium truncate">{emp.nome_completo}</span>
                      {!emp.ativo && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground font-body flex flex-wrap gap-x-3">
                      {emp.cpf && <span>CPF: {emp.cpf}</span>}
                      {emp.rg && <span>RG: {emp.rg}</span>}
                      {emp.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{emp.telefone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {emp.documento_path && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs font-body" onClick={() => openDoc(emp.documento_path!)}>
                        <FileText className="h-3 w-3 mr-1" /> Documento
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(emp)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-heading">Excluir empregado?</AlertDialogTitle>
                          <AlertDialogDescription className="font-body">
                            {emp.nome_completo} será removido. Essa ação é irreversível.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMut.mutate(emp.id)} className="bg-destructive text-destructive-foreground font-body">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Form de empregado (create/edit) */}
        <Dialog open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">{editing ? 'Editar empregado' : 'Novo empregado'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="font-body">Nome completo *</Label>
                <Input value={form.nome_completo} onChange={e => setForm({ ...form, nome_completo: e.target.value })} required className="font-body" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-body">CPF</Label>
                  <Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} className="font-body" />
                </div>
                <div className="space-y-2">
                  <Label className="font-body">RG</Label>
                  <Input value={form.rg} onChange={e => setForm({ ...form, rg: e.target.value })} className="font-body" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-body">Telefone</Label>
                <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} className="font-body" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-body">Foto</Label>
                  <Input type="file" accept="image/*" onChange={e => setFotoFile(e.target.files?.[0] ?? null)} className="font-body" />
                  {editing?.foto_path && !fotoFile && <p className="text-[10px] text-muted-foreground font-body">Já tem foto — envie outra para trocar.</p>}
                </div>
                <div className="space-y-2">
                  <Label className="font-body">Documento (foto/PDF)</Label>
                  <Input type="file" accept="image/*,application/pdf" onChange={e => setDocFile(e.target.files?.[0] ?? null)} className="font-body" />
                  {editing?.documento_path && !docFile && <p className="text-[10px] text-muted-foreground font-body">Já tem documento — envie outro para trocar.</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
                <Label className="font-body">Ativo</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeForm} className="font-body">Cancelar</Button>
                <Button type="submit" disabled={isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Salvar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

// ============ Página principal ============
interface EmpreiteiroForm {
  razao_social: string;
  cnpj: string;
  ativo: boolean;
}
const emptyEmpreiteiro: EmpreiteiroForm = { razao_social: '', cnpj: '', ativo: true };

export default function Empreiteiros() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Empreiteiro | null>(null);
  const [form, setForm] = useState<EmpreiteiroForm>(emptyEmpreiteiro);
  const [contratoFile, setContratoFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [empregadosDe, setEmpregadosDe] = useState<Empreiteiro | null>(null);

  const { data: empreiteiros = [], isLoading } = useQuery({
    queryKey: ['empreiteiros'],
    queryFn: fetchEmpreiteiros,
  });
  const { data: empregados = [] } = useQuery({
    queryKey: ['empregados-all'],
    queryFn: fetchAllEmpregados,
  });

  const countEmpregados = (empreiteiroId: string) =>
    empregados.filter(e => e.empreiteiro_id === empreiteiroId).length;

  const closeDialog = () => {
    setDialogOpen(false); setEditing(null); setForm(emptyEmpreiteiro); setContratoFile(null);
  };

  const uploadContrato = async (empreiteiroId: string): Promise<Partial<Empreiteiro>> => {
    if (!contratoFile) return {};
    const p = `contratos/${empreiteiroId}/${Date.now()}_${slug(contratoFile.name)}`;
    const path = await uploadPrivateFile(EMPREITEIROS_BUCKET, p, contratoFile);
    return { contrato_path: path, contrato_nome: contratoFile.name };
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const emp = await createEmpreiteiro({
        razao_social: form.razao_social,
        cnpj: form.cnpj || null,
        ativo: form.ativo,
        contrato_path: null,
        contrato_nome: null,
        created_by: user!.id,
      });
      const updates = await uploadContrato(emp.id);
      if (Object.keys(updates).length) await updateEmpreiteiro(emp.id, updates);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['empreiteiros'] }); toast({ title: 'Empreiteiro cadastrado!' }); closeDialog(); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: async (id: string) => {
      await updateEmpreiteiro(id, { razao_social: form.razao_social, cnpj: form.cnpj || null, ativo: form.ativo });
      const updates = await uploadContrato(id);
      if (Object.keys(updates).length) await updateEmpreiteiro(id, updates);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['empreiteiros'] }); toast({ title: 'Empreiteiro atualizado!' }); closeDialog(); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteEmpreiteiro,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      queryClient.invalidateQueries({ queryKey: ['empregados-all'] });
      toast({ title: 'Empreiteiro excluído' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const openContrato = async (path: string) => {
    try {
      const url = await getSignedUrl(EMPREITEIROS_BUCKET, path, 300);
      window.open(url, '_blank', 'noopener');
    } catch (e: any) {
      toast({ title: 'Erro ao abrir contrato', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (e: Empreiteiro) => {
    setEditing(e);
    setForm({ razao_social: e.razao_social, cnpj: e.cnpj || '', ativo: e.ativo });
    setContratoFile(null);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razao_social.trim()) {
      toast({ title: 'Razão social obrigatória', variant: 'destructive' });
      return;
    }
    if (editing) updateMut.mutate(editing.id);
    else createMut.mutate();
  };

  const isPending = createMut.isPending || updateMut.isPending;

  const filtered = empreiteiros.filter(e =>
    !search ||
    e.razao_social.toLowerCase().includes(search.toLowerCase()) ||
    (e.cnpj || '').includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Empreiteiros</h1>
          <p className="text-muted-foreground font-body">Cadastro de empreiteiros e seus empregados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else { setForm(emptyEmpreiteiro); setEditing(null); setContratoFile(null); setDialogOpen(true); } }}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
              <Plus className="h-4 w-4 mr-2" /> Novo Empreiteiro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">{editing ? 'Editar Empreiteiro' : 'Novo Empreiteiro'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="font-body">Razão social *</Label>
                <Input value={form.razao_social} onChange={e => setForm({ ...form, razao_social: e.target.value })} required className="font-body" />
              </div>
              <div className="space-y-2">
                <Label className="font-body">CNPJ</Label>
                <Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} className="font-body" placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label className="font-body">Contrato (PDF)</Label>
                <Input type="file" accept="application/pdf" onChange={e => setContratoFile(e.target.files?.[0] ?? null)} className="font-body" />
                {editing?.contrato_path && !contratoFile && (
                  <p className="text-[10px] text-muted-foreground font-body">Já tem contrato ({editing.contrato_nome}) — envie outro para trocar.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
                <Label className="font-body">Ativo</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeDialog} className="font-body">Cancelar</Button>
                <Button type="submit" disabled={isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por razão social ou CNPJ..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 font-body" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <HardHat className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-heading font-semibold text-muted-foreground">
              {empreiteiros.length === 0 ? 'Nenhum empreiteiro cadastrado' : 'Nenhum resultado encontrado'}
            </h3>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((emp) => (
            <Card key={emp.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-heading leading-tight">{emp.razao_social}</CardTitle>
                  {!emp.ativo && <Badge variant="outline" className="text-[10px] shrink-0">inativo</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {emp.cnpj && <p className="text-xs text-muted-foreground font-body">CNPJ: {emp.cnpj}</p>}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body">
                  <Users className="h-3 w-3" /> {countEmpregados(emp.id)} empregado(s)
                </div>
                {emp.contrato_path && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-body" onClick={() => openContrato(emp.contrato_path!)}>
                    <FileText className="h-3 w-3 mr-1" /> Ver contrato <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
                <div className="flex gap-2 pt-2 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-xs font-body" onClick={() => setEmpregadosDe(emp)}>
                    <Users className="h-3 w-3 mr-1" /> Empregados
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs font-body" onClick={() => openEdit(emp)}>
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-destructive font-body">
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-heading">Excluir empreiteiro?</AlertDialogTitle>
                        <AlertDialogDescription className="font-body">
                          {emp.razao_social} e todos os seus empregados serão removidos. Essa ação é irreversível.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMut.mutate(emp.id)} className="bg-destructive text-destructive-foreground font-body">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EmpregadosDialog
        empreiteiro={empregadosDe}
        empregados={empregadosDe ? empregados.filter(e => e.empreiteiro_id === empregadosDe.id) : []}
        open={!!empregadosDe}
        onOpenChange={(o) => { if (!o) setEmpregadosDe(null); }}
      />
    </div>
  );
}
