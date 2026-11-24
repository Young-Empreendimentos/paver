import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes, Settings2, Loader2, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck,
  Plus, Camera, ArrowLeft, AlertTriangle, CheckCircle2, Receipt, Upload, Sparkles, Trash2, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  fetchObras, fetchEstoqueItens, fetchEstoqueMovimentos, fetchInventarios, fetchInventarioItens,
  createInventario, deleteInventario, insertInventarioItens, updateInventarioItem,
  uploadPrivateFile, getSignedUrl, removeStorageFile, EMPREITEIROS_BUCKET,
  uploadNfPdf, extrairNf, fetchEstoqueNfMapa, fetchEstoqueNotas, importarNf, normalizaDescNf,
  type EstoqueItem, type EstoqueMovimento, type EstoqueInventario, type EstoqueInventarioItem,
} from '@/services/api';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

const itemLabel = (i: EstoqueItem) =>
  [i.nome, i.bitola, i.armado === true ? 'armado' : i.armado === false ? 'não armado' : null].filter(Boolean).join(' · ');

// Número BR enxuto
function fmtNum(v: number) {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  let s = n.toFixed(2).replace(/\.?0+$/, '');
  const parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length > 1 ? parts[0] + ',' + parts[1] : parts[0];
}

// ---------------- Saldo ----------------
function SaldoTab({ itens, movimentos }: { itens: EstoqueItem[]; movimentos: EstoqueMovimento[] }) {
  const porItem = useMemo(() => {
    const m = new Map<string, { entrada: number; saida: number }>();
    for (const mv of movimentos) {
      if (!m.has(mv.item_id)) m.set(mv.item_id, { entrada: 0, saida: 0 });
      const o = m.get(mv.item_id)!;
      if (mv.tipo === 'entrada') o.entrada += Number(mv.quantidade) || 0;
      else o.saida += Number(mv.quantidade) || 0;
    }
    return m;
  }, [movimentos]);

  if (itens.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground font-body">Nenhum item no catálogo. Configure em <Link to="/estoque/config" className="underline">Itens de estoque</Link>.</CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-heading">Material</TableHead>
              <TableHead className="font-heading text-right">Entradas</TableHead>
              <TableHead className="font-heading text-right">Saídas</TableHead>
              <TableHead className="font-heading text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((i) => {
              const o = porItem.get(i.id) || { entrada: 0, saida: 0 };
              const saldo = o.entrada - o.saida;
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-body">{itemLabel(i)} <span className="text-xs text-muted-foreground">({i.unidade})</span></TableCell>
                  <TableCell className="font-body text-right text-emerald-700 dark:text-emerald-400">{fmtNum(o.entrada)}</TableCell>
                  <TableCell className="font-body text-right text-amber-700 dark:text-amber-400">{fmtNum(o.saida)}</TableCell>
                  <TableCell className={`font-body text-right font-semibold ${saldo < 0 ? 'text-destructive' : ''}`}>{fmtNum(saldo)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------- Movimentos ----------------
function MovimentosTab({ itens, movimentos }: { itens: EstoqueItem[]; movimentos: EstoqueMovimento[] }) {
  const nomeById = useMemo(() => new Map(itens.map((i) => [i.id, itemLabel(i)])), [itens]);
  const unById = useMemo(() => new Map(itens.map((i) => [i.id, i.unidade])), [itens]);
  const ordenados = useMemo(
    () => [...movimentos].sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.created_at || '').localeCompare(a.created_at || '')),
    [movimentos],
  );

  if (ordenados.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground font-body">Nenhum movimento ainda. Lance entradas/saídas no Diário de Obra.</CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-heading">Data</TableHead>
              <TableHead className="font-heading">Material</TableHead>
              <TableHead className="font-heading">Tipo</TableHead>
              <TableHead className="font-heading text-right">Qtd</TableHead>
              <TableHead className="font-heading">Obs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenados.map((mv) => (
              <TableRow key={mv.id}>
                <TableCell className="font-body whitespace-nowrap">{(mv.data || '').split('-').reverse().join('/')}</TableCell>
                <TableCell className="font-body">{nomeById.get(mv.item_id) || 'Item'}</TableCell>
                <TableCell>
                  {mv.tipo === 'entrada'
                    ? <Badge className="text-[10px] font-body bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"><ArrowDownToLine className="h-3 w-3 mr-0.5" />Entrada</Badge>
                    : <Badge className="text-[10px] font-body bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300"><ArrowUpFromLine className="h-3 w-3 mr-0.5" />Saída</Badge>}
                </TableCell>
                <TableCell className="font-body text-right">{fmtNum(mv.quantidade)} {unById.get(mv.item_id) || ''}</TableCell>
                <TableCell className="font-body text-xs text-muted-foreground">{mv.observacao || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------- Inventário: detalhe (contagem física × sistema) ----------------
function InventarioDetalhe({ inventario, itens, onVoltar }: { inventario: EstoqueInventario; itens: EstoqueItem[]; onVoltar: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const nomeById = useMemo(() => new Map(itens.map((i) => [i.id, itemLabel(i)])), [itens]);
  const unById = useMemo(() => new Map(itens.map((i) => [i.id, i.unidade])), [itens]);

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ['inventario-itens', inventario.id],
    queryFn: () => fetchInventarioItens(inventario.id),
  });

  const [busy, setBusy] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['inventario-itens', inventario.id] });

  const salvarFisico = async (li: EstoqueInventarioItem, valor: string) => {
    setBusy(li.id);
    try {
      await updateInventarioItem(li.id, { saldo_fisico: valor === '' ? null : Number(valor) });
      invalidate();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const salvarObs = async (li: EstoqueInventarioItem, texto: string) => {
    setBusy(li.id);
    try { await updateInventarioItem(li.id, { observacao: texto || null }); invalidate(); }
    catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const enviarFoto = async (li: EstoqueInventarioItem, file: File) => {
    setBusy(li.id);
    try {
      const path = `estoque/inventario/${inventario.id}/${li.item_id}_${Date.now()}_${slug(file.name)}`;
      const stored = await uploadPrivateFile(EMPREITEIROS_BUCKET, path, file);
      if (li.foto_path) { try { await removeStorageFile(EMPREITEIROS_BUCKET, li.foto_path); } catch { /* ignora */ } }
      await updateInventarioItem(li.id, { foto_path: stored });
      invalidate();
      toast({ title: 'Foto anexada' });
    } catch (e: any) { toast({ title: 'Erro ao enviar foto', description: e.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const abrirFoto = async (path: string) => {
    try { window.open(await getSignedUrl(EMPREITEIROS_BUCKET, path, 300), '_blank', 'noopener'); }
    catch (e: any) { toast({ title: 'Erro ao abrir', description: e.message, variant: 'destructive' }); }
  };

  const mes = (inventario.competencia || '').slice(0, 7).split('-').reverse().join('/');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onVoltar} className="font-body"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
        <span className="font-heading text-sm">Inventário · {mes}</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-heading">Material</TableHead>
                  <TableHead className="font-heading text-right">Sistema</TableHead>
                  <TableHead className="font-heading text-right">Físico</TableHead>
                  <TableHead className="font-heading text-right">Diferença</TableHead>
                  <TableHead className="font-heading">Foto</TableHead>
                  <TableHead className="font-heading">Obs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((li) => {
                  const dif = li.saldo_fisico == null ? null : Number(li.saldo_fisico) - Number(li.saldo_sistema);
                  return (
                    <TableRow key={li.id} className={busy === li.id ? 'opacity-60' : ''}>
                      <TableCell className="font-body">{nomeById.get(li.item_id) || 'Item'} <span className="text-xs text-muted-foreground">({unById.get(li.item_id) || ''})</span></TableCell>
                      <TableCell className="font-body text-right">{fmtNum(Number(li.saldo_sistema))}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" inputMode="decimal" step="any"
                          defaultValue={li.saldo_fisico == null ? '' : String(li.saldo_fisico)}
                          onBlur={(e) => { const v = e.target.value; if (v !== (li.saldo_fisico == null ? '' : String(li.saldo_fisico))) salvarFisico(li, v); }}
                          className="h-8 w-24 text-xs font-body ml-auto" placeholder="—"
                        />
                      </TableCell>
                      <TableCell className="font-body text-right">
                        {dif == null ? <span className="text-muted-foreground">—</span>
                          : dif === 0 ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />0</span>
                          : <span className="inline-flex items-center gap-1 text-destructive font-semibold"><AlertTriangle className="h-3.5 w-3.5" />{dif > 0 ? '+' : ''}{fmtNum(dif)}</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {li.foto_path && <Button variant="ghost" size="sm" className="h-7 text-xs font-body" onClick={() => abrirFoto(li.foto_path!)}>ver</Button>}
                          <label className="inline-flex items-center gap-1 text-xs font-body cursor-pointer text-accent hover:underline">
                            <Camera className="h-3.5 w-3.5" /> {li.foto_path ? 'trocar' : 'foto'}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFoto(li, f); e.target.value = ''; }} />
                          </label>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          defaultValue={li.observacao || ''}
                          onBlur={(e) => { if ((e.target.value || '') !== (li.observacao || '')) salvarObs(li, e.target.value); }}
                          className="h-8 w-40 text-xs font-body" placeholder="—"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------- Inventário: aba (lista + novo) ----------------
function InventarioTab({ obraId, itens, saldoMap }: { obraId: string; itens: EstoqueItem[]; saldoMap: Map<string, number> }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<EstoqueInventario | null>(null);
  const [criando, setCriando] = useState(false);
  const now = new Date();
  const [mesNovo, setMesNovo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const { data: inventarios = [], isLoading } = useQuery({
    queryKey: ['inventarios', obraId],
    queryFn: () => fetchInventarios(obraId),
  });

  const criarInventario = async () => {
    setCriando(true);
    try {
      const competencia = `${mesNovo}-01`;
      const inv = await createInventario(obraId, competencia, user!.id);
      const rows = itens.map((i) => ({
        inventario_id: inv.id, item_id: i.id,
        saldo_sistema: saldoMap.get(i.id) || 0, saldo_fisico: null, foto_path: null, observacao: null,
      }));
      await insertInventarioItens(rows);
      qc.invalidateQueries({ queryKey: ['inventarios', obraId] });
      toast({ title: 'Inventário criado', description: 'Agora conte o físico de cada item.' });
      setAberto(inv);
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setCriando(false); }
  };

  const excluir = async (inv: EstoqueInventario) => {
    if (!window.confirm('Excluir este inventário e suas contagens?')) return;
    try { await deleteInventario(inv.id); qc.invalidateQueries({ queryKey: ['inventarios', obraId] }); }
    catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
  };

  if (aberto) return <InventarioDetalhe inventario={aberto} itens={itens} onVoltar={() => setAberto(null)} />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground font-body block mb-1">Competência do inventário</label>
            <Input type="month" value={mesNovo} onChange={(e) => setMesNovo(e.target.value)} className="w-[160px] h-9 font-body" />
          </div>
          <Button onClick={criarInventario} disabled={criando || itens.length === 0} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
            {criando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Novo inventário
          </Button>
          <p className="text-xs text-muted-foreground font-body">Congela o saldo do sistema por item; você preenche o físico, anexa foto e vê a divergência.</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : inventarios.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground font-body">Nenhum inventário ainda.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {inventarios.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-accent" />
                  <span className="font-body text-sm font-medium">{(inv.competencia || '').slice(0, 7).split('-').reverse().join('/')}</span>
                  <span className="text-xs text-muted-foreground font-body">criado {new Date(inv.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="font-body" onClick={() => setAberto(inv)}>Abrir</Button>
                  <Button variant="ghost" size="sm" className="font-body text-destructive" onClick={() => excluir(inv)}>Excluir</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Nota Fiscal (IA lê o PDF e vira entrada) ----------------
type NfLinha = { descricao: string; unidade: string; quantidade: string; item_id: string };

function NfTab({ obraId, itens }: { obraId: string; itens: EstoqueItem[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [arquivoPath, setArquivoPath] = useState<string | null>(null);
  const [meta, setMeta] = useState({ numero: '', fornecedor: '', data_emissao: '', valor_total: '' });
  const [linhas, setLinhas] = useState<NfLinha[]>([]);
  const [lido, setLido] = useState(false);

  const { data: mapa } = useQuery({ queryKey: ['estoque-nf-mapa'], queryFn: fetchEstoqueNfMapa });
  const { data: notas = [] } = useQuery({ queryKey: ['estoque-notas', obraId], queryFn: () => fetchEstoqueNotas(obraId), enabled: !!obraId });

  const autoItem = (desc: string): string => {
    const d = normalizaDescNf(desc);
    const m = mapa?.get(d);
    if (m && itens.some((i) => i.id === m)) return m;
    const hit = itens.find((i) => d.includes(i.nome.toLowerCase()));
    return hit?.id ?? '';
  };

  const ler = async () => {
    if (!file) return;
    setLendo(true);
    try {
      const path = await uploadNfPdf(obraId, file);
      setArquivoPath(path);
      const ex = await extrairNf(path);
      setMeta({ numero: ex.numero ?? '', fornecedor: ex.fornecedor ?? '', data_emissao: ex.data_emissao ?? '', valor_total: ex.valor_total == null ? '' : String(ex.valor_total) });
      setLinhas((ex.itens ?? []).map((it) => ({ descricao: it.descricao ?? '', unidade: it.unidade ?? '', quantidade: it.quantidade == null ? '' : String(it.quantidade), item_id: autoItem(it.descricao ?? '') })));
      setLido(true);
      if ((ex.itens ?? []).length === 0) toast({ title: 'Nenhum produto encontrado', description: 'Confira o PDF.', variant: 'destructive' });
    } catch (e: any) { toast({ title: 'Erro ao ler a NF', description: e.message, variant: 'destructive' }); }
    finally { setLendo(false); }
  };

  const setLinha = (idx: number, patch: Partial<NfLinha>) => setLinhas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLinha = (idx: number) => setLinhas((prev) => prev.filter((_, i) => i !== idx));
  const limpar = () => { setFile(null); setArquivoPath(null); setLido(false); setLinhas([]); setMeta({ numero: '', fornecedor: '', data_emissao: '', valor_total: '' }); };

  const prontas = linhas.filter((l) => l.item_id && Number(l.quantidade) > 0);
  const semVinculo = linhas.filter((l) => !l.item_id).length;

  const importar = async () => {
    if (prontas.length === 0) { toast({ title: 'Nada para importar', description: 'Vincule ao menos um produto a um item do catálogo.', variant: 'destructive' }); return; }
    setImportando(true);
    try {
      const dataEntrada = meta.data_emissao || new Date().toISOString().slice(0, 10);
      await importarNf({
        obraId, userId: user!.id, arquivoPath,
        numero: meta.numero || null, fornecedor: meta.fornecedor || null,
        dataEmissao: meta.data_emissao || null, valorTotal: meta.valor_total ? Number(meta.valor_total) : null,
        data: dataEntrada,
        linhas: prontas.map((l) => ({ item_id: l.item_id, descricao_nf: l.descricao, quantidade: Number(l.quantidade) })),
      });
      qc.invalidateQueries({ queryKey: ['estoque-movimentos', obraId] });
      qc.invalidateQueries({ queryKey: ['estoque-notas', obraId] });
      qc.invalidateQueries({ queryKey: ['estoque-nf-mapa'] });
      toast({ title: 'NF importada', description: `${prontas.length} entrada(s) lançada(s) no estoque.` });
      limpar();
    } catch (e: any) { toast({ title: 'Erro ao importar', description: e.message, variant: 'destructive' }); }
    finally { setImportando(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm font-body cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-muted/40">
              <Upload className="h-4 w-4" /> {file ? file.name : 'Escolher PDF da NF'}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setLido(false); }} />
            </label>
            <Button onClick={ler} disabled={!file || lendo} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
              {lendo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Ler NF
            </Button>
            {lido && <Button variant="ghost" onClick={limpar} className="font-body">Recomeçar</Button>}
          </div>
          <p className="text-xs text-muted-foreground font-body">A IA lê os produtos do PDF. Sempre confira as quantidades e o vínculo antes de importar.</p>
        </CardContent>
      </Card>

      {lido && (
        <>
          <Card>
            <CardContent className="p-4 grid gap-3 sm:grid-cols-4">
              <div><label className="text-xs text-muted-foreground font-body block mb-1">Número</label><Input value={meta.numero} onChange={(e) => setMeta({ ...meta, numero: e.target.value })} className="h-9 font-body" /></div>
              <div className="sm:col-span-2"><label className="text-xs text-muted-foreground font-body block mb-1">Fornecedor</label><Input value={meta.fornecedor} onChange={(e) => setMeta({ ...meta, fornecedor: e.target.value })} className="h-9 font-body" /></div>
              <div><label className="text-xs text-muted-foreground font-body block mb-1">Emissão</label><Input type="date" value={meta.data_emissao} onChange={(e) => setMeta({ ...meta, data_emissao: e.target.value })} className="h-9 font-body" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-heading flex items-center gap-2"><FileText className="h-4 w-4 text-accent" /> Produtos da NF — confira e vincule ao catálogo</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-heading">Produto (NF)</TableHead>
                    <TableHead className="font-heading text-right">Qtd</TableHead>
                    <TableHead className="font-heading">Un</TableHead>
                    <TableHead className="font-heading">Item do catálogo</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, idx) => (
                    <TableRow key={idx} className={l.item_id ? '' : 'bg-amber-50/50 dark:bg-amber-950/10'}>
                      <TableCell className="font-body text-xs max-w-[260px]">{l.descricao || '—'}</TableCell>
                      <TableCell className="text-right"><Input type="number" step="any" value={l.quantidade} onChange={(e) => setLinha(idx, { quantidade: e.target.value })} className="h-8 w-24 text-xs font-body ml-auto" /></TableCell>
                      <TableCell className="font-body text-xs">{l.unidade || '—'}</TableCell>
                      <TableCell>
                        <Select value={l.item_id} onValueChange={(v) => setLinha(idx, { item_id: v })}>
                          <SelectTrigger className="h-8 w-[220px] text-xs font-body"><SelectValue placeholder="— vincular —" /></SelectTrigger>
                          <SelectContent>{itens.map((i) => <SelectItem key={i.id} value={i.id} className="text-xs font-body">{itemLabel(i)}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLinha(idx)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                  {linhas.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground font-body">Nenhum produto lido.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-body">{prontas.length} pronto(s){semVinculo > 0 ? ` · ${semVinculo} sem vínculo (ignorados)` : ''}</span>
            <Button onClick={importar} disabled={importando || prontas.length === 0} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
              {importando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowDownToLine className="h-4 w-4 mr-1" />} Importar {prontas.length} entrada(s)
            </Button>
          </div>
        </>
      )}

      {notas.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-heading">Notas importadas</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead className="font-heading">Número</TableHead><TableHead className="font-heading">Fornecedor</TableHead><TableHead className="font-heading">Emissão</TableHead><TableHead className="font-heading text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {notas.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-body">{n.numero || '—'}</TableCell>
                    <TableCell className="font-body text-xs">{n.fornecedor || '—'}</TableCell>
                    <TableCell className="font-body">{n.data_emissao ? n.data_emissao.split('-').reverse().join('/') : '—'}</TableCell>
                    <TableCell className="font-body text-right">{n.valor_total == null ? '—' : fmtNum(Number(n.valor_total))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------- Página ----------------
export default function Estoque() {
  const [obraSel, setObraSel] = useState('');
  const [tab, setTab] = useState<'saldo' | 'movimentos' | 'nf' | 'inventario'>('saldo');

  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const { data: itens = [] } = useQuery({ queryKey: ['estoque-itens'], queryFn: () => fetchEstoqueItens(false) });
  const obraAtual = obras.find((o) => o.id === obraSel) ?? obras[0];
  const obraId = obraAtual?.id ?? '';

  const { data: movimentos = [], isLoading: loadingMov } = useQuery({
    queryKey: ['estoque-movimentos', obraId],
    queryFn: () => fetchEstoqueMovimentos(obraId),
    enabled: !!obraId,
  });

  const saldoMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const mv of movimentos) {
      const delta = (mv.tipo === 'entrada' ? 1 : -1) * (Number(mv.quantidade) || 0);
      m.set(mv.item_id, (m.get(mv.item_id) || 0) + delta);
    }
    return m;
  }, [movimentos]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-6 w-6 text-accent" /> Controle de Estoque
          </h1>
          <p className="text-muted-foreground font-body">Saldo de materiais na obra, movimentos (lançados no diário) e inventário mensal</p>
        </div>
        <Button asChild variant="outline" className="font-body">
          <Link to="/estoque/config"><Settings2 className="h-4 w-4 mr-2" /> Itens de estoque</Link>
        </Button>
      </div>

      <div className="max-w-sm">
        <Select value={obraAtual?.id ?? ''} onValueChange={setObraSel}>
          <SelectTrigger className="font-body"><SelectValue placeholder="Escolha a obra" /></SelectTrigger>
          <SelectContent>
            {obras.map((o) => <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!obraAtual ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground font-body">Nenhuma obra cadastrada.</CardContent></Card>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="saldo" className="font-body"><Boxes className="h-4 w-4 mr-1.5" /> Saldo</TabsTrigger>
            <TabsTrigger value="movimentos" className="font-body"><ArrowDownToLine className="h-4 w-4 mr-1.5" /> Movimentos</TabsTrigger>
            <TabsTrigger value="nf" className="font-body"><Receipt className="h-4 w-4 mr-1.5" /> Nota Fiscal</TabsTrigger>
            <TabsTrigger value="inventario" className="font-body"><ClipboardCheck className="h-4 w-4 mr-1.5" /> Inventário</TabsTrigger>
          </TabsList>

          {loadingMov ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
          ) : (
            <>
              <TabsContent value="saldo" className="pt-2"><SaldoTab itens={itens} movimentos={movimentos} /></TabsContent>
              <TabsContent value="movimentos" className="pt-2"><MovimentosTab itens={itens} movimentos={movimentos} /></TabsContent>
              <TabsContent value="nf" className="pt-2"><NfTab obraId={obraId} itens={itens} /></TabsContent>
              <TabsContent value="inventario" className="pt-2"><InventarioTab obraId={obraId} itens={itens} saldoMap={saldoMap} /></TabsContent>
            </>
          )}
        </Tabs>
      )}
    </div>
  );
}
