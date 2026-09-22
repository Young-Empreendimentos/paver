import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HardHat, Plus, Pencil, Trash2, Loader2, Search, Users, Phone, FileText, ExternalLink, Paperclip, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { EmpregadoAvatar } from '@/components/EmpregadoAvatar';
import {
  fetchEmpreiteiros, createEmpreiteiro, updateEmpreiteiro, deleteEmpreiteiro,
  fetchAllEmpregados, createEmpregado, updateEmpregado, deleteEmpregado,
  fetchObras, fetchEmpreiteiroObras, setEmpreiteiroObras,
  fetchAllEmpreiteiroArquivos, addEmpreiteiroArquivo, deleteEmpreiteiroArquivo,
  uploadPrivateFile, getSignedUrl, EMPREITEIROS_BUCKET,
  type Empreiteiro, type Empregado, type EmpreiteiroArquivo,
} from '@/services/api';

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_');

// ============ Empregados / Diaristas (dialog) ============
interface EmpregadoForm {
  nome_completo: string;
  cpf: string;
  rg: string;
  telefone: string;
  ativo: boolean;
}
const emptyEmpregado: EmpregadoForm = { nome_completo: '', cpf: '', rg: '', telefone: '', ativo: true };

function EmpregadosDialog({
  empreiteiroId, titulo, empregados, open, onOpenChange,
}: {
  empreiteiroId: string | null; // null = diaristas
  titulo: string;
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
        empreiteiro_id: empreiteiroId,
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
    onSuccess: () => { invalidate(); toast({ title: empreiteiroId ? 'Empregado cadastrado!' : 'Diarista cadastrado!' }); closeForm(); },
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
    onSuccess: () => { invalidate(); toast({ title: 'Atualizado!' }); closeForm(); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteEmpregado,
    onSuccess: () => { invalidate(); toast({ title: 'Removido' }); },
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
    setForm({ nome_completo: emp.nome_completo, cpf: emp.cpf || '', rg: emp.rg || '', telefone: emp.telefone || '', ativo: emp.ativo });
    setFotoFile(null); setDocFile(null);
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome_completo.trim()) { toast({ title: 'Nome obrigatório', variant: 'destructive' }); return; }
    if (editing) updateMut.mutate(editing.id);
    else createMut.mutate();
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const rotulo = empreiteiroId ? 'empregado' : 'diarista';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{titulo}</DialogTitle>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"
            onClick={() => { setForm(emptyEmpregado); setEditing(null); setFotoFile(null); setDocFile(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo {rotulo}
          </Button>
        </div>

        {empregados.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground font-body">Nenhum {rotulo} cadastrado ainda.</div>
        ) : (
          <div className="space-y-2">
            {empregados.map((emp) => (
              <Card key={emp.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <EmpregadoAvatar path={emp.foto_path} size={44} />
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(emp)}><Pencil className="h-3 w-3" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-heading">Excluir {rotulo}?</AlertDialogTitle>
                          <AlertDialogDescription className="font-body">{emp.nome_completo} será removido. Ação irreversível.</AlertDialogDescription>
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

        <Dialog open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-heading">{editing ? `Editar ${rotulo}` : `Novo ${rotulo}`}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="font-body">Nome completo *</Label>
                <Input value={form.nome_completo} onChange={e => setForm({ ...form, nome_completo: e.target.value })} required className="font-body" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="font-body">CPF</Label><Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} className="font-body" /></div>
                <div className="space-y-2"><Label className="font-body">RG</Label><Input value={form.rg} onChange={e => setForm({ ...form, rg: e.target.value })} className="font-body" /></div>
              </div>
              <div className="space-y-2"><Label className="font-body">Telefone</Label><Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} className="font-body" /></div>
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
              <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} /><Label className="font-body">Ativo</Label></div>
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

// ============ Arquivos de um empreiteiro (dialog) ============
function ArquivosDialog({
  empreiteiro, arquivos, open, onOpenChange,
}: {
  empreiteiro: Empreiteiro | null;
  arquivos: EmpreiteiroArquivo[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['empreiteiro-arquivos'] });

  const openFile = async (path: string) => {
    try { window.open(await getSignedUrl(EMPREITEIROS_BUCKET, path, 300), '_blank', 'noopener'); }
    catch (e: any) { toast({ title: 'Erro ao abrir', description: e.message, variant: 'destructive' }); }
  };

  const handleAdd = async (files: FileList | null) => {
    if (!files || files.length === 0 || !empreiteiro) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const p = `arquivos/${empreiteiro.id}/${Date.now()}_${slug(f.name)}`;
        const path = await uploadPrivateFile(EMPREITEIROS_BUCKET, p, f);
        await addEmpreiteiroArquivo({ empreiteiro_id: empreiteiro.id, nome: f.name, path, created_by: user!.id });
      }
      invalidate();
      toast({ title: 'Arquivo(s) adicionado(s)!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const delMut = useMutation({
    mutationFn: deleteEmpreiteiroArquivo,
    onSuccess: () => { invalidate(); toast({ title: 'Arquivo removido' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">Arquivos — {empreiteiro?.razao_social}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label className="font-body">Adicionar arquivo(s)</Label>
          <Input type="file" multiple disabled={uploading} onChange={e => { handleAdd(e.target.files); e.currentTarget.value = ''; }} className="font-body" />
          {uploading && <p className="text-xs text-muted-foreground font-body flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> enviando…</p>}
        </div>
        {arquivos.length === 0 ? (
          <p className="text-sm text-muted-foreground font-body py-6 text-center">Nenhum arquivo ainda.</p>
        ) : (
          <div className="space-y-1">
            {arquivos.map(a => (
              <div key={a.id} className="flex items-center gap-2 rounded border border-border p-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <button type="button" onClick={() => openFile(a.path)} className="flex-1 text-left text-sm font-body truncate hover:underline">{a.nome}</button>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3 w-3 text-destructive" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-heading">Excluir arquivo?</AlertDialogTitle>
                      <AlertDialogDescription className="font-body">{a.nome} será removido da lista.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => delMut.mutate(a.id)} className="bg-destructive text-destructive-foreground font-body">Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============ Página principal ============
interface EmpreiteiroForm { razao_social: string; cnpj: string; ativo: boolean; }
const emptyEmpreiteiro: EmpreiteiroForm = { razao_social: '', cnpj: '', ativo: true };

export default function Empreiteiros() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Empreiteiro | null>(null);
  const [form, setForm] = useState<EmpreiteiroForm>(emptyEmpreiteiro);
  const [arquivoFiles, setArquivoFiles] = useState<File[]>([]);
  const [obrasSel, setObrasSel] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [empregadosCtx, setEmpregadosCtx] = useState<{ empreiteiroId: string | null; titulo: string } | null>(null);
  const [arquivosDe, setArquivosDe] = useState<Empreiteiro | null>(null);
  const [diaristasOpen, setDiaristasOpen] = useState(false);

  const { data: empreiteiros = [], isLoading } = useQuery({ queryKey: ['empreiteiros'], queryFn: fetchEmpreiteiros });
  const { data: empregados = [] } = useQuery({ queryKey: ['empregados-all'], queryFn: fetchAllEmpregados });
  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const { data: empreiteiroObras = [] } = useQuery({ queryKey: ['empreiteiro-obras'], queryFn: fetchEmpreiteiroObras });
  const { data: arquivos = [] } = useQuery({ queryKey: ['empreiteiro-arquivos'], queryFn: fetchAllEmpreiteiroArquivos });

  const obraNomeById = new Map(obras.map(o => [o.id, o.nome]));
  const countEmpregados = (id: string) => empregados.filter(e => e.empreiteiro_id === id).length;
  const countArquivos = (id: string) => arquivos.filter(a => a.empreiteiro_id === id).length;
  const obrasDoEmpreiteiro = (id: string) => empreiteiroObras.filter(l => l.empreiteiro_id === id).map(l => l.obra_id);
  const diaristas = empregados.filter(e => !e.empreiteiro_id);

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyEmpreiteiro); setArquivoFiles([]); setObrasSel(new Set()); };

  const toggleObra = (obraId: string) => setObrasSel(prev => { const n = new Set(prev); n.has(obraId) ? n.delete(obraId) : n.add(obraId); return n; });

  const uploadArquivos = async (empreiteiroId: string) => {
    for (const f of arquivoFiles) {
      const p = `arquivos/${empreiteiroId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${slug(f.name)}`;
      const path = await uploadPrivateFile(EMPREITEIROS_BUCKET, p, f);
      await addEmpreiteiroArquivo({ empreiteiro_id: empreiteiroId, nome: f.name, path, created_by: user!.id });
    }
  };

  const afterSave = () => {
    queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
    queryClient.invalidateQueries({ queryKey: ['empreiteiro-obras'] });
    queryClient.invalidateQueries({ queryKey: ['empreiteiro-arquivos'] });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const emp = await createEmpreiteiro({
        razao_social: form.razao_social, cnpj: form.cnpj || null, ativo: form.ativo,
        contrato_path: null, contrato_nome: null, created_by: user!.id,
      });
      await uploadArquivos(emp.id);
      await setEmpreiteiroObras(emp.id, [...obrasSel]);
    },
    onSuccess: () => { afterSave(); toast({ title: 'Empreiteiro cadastrado!' }); closeDialog(); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: async (id: string) => {
      await updateEmpreiteiro(id, { razao_social: form.razao_social, cnpj: form.cnpj || null, ativo: form.ativo });
      await uploadArquivos(id);
      await setEmpreiteiroObras(id, [...obrasSel]);
    },
    onSuccess: () => { afterSave(); toast({ title: 'Empreiteiro atualizado!' }); closeDialog(); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteEmpreiteiro,
    onSuccess: () => {
      afterSave();
      queryClient.invalidateQueries({ queryKey: ['empregados-all'] });
      queryClient.invalidateQueries({ queryKey: ['empreiteiro-arquivos'] });
      toast({ title: 'Empreiteiro excluído' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const openEdit = (e: Empreiteiro) => {
    setEditing(e);
    setForm({ razao_social: e.razao_social, cnpj: e.cnpj || '', ativo: e.ativo });
    setArquivoFiles([]);
    setObrasSel(new Set(obrasDoEmpreiteiro(e.id)));
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razao_social.trim()) { toast({ title: 'Razão social obrigatória', variant: 'destructive' }); return; }
    if (editing) updateMut.mutate(editing.id);
    else createMut.mutate();
  };

  const isPending = createMut.isPending || updateMut.isPending;

  const filtered = empreiteiros.filter(e =>
    !search || e.razao_social.toLowerCase().includes(search.toLowerCase()) || (e.cnpj || '').includes(search));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Empreiteiros</h1>
          <p className="text-muted-foreground font-body">Cadastro de empreiteiros, diaristas e seus empregados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else { setForm(emptyEmpreiteiro); setEditing(null); setArquivoFiles([]); setObrasSel(new Set()); setDialogOpen(true); } }}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"><Plus className="h-4 w-4 mr-2" /> Novo Empreiteiro</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-heading">{editing ? 'Editar Empreiteiro' : 'Novo Empreiteiro'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label className="font-body">Razão social *</Label><Input value={form.razao_social} onChange={e => setForm({ ...form, razao_social: e.target.value })} required className="font-body" /></div>
              <div className="space-y-2"><Label className="font-body">CNPJ</Label><Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} className="font-body" placeholder="00.000.000/0000-00" /></div>
              <div className="space-y-2">
                <Label className="font-body">Arquivos (contrato, documentos…)</Label>
                <Input type="file" multiple onChange={e => setArquivoFiles(Array.from(e.target.files ?? []))} className="font-body" />
                {arquivoFiles.length > 0
                  ? <p className="text-[10px] text-muted-foreground font-body">{arquivoFiles.length} arquivo(s) selecionado(s) para enviar.</p>
                  : <p className="text-[10px] text-muted-foreground font-body">Pode selecionar vários de uma vez.{editing ? ' Ver/gerenciar os já enviados no botão "Arquivos" do card.' : ''}</p>}
              </div>
              <div className="space-y-2">
                <Label className="font-body">Aparece nas obras</Label>
                {obras.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-body">Nenhuma obra cadastrada.</p>
                ) : (
                  <div className="rounded-md border border-border p-2 space-y-1">
                    {obras.map(o => (
                      <label key={o.id} className="flex items-center gap-2 text-sm font-body cursor-pointer">
                        <Checkbox checked={obrasSel.has(o.id)} onCheckedChange={() => toggleObra(o.id)} />
                        <span className="truncate">{o.nome}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground font-body">Se não marcar nenhuma, aparece em todas as obras.</p>
              </div>
              <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} /><Label className="font-body">Ativo</Label></div>
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

      {/* Diaristas (sem CNPJ) */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-accent" />
            <div>
              <p className="font-heading font-semibold text-sm">Diaristas (sem CNPJ)</p>
              <p className="text-xs text-muted-foreground font-body">{diaristas.length} cadastrado(s) — ficam disponíveis para marcar no diário; só entram quando você marca</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="font-body" onClick={() => setDiaristasOpen(true)}>
            <Users className="h-4 w-4 mr-1" /> Gerenciar
          </Button>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por razão social ou CNPJ..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 font-body" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <HardHat className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-heading font-semibold text-muted-foreground">{empreiteiros.length === 0 ? 'Nenhum empreiteiro cadastrado' : 'Nenhum resultado encontrado'}</h3>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((emp) => {
            const obrasIds = obrasDoEmpreiteiro(emp.id);
            const nArq = countArquivos(emp.id);
            return (
              <Card key={emp.id} className="group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-heading leading-tight">{emp.razao_social}</CardTitle>
                    {!emp.ativo && <Badge variant="outline" className="text-[10px] shrink-0">inativo</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {emp.cnpj && <p className="text-xs text-muted-foreground font-body">CNPJ: {emp.cnpj}</p>}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body"><Users className="h-3 w-3" /> {countEmpregados(emp.id)} empregado(s)</div>
                  <div className="flex flex-wrap gap-1">
                    {obrasIds.length === 0 ? (
                      <Badge variant="secondary" className="text-[10px]">Todas as obras</Badge>
                    ) : obrasIds.map(oid => (
                      <Badge key={oid} variant="secondary" className="text-[10px]">{obraNomeById.get(oid) || 'Obra'}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center pt-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-body" onClick={() => setArquivosDe(emp)}>
                      <Paperclip className="h-3 w-3 mr-1" /> Arquivos{nArq > 0 ? ` (${nArq})` : ''}
                    </Button>
                  </div>
                  <div className="flex gap-2 pt-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 text-xs font-body" onClick={() => setEmpregadosCtx({ empreiteiroId: emp.id, titulo: `Empregados — ${emp.razao_social}` })}>
                      <Users className="h-3 w-3 mr-1" /> Empregados
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs font-body" onClick={() => openEdit(emp)}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs text-destructive font-body"><Trash2 className="h-3 w-3 mr-1" /> Excluir</Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-heading">Excluir empreiteiro?</AlertDialogTitle>
                          <AlertDialogDescription className="font-body">{emp.razao_social} e todos os seus empregados serão removidos. Ação irreversível.</AlertDialogDescription>
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
            );
          })}
        </div>
      )}

      <EmpregadosDialog
        empreiteiroId={empregadosCtx?.empreiteiroId ?? null}
        titulo={empregadosCtx?.titulo ?? ''}
        empregados={empregadosCtx ? empregados.filter(e => e.empreiteiro_id === empregadosCtx.empreiteiroId) : []}
        open={!!empregadosCtx}
        onOpenChange={(o) => { if (!o) setEmpregadosCtx(null); }}
      />

      <EmpregadosDialog
        empreiteiroId={null}
        titulo="Diaristas"
        empregados={diaristas}
        open={diaristasOpen}
        onOpenChange={setDiaristasOpen}
      />

      <ArquivosDialog
        empreiteiro={arquivosDe}
        arquivos={arquivosDe ? arquivos.filter(a => a.empreiteiro_id === arquivosDe.id) : []}
        open={!!arquivosDe}
        onOpenChange={(o) => { if (!o) setArquivosDe(null); }}
      />
    </div>
  );
}
