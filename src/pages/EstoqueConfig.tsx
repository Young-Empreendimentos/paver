import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ArrowLeft, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  fetchEstoqueItens, createEstoqueItem, updateEstoqueItem, deleteEstoqueItem, type EstoqueItem,
} from '@/services/api';

const CATEGORIAS: { value: string; label: string }[] = [
  { value: 'paver', label: 'Paver' },
  { value: 'meio_fio', label: 'Meio-fio' },
  { value: 'tampa_cloacal', label: 'Tampa de cloacal' },
  { value: 'tubo_agua', label: 'Tubo de água' },
  { value: 'tubo_pluvial', label: 'Tubo pluvial' },
  { value: 'conexao', label: 'Conexão' },
  { value: 'outro', label: 'Outro' },
];
const catLabel = (v: string | null) => CATEGORIAS.find((c) => c.value === v)?.label ?? (v || '—');

type Draft = {
  id?: string;
  nome: string;
  categoria: string;
  unidade: string;
  bitola: string;
  armado: 'na' | 'sim' | 'nao';
  ordem: number;
  ativo: boolean;
};

const vazio = (ordem: number): Draft => ({ nome: '', categoria: 'outro', unidade: 'un', bitola: '', armado: 'na', ordem, ativo: true });

const toDraft = (i: EstoqueItem): Draft => ({
  id: i.id, nome: i.nome, categoria: i.categoria || 'outro', unidade: i.unidade, bitola: i.bitola || '',
  armado: i.armado === true ? 'sim' : i.armado === false ? 'nao' : 'na', ordem: i.ordem, ativo: i.ativo,
});

export default function EstoqueConfig() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: itens = [], isLoading } = useQuery({ queryKey: ['estoque-itens-all'], queryFn: () => fetchEstoqueItens(true) });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(vazio(0));
  const [saving, setSaving] = useState(false);

  const novo = () => { setDraft(vazio((itens.at(-1)?.ordem ?? 0) + 1)); setOpen(true); };
  const editar = (i: EstoqueItem) => { setDraft(toDraft(i)); setOpen(true); };

  const salvar = async () => {
    if (!draft.nome.trim()) { toast({ title: 'Informe o nome', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        nome: draft.nome.trim(),
        categoria: draft.categoria || null,
        unidade: draft.unidade.trim() || 'un',
        bitola: draft.bitola.trim() || null,
        armado: draft.armado === 'sim' ? true : draft.armado === 'nao' ? false : null,
        ordem: Number(draft.ordem) || 0,
        ativo: draft.ativo,
      };
      if (draft.id) await updateEstoqueItem(draft.id, payload);
      else await createEstoqueItem(payload as Omit<EstoqueItem, 'id' | 'created_at'>);
      qc.invalidateQueries({ queryKey: ['estoque-itens-all'] });
      qc.invalidateQueries({ queryKey: ['estoque-itens'] });
      setOpen(false);
      toast({ title: 'Item salvo' });
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const excluir = async (i: EstoqueItem) => {
    if (!window.confirm(`Excluir "${i.nome}"? (se já tem movimento, prefira desativar)`)) return;
    try {
      await deleteEstoqueItem(i.id);
      qc.invalidateQueries({ queryKey: ['estoque-itens-all'] });
      qc.invalidateQueries({ queryKey: ['estoque-itens'] });
    } catch (e: any) {
      toast({ title: 'Não foi possível excluir', description: 'Provavelmente já tem movimento. Desative o item em vez de excluir.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-6 w-6 text-accent" /> Itens de estoque
          </h1>
          <p className="text-muted-foreground font-body">Catálogo configurável dos materiais controlados (bitola e armado/não armado quando fizer sentido)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="font-body"><Link to="/estoque"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao estoque</Link></Button>
          <Button onClick={novo} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body"><Plus className="h-4 w-4 mr-1" /> Novo item</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-heading">Nome</TableHead>
                  <TableHead className="font-heading">Categoria</TableHead>
                  <TableHead className="font-heading">Unidade</TableHead>
                  <TableHead className="font-heading">Bitola</TableHead>
                  <TableHead className="font-heading">Armado</TableHead>
                  <TableHead className="font-heading">Status</TableHead>
                  <TableHead className="font-heading text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.id} className={i.ativo ? '' : 'opacity-60'}>
                    <TableCell className="font-body font-medium">{i.nome}</TableCell>
                    <TableCell className="font-body text-xs">{catLabel(i.categoria)}</TableCell>
                    <TableCell className="font-body">{i.unidade}</TableCell>
                    <TableCell className="font-body">{i.bitola || '—'}</TableCell>
                    <TableCell className="font-body text-xs">{i.armado === true ? 'Armado' : i.armado === false ? 'Não armado' : '—'}</TableCell>
                    <TableCell>{i.ativo ? <Badge className="text-[10px] font-body bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">ativo</Badge> : <Badge variant="outline" className="text-[10px] font-body">inativo</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editar(i)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => excluir(i)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {itens.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground font-body">Nenhum item. Clique em "Novo item".</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">{draft.id ? 'Editar item' : 'Novo item'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="font-body text-xs">Nome *</Label>
              <Input value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} className="font-body" placeholder="Ex.: Tubo pluvial" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-body text-xs">Categoria</Label>
                <Select value={draft.categoria} onValueChange={(v) => setDraft({ ...draft, categoria: v })}>
                  <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-body text-xs">Unidade</Label>
                <Input value={draft.unidade} onChange={(e) => setDraft({ ...draft, unidade: e.target.value })} className="font-body" placeholder="un, m, pç..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-body text-xs">Bitola (opcional)</Label>
                <Input value={draft.bitola} onChange={(e) => setDraft({ ...draft, bitola: e.target.value })} className="font-body" placeholder="Ex.: DN100" />
              </div>
              <div>
                <Label className="font-body text-xs">Armado?</Label>
                <Select value={draft.armado} onValueChange={(v) => setDraft({ ...draft, armado: v as Draft['armado'] })}>
                  <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="na" className="font-body">Não se aplica</SelectItem>
                    <SelectItem value="sim" className="font-body">Armado</SelectItem>
                    <SelectItem value="nao" className="font-body">Não armado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label className="font-body text-xs">Ordem</Label>
                <Input type="number" value={draft.ordem} onChange={(e) => setDraft({ ...draft, ordem: Number(e.target.value) })} className="font-body" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <Switch checked={draft.ativo} onCheckedChange={(v) => setDraft({ ...draft, ativo: v })} />
                <span className="font-body text-sm">Ativo</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="font-body">Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
