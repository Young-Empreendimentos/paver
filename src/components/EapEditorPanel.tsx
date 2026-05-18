import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, Pencil, Trash2, Save, X, Loader2,
  ChevronDown, ChevronRight, Package, Layers, Tag as TagIcon,
} from 'lucide-react';
import { fetchEapItems, type EapItem } from '@/services/api';
import { updateEapItem, deleteEapItem, insertSingleEapItem } from '@/services/eapApi';
import { fetchServiceTags, type ServiceTag } from '@/services/serviceTagsApi';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obraId: string;
  obraNome: string;
}

interface EditingState {
  id: string;
  descricao: string;
  pacote: string;
  lote: string;
  classificacao_adicional: string;
}

export default function EapEditorPanel({ open, onOpenChange, obraId, obraNome }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<'pacote' | 'lote'>('pacote');
  const [tagFilter, setTagFilter] = useState<string>('all'); // 'all' | 'none' | tag.id
  const [openTagPopover, setOpenTagPopover] = useState<string | null>(null);

  // New item form
  const [newItem, setNewItem] = useState({
    descricao: '', pacote: '', lote: '', classificacao_adicional: '',
    unidade: '', quantidade: '',
  });

  const { data: eapItems = [], isLoading } = useQuery({
    queryKey: ['eap', obraId],
    queryFn: () => fetchEapItems(obraId),
    enabled: open && !!obraId,
  });

  const items = useMemo(() => eapItems.filter(i => i.tipo === 'item'), [eapItems]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.descricao.toLowerCase().includes(q) ||
      i.pacote?.toLowerCase().includes(q) ||
      i.lote?.toLowerCase().includes(q) ||
      i.codigo?.toLowerCase().includes(q) ||
      i.classificacao_adicional?.toLowerCase().includes(q)
    );
  }, [items, search]);

  // Group by pacote or lote (serviço)
  const grouped = useMemo(() => {
    const noGroupLabel = groupBy === 'pacote' ? 'Sem pacote' : 'Sem serviço';
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const key = (groupBy === 'pacote' ? item.pacote : item.lote) || noGroupLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupBy]);

  // Unique values for autocomplete hints
  const uniquePacotes = useMemo(() => [...new Set(items.map(i => i.pacote).filter(Boolean))].sort(), [items]);
  const uniqueLotes = useMemo(() => [...new Set(items.map(i => i.lote).filter(Boolean))].sort(), [items]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startEdit = (item: EapItem) => {
    setEditing({
      id: item.id,
      descricao: item.descricao,
      pacote: item.pacote || '',
      lote: item.lote || '',
      classificacao_adicional: item.classificacao_adicional || '',
    });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateEapItem(editing.id, {
        descricao: editing.descricao,
        pacote: editing.pacote || undefined,
        lote: editing.lote || undefined,
        classificacao_adicional: editing.classificacao_adicional || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['eap', obraId] });
      queryClient.invalidateQueries({ queryKey: ['eap-all'] });
      toast({ title: 'Item atualizado!' });
      setEditing(null);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteEapItem(itemId);
      queryClient.invalidateQueries({ queryKey: ['eap', obraId] });
      queryClient.invalidateQueries({ queryKey: ['eap-all'] });
      toast({ title: 'Item removido' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleAddItem = async () => {
    if (!newItem.descricao.trim()) {
      toast({ title: 'Informe a descrição do item', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const maxOrdem = items.reduce((max, i) => Math.max(max, i.ordem || 0), 0);
      await insertSingleEapItem({
        obra_id: obraId,
        descricao: newItem.descricao.trim(),
        pacote: newItem.pacote || undefined,
        lote: newItem.lote || undefined,
        classificacao_adicional: newItem.classificacao_adicional || undefined,
        unidade: newItem.unidade || undefined,
        quantidade: newItem.quantidade ? parseFloat(newItem.quantidade) : undefined,
        tipo: 'item',
        ordem: maxOrdem + 1,
      } as any);
      queryClient.invalidateQueries({ queryKey: ['eap', obraId] });
      queryClient.invalidateQueries({ queryKey: ['eap-all'] });
      toast({ title: 'Item adicionado!' });
      setNewItem({ descricao: '', pacote: '', lote: '', classificacao_adicional: '', unidade: '', quantidade: '' });
      setAddingItem(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Editar Orçamento — {obraNome}
          </DialogTitle>
          <DialogDescription className="font-body text-xs">
            {items.length} atividade(s) · Edite nome, pacote, serviço e classificação dos itens
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs font-body"
            />
          </div>
          <div className="flex items-center border rounded-md h-8 text-xs font-body overflow-hidden shrink-0">
            <button
              className={cn(
                'px-2.5 h-full transition-colors',
                groupBy === 'pacote'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
              onClick={() => { setGroupBy('pacote'); setCollapsedGroups(new Set()); }}
            >
              <Package className="h-3.5 w-3.5 inline mr-1" />
              Pacote
            </button>
            <button
              className={cn(
                'px-2.5 h-full transition-colors',
                groupBy === 'lote'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
              onClick={() => { setGroupBy('lote'); setCollapsedGroups(new Set()); }}
            >
              <Layers className="h-3.5 w-3.5 inline mr-1" />
              Serviço
            </button>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs font-body"
            onClick={() => setAddingItem(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Novo Item
          </Button>
        </div>

        {/* Add item form */}
        {addingItem && (
          <div className="border border-accent/30 rounded-lg p-3 space-y-3 bg-accent/5">
            <p className="text-xs font-heading font-semibold text-accent">Novo Item</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-[10px] font-body">Descrição *</Label>
                <Input
                  value={newItem.descricao}
                  onChange={e => setNewItem({ ...newItem, descricao: e.target.value })}
                  className="h-7 text-xs font-body"
                  placeholder="Nome da atividade"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-body">Pacote de Trabalho</Label>
                <Input
                  value={newItem.pacote}
                  onChange={e => setNewItem({ ...newItem, pacote: e.target.value })}
                  className="h-7 text-xs font-body"
                  placeholder="Ex: Infraestrutura"
                  list="pacote-list"
                />
                <datalist id="pacote-list">
                  {uniquePacotes.map(p => <option key={p} value={p!} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-body">Tipo de Serviço</Label>
                <Input
                  value={newItem.lote}
                  onChange={e => setNewItem({ ...newItem, lote: e.target.value })}
                  className="h-7 text-xs font-body"
                  placeholder="Ex: Terraplanagem"
                  list="lote-list"
                />
                <datalist id="lote-list">
                  {uniqueLotes.map(l => <option key={l} value={l!} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-body">Classificação Adicional</Label>
                <Input
                  value={newItem.classificacao_adicional}
                  onChange={e => setNewItem({ ...newItem, classificacao_adicional: e.target.value })}
                  className="h-7 text-xs font-body"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-[10px] font-body">Unidade</Label>
                  <Input
                    value={newItem.unidade}
                    onChange={e => setNewItem({ ...newItem, unidade: e.target.value })}
                    className="h-7 text-xs font-body"
                    placeholder="m², m³, un"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-[10px] font-body">Quantidade</Label>
                  <Input
                    type="number"
                    value={newItem.quantidade}
                    onChange={e => setNewItem({ ...newItem, quantidade: e.target.value })}
                    className="h-7 text-xs font-body"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs font-body" onClick={() => setAddingItem(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="h-7 text-xs font-body" onClick={handleAddItem} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Adicionar
              </Button>
            </div>
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground font-body">
              Nenhum item na EAP. Importe um orçamento ou adicione itens manualmente.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground font-body">
              Nenhum item encontrado para "{search}"
            </div>
          ) : (
            <div className="space-y-1 pr-3">
              {grouped.map(([pacote, groupItems]) => {
                const isCollapsed = collapsedGroups.has(pacote);
                return (
                  <div key={pacote}>
                    <button
                      className="flex items-center gap-2 w-full py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
                      onClick={() => toggleGroup(pacote)}
                    >
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      <Package className="h-3.5 w-3.5 text-accent" />
                      <span className="text-xs font-heading font-semibold flex-1 text-left">{pacote}</span>
                      <Badge variant="secondary" className="text-[10px]">{groupItems.length}</Badge>
                    </button>

                    {!isCollapsed && (
                      <div className="ml-6 space-y-0.5 mb-2">
                        {groupItems.map(item => (
                          <div key={item.id}>
                            {editing?.id === item.id ? (
                              /* Inline edit form */
                              <div className="border border-primary/30 rounded p-2 space-y-2 bg-primary/5">
                                <div className="space-y-1">
                                  <Label className="text-[10px] font-body">Descrição</Label>
                                  <Input
                                    value={editing.descricao}
                                    onChange={e => setEditing({ ...editing, descricao: e.target.value })}
                                    className="h-7 text-xs font-body"
                                    autoFocus
                                  />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-body">Pacote</Label>
                                    <Input
                                      value={editing.pacote}
                                      onChange={e => setEditing({ ...editing, pacote: e.target.value })}
                                      className="h-7 text-xs font-body"
                                      list="edit-pacote-list"
                                    />
                                    <datalist id="edit-pacote-list">
                                      {uniquePacotes.map(p => <option key={p} value={p!} />)}
                                    </datalist>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-body">Serviço</Label>
                                    <Input
                                      value={editing.lote}
                                      onChange={e => setEditing({ ...editing, lote: e.target.value })}
                                      className="h-7 text-xs font-body"
                                      list="edit-lote-list"
                                    />
                                    <datalist id="edit-lote-list">
                                      {uniqueLotes.map(l => <option key={l} value={l!} />)}
                                    </datalist>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-body">Classif. Adic.</Label>
                                    <Input
                                      value={editing.classificacao_adicional}
                                      onChange={e => setEditing({ ...editing, classificacao_adicional: e.target.value })}
                                      className="h-7 text-xs font-body"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-1.5 justify-end">
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px] font-body" onClick={cancelEdit}>
                                    <X className="h-3 w-3 mr-0.5" /> Cancelar
                                  </Button>
                                  <Button size="sm" className="h-6 text-[10px] font-body" onClick={saveEdit} disabled={saving}>
                                    {saving ? <Loader2 className="h-3 w-3 animate-spin mr-0.5" /> : <Save className="h-3 w-3 mr-0.5" />}
                                    Salvar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              /* Read-only row */
                              <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/30 group/row transition-colors">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {item.codigo && (
                                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">{item.codigo}</span>
                                    )}
                                    <span className="text-xs font-body truncate">{item.descricao}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.lote && (
                                      <span className="text-[10px] text-muted-foreground font-body flex items-center gap-0.5">
                                        <Layers className="h-2.5 w-2.5" />{item.lote}
                                      </span>
                                    )}
                                    {item.classificacao_adicional && (
                                      <Badge variant="outline" className="text-[9px] h-4 px-1">{item.classificacao_adicional}</Badge>
                                    )}
                                    {item.unidade && item.quantidade != null && (
                                      <span className="text-[10px] text-muted-foreground font-body">
                                        {item.quantidade.toLocaleString('pt-BR')} {item.unidade}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => startEdit(item)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle className="font-heading">Remover item?</AlertDialogTitle>
                                        <AlertDialogDescription className="font-body">
                                          "{item.descricao}" será removido permanentemente. Medições de diário associadas também serão afetadas.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDelete(item.id)}
                                          className="bg-destructive text-destructive-foreground font-body"
                                        >
                                          Remover
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
