import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Settings2, Building2, Users, Loader2, ArrowRight, HardHat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { EmpregadoAvatar } from '@/components/EmpregadoAvatar';
import { SstDocRow } from '@/components/SstDocRow';
import {
  fetchSstDocumentos, fetchEmpreiteiros, fetchAllEmpregados, fetchObras, fetchEmpreiteiroObras,
  fetchSstStatusDaEmpresa, fetchSstStatusDeEmpresas, fetchEmpregadosQueTrabalharam,
  setSstStatus, uploadPrivateFile, getSignedUrl, EMPREITEIROS_BUCKET,
  type SstDocumento, type SstStatus, type SstStatusValor, type SstStatusKey,
  type Empreiteiro, type Empregado,
} from '@/services/api';
import {
  type Medicao, type Resumo, medicoesDoMes, docAplicaNaMedicao, isDocMedicao, docPessoaAplica,
  indexStatus, statusValor, sstKey, resumoVazio, contaItem, pctResumo,
} from '@/lib/sst';

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

// ---------------- Ações (status / upload) ----------------
function useSstActions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('sst-status') });

  const run = async (k: SstStatusKey, fn: () => Promise<void>) => {
    const bk = sstKey(k.documento_id, k.empreiteiro_id ?? null, k.empregado_id ?? null, k.medicao ?? null);
    setBusyKey(bk);
    try { await fn(); invalidate(); }
    catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setBusyKey(null); }
  };

  const setStatus = (k: SstStatusKey, valor: SstStatusValor) =>
    run(k, async () => { await setSstStatus(k, { status: valor }, user!.id); });
  const setObs = (k: SstStatusKey, texto: string) =>
    run(k, async () => { await setSstStatus(k, { observacao: texto || null }, user!.id); toast({ title: 'Observação salva' }); });
  const upload = (k: SstStatusKey, file: File) =>
    run(k, async () => {
      const path = `sst/${k.empreiteiro_id ?? 'x'}/${k.empregado_id ?? 'empresa'}/${k.documento_id}/${k.medicao ?? 'fixo'}_${Date.now()}_${slug(file.name)}`;
      const stored = await uploadPrivateFile(EMPREITEIROS_BUCKET, path, file);
      await setSstStatus(k, { arquivo_path: stored, arquivo_nome: file.name }, user!.id);
      toast({ title: 'Arquivo enviado' });
    });
  const openFile = async (path: string) => {
    try { window.open(await getSignedUrl(EMPREITEIROS_BUCKET, path, 300), '_blank', 'noopener'); }
    catch (e: any) { toast({ title: 'Erro ao abrir', description: e.message, variant: 'destructive' }); }
  };

  return { busyKey, setStatus, setObs, upload, openFile };
}
type SstActions = ReturnType<typeof useSstActions>;

// ---------------- Resumo (barra + chips) ----------------
function ResumoBar({ r }: { r: Resumo }) {
  const pct = pctResumo(r);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex-1 min-w-[90px]"><Progress value={pct} className="h-2" /></div>
      <span className="text-xs font-body font-semibold w-9 text-right">{pct}%</span>
      {r.aprovado > 0 && <Badge className="text-[10px] font-body bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">{r.aprovado} ok</Badge>}
      {r.pendente > 0 && <Badge className="text-[10px] font-body bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300">{r.pendente} falta</Badge>}
      {r.naoSeAplica > 0 && <Badge variant="outline" className="text-[10px] font-body">{r.naoSeAplica} N/A</Badge>}
      {r.opcionaisPendentes > 0 && <Badge variant="secondary" className="text-[10px] font-body">{r.opcionaisPendentes} opc.</Badge>}
    </div>
  );
}

// ---------------- Lista de documentos ----------------
function DocList({
  docs, keyOf, statusMap, actions,
}: {
  docs: SstDocumento[];
  keyOf: (doc: SstDocumento) => SstStatusKey;
  statusMap: Map<string, SstStatus>;
  actions: SstActions;
}) {
  if (docs.length === 0) return <p className="text-xs text-muted-foreground font-body py-1">Nenhum documento neste grupo.</p>;
  return (
    <div>
      {docs.map((doc) => {
        const k = keyOf(doc);
        const st = statusValor(statusMap, doc.id, k.empreiteiro_id ?? null, k.empregado_id ?? null, k.medicao ?? null);
        const rk = sstKey(doc.id, k.empreiteiro_id ?? null, k.empregado_id ?? null, k.medicao ?? null);
        return (
          <SstDocRow
            key={rk} doc={doc} status={st} busy={actions.busyKey === rk}
            onStatus={(v) => actions.setStatus(k, v)}
            onUpload={(f) => actions.upload(k, f)}
            onOpenFile={actions.openFile}
            onObservacao={(t) => actions.setObs(k, t)}
          />
        );
      })}
    </div>
  );
}

// ---------------- Painel: Por empresa ----------------
function EmpresaPanel({
  empreiteiro, docs, empregados, medicao, actions,
}: {
  empreiteiro: Empreiteiro;
  docs: SstDocumento[];
  empregados: Empregado[];
  medicao: Medicao;
  actions: SstActions;
}) {
  const { data: statusRows = [], isLoading } = useQuery({
    queryKey: ['sst-status', empreiteiro.id],
    queryFn: () => fetchSstStatusDaEmpresa(empreiteiro.id),
  });
  const statusMap = useMemo(() => indexStatus(statusRows), [statusRows]);

  const empresaFixos = useMemo(() => docs.filter((d) => d.escopo === 'empresa' && d.frequencia === 'fixo'), [docs]);
  const empresaMensais = useMemo(
    () => docs.filter((d) => d.escopo === 'empresa' && isDocMedicao(d) && docAplicaNaMedicao(d, medicao)),
    [docs, medicao],
  );
  const pessoaDocsPara = (emp: Empregado) =>
    docs.filter((d) => d.escopo === 'pessoa' && docPessoaAplica(d, !!emp.is_mei) && (d.frequencia === 'fixo' || docAplicaNaMedicao(d, medicao)));

  const empMed = (d: SstDocumento): SstStatusKey => ({ documento_id: d.id, empreiteiro_id: empreiteiro.id, medicao: isDocMedicao(d) ? medicao.data : null });
  const pessoaKey = (emp: Empregado) => (d: SstDocumento): SstStatusKey => ({
    documento_id: d.id, empreiteiro_id: empreiteiro.id, empregado_id: emp.id, medicao: isDocMedicao(d) ? medicao.data : null,
  });

  const rFixos = useMemo(() => {
    const r = resumoVazio();
    for (const d of empresaFixos) contaItem(r, d, statusValor(statusMap, d.id, empreiteiro.id, null, null));
    return r;
  }, [empresaFixos, statusMap, empreiteiro.id]);
  const rMensais = useMemo(() => {
    const r = resumoVazio();
    for (const d of empresaMensais) contaItem(r, d, statusValor(statusMap, d.id, empreiteiro.id, null, medicao.data));
    return r;
  }, [empresaMensais, statusMap, empreiteiro.id, medicao.data]);
  const rFunc = useMemo(() => {
    const r = resumoVazio();
    for (const emp of empregados) for (const d of pessoaDocsPara(emp)) {
      const med = isDocMedicao(d) ? medicao.data : null;
      contaItem(r, d, statusValor(statusMap, d.id, empreiteiro.id, emp.id, med));
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empregados, docs, statusMap, empreiteiro.id, medicao.data]);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <ResumoCard titulo="Documentos da empresa" icon={<Building2 className="h-4 w-4" />} r={rFixos} />
        <ResumoCard titulo={`Mensais · ${medicao.label}`} icon={<ShieldCheck className="h-4 w-4" />} r={rMensais} />
        <ResumoCard titulo={`Funcionários (${empregados.length})`} icon={<Users className="h-4 w-4" />} r={rFunc} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-heading flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" /> Documentos da empresa (fixos)</CardTitle></CardHeader>
        <CardContent><DocList docs={empresaFixos} keyOf={empMed} statusMap={statusMap} actions={actions} /></CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-heading flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" /> Documentos mensais — {medicao.label}</CardTitle></CardHeader>
        <CardContent><DocList docs={empresaMensais} keyOf={empMed} statusMap={statusMap} actions={actions} /></CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-heading flex items-center gap-2"><Users className="h-4 w-4 text-accent" /> Funcionários</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {empregados.length === 0 ? (
            <p className="text-sm text-muted-foreground font-body py-2">Nenhum funcionário cadastrado para este empreiteiro. Cadastre em <Link to="/empreiteiros" className="underline">Empreiteiros</Link>.</p>
          ) : empregados.map((emp) => (
            <div key={emp.id} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <EmpregadoAvatar path={emp.foto_path} size={32} />
                <span className="font-body font-medium text-sm">{emp.nome_completo}</span>
                {emp.is_mei && <Badge variant="outline" className="text-[10px] font-body">MEI</Badge>}
                {!emp.ativo && <Badge variant="outline" className="text-[10px] font-body">inativo</Badge>}
              </div>
              <DocList docs={pessoaDocsPara(emp)} keyOf={pessoaKey(emp)} statusMap={statusMap} actions={actions} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoCard({ titulo, icon, r }: { titulo: string; icon: React.ReactNode; r: Resumo }) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body">{icon}<span className="truncate">{titulo}</span></div>
        <ResumoBar r={r} />
      </CardContent>
    </Card>
  );
}

// ---------------- Painel: Por obra ----------------
function ObraCard({
  empreiteiro, docs, empregados, medicao, statusMap, onAbrir,
}: {
  empreiteiro: Empreiteiro;
  docs: SstDocumento[];
  empregados: Empregado[];
  medicao: Medicao;
  statusMap: Map<string, SstStatus>;
  onAbrir: () => void;
}) {
  const empresaFixos = docs.filter((d) => d.escopo === 'empresa' && d.frequencia === 'fixo');
  const empresaMensais = docs.filter((d) => d.escopo === 'empresa' && isDocMedicao(d) && docAplicaNaMedicao(d, medicao));

  const r = resumoVazio();
  for (const d of empresaFixos) contaItem(r, d, statusValor(statusMap, d.id, empreiteiro.id, null, null));
  for (const d of empresaMensais) contaItem(r, d, statusValor(statusMap, d.id, empreiteiro.id, null, medicao.data));
  for (const emp of empregados) {
    for (const d of docs.filter((x) => x.escopo === 'pessoa' && docPessoaAplica(x, !!emp.is_mei) && (x.frequencia === 'fixo' || docAplicaNaMedicao(x, medicao)))) {
      const med = isDocMedicao(d) ? medicao.data : null;
      contaItem(r, d, statusValor(statusMap, d.id, empreiteiro.id, emp.id, med));
    }
  }

  // Lista curta do que falta (docs de empresa obrigatórios pendentes)
  const faltas: string[] = [];
  for (const d of [...empresaFixos, ...empresaMensais]) {
    if (!d.obrigatorio) continue;
    const med = isDocMedicao(d) ? medicao.data : null;
    const s = statusValor(statusMap, d.id, empreiteiro.id, null, med);
    if ((s?.status ?? 'pendente') === 'pendente') faltas.push(d.nome);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-heading leading-tight">{empreiteiro.razao_social}</CardTitle>
          {!empreiteiro.ativo && <Badge variant="outline" className="text-[10px] shrink-0">inativo</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResumoBar r={r} />
        <div className="text-xs text-muted-foreground font-body flex items-center gap-1"><Users className="h-3 w-3" /> {empregados.length} funcionário(s) no filtro</div>
        {faltas.length > 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-body">
            Falta: {faltas.slice(0, 4).join(', ')}{faltas.length > 4 ? ` +${faltas.length - 4}` : ''}
          </p>
        )}
        <Button size="sm" variant="outline" className="font-body w-full" onClick={onAbrir}>
          Abrir detalhes <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

function ObraPanel({
  obraId, docs, empreiteiros, empreiteiroObras, allEmpregados, medicao, onAbrir,
}: {
  obraId: string;
  docs: SstDocumento[];
  empreiteiros: Empreiteiro[];
  empreiteiroObras: { empreiteiro_id: string; obra_id: string }[];
  allEmpregados: Empregado[];
  medicao: Medicao;
  onAbrir: (empreiteiroId: string) => void;
}) {
  const [filtro, setFiltro] = useState<'todos' | 'recentes'>('todos');

  const desdeISO = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 15); return d.toISOString().slice(0, 10); }, []);

  const empreiteirosNaObra = useMemo(() => empreiteiros.filter((e) => {
    if (!e.ativo) return false;
    const links = empreiteiroObras.filter((l) => l.empreiteiro_id === e.id);
    return links.length === 0 || links.some((l) => l.obra_id === obraId);
  }), [empreiteiros, empreiteiroObras, obraId]);

  const empIds = empreiteirosNaObra.map((e) => e.id);

  const { data: statusRows = [], isLoading } = useQuery({
    queryKey: ['sst-status-obra', obraId, empIds.join(',')],
    queryFn: () => fetchSstStatusDeEmpresas(empIds),
    enabled: empIds.length > 0,
  });
  const statusMap = useMemo(() => indexStatus(statusRows), [statusRows]);

  const { data: workedSet } = useQuery({
    queryKey: ['sst-obra-recentes', obraId, desdeISO],
    queryFn: () => fetchEmpregadosQueTrabalharam(obraId, desdeISO),
    enabled: filtro === 'recentes',
  });

  const empregadosDoEmp = (empId: string) => {
    let list = allEmpregados.filter((e) => e.empreiteiro_id === empId && e.ativo);
    if (filtro === 'recentes' && workedSet) list = list.filter((e) => workedSet.has(e.id));
    return list;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-body">Funcionários:</span>
        <div className="inline-flex rounded-md border border-border p-0.5">
          <button type="button" onClick={() => setFiltro('todos')} className={`px-3 py-1 text-xs font-body rounded ${filtro === 'todos' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}>Todos na obra</button>
          <button type="button" onClick={() => setFiltro('recentes')} className={`px-3 py-1 text-xs font-body rounded ${filtro === 'recentes' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}>Trabalharam (15 dias)</button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : empreiteirosNaObra.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground font-body">Nenhum empreiteiro ativo nesta obra.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {empreiteirosNaObra.map((e) => (
            <ObraCard
              key={e.id} empreiteiro={e} docs={docs} medicao={medicao} statusMap={statusMap}
              empregados={empregadosDoEmp(e.id)} onAbrir={() => onAbrir(e.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Página ----------------
export default function Sst() {
  const actions = useSstActions();
  const [tab, setTab] = useState<'empresa' | 'obra'>('empresa');

  const now = new Date();
  const [mesSel, setMesSel] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [diaSel, setDiaSel] = useState<1 | 16>(now.getDate() < 16 ? 1 : 16);
  const medicao = useMemo<Medicao>(() => {
    const [a, m] = mesSel.split('-').map(Number);
    const ano = Number.isFinite(a) ? a : new Date().getFullYear();
    const mes = Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
    return medicoesDoMes(ano, mes).find((x) => x.dia === diaSel)!;
  }, [mesSel, diaSel]);

  const [empreiteiroSel, setEmpreiteiroSel] = useState<string>('');
  const [obraSel, setObraSel] = useState<string>('');

  const { data: docs = [] } = useQuery({ queryKey: ['sst-documentos'], queryFn: () => fetchSstDocumentos(false) });
  const { data: empreiteiros = [], isLoading: loadingEmp } = useQuery({ queryKey: ['empreiteiros'], queryFn: fetchEmpreiteiros });
  const { data: empregados = [] } = useQuery({ queryKey: ['empregados-all'], queryFn: fetchAllEmpregados });
  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const { data: empreiteiroObras = [] } = useQuery({ queryKey: ['empreiteiro-obras'], queryFn: fetchEmpreiteiroObras });

  const empreiteirosAtivos = useMemo(() => empreiteiros.filter((e) => e.ativo), [empreiteiros]);
  const empreiteiroAtual = empreiteiros.find((e) => e.id === empreiteiroSel) ?? empreiteirosAtivos[0];
  const obraAtual = obras.find((o) => o.id === obraSel) ?? obras[0];

  const empregadosDoAtual = useMemo(
    () => (empreiteiroAtual ? empregados.filter((e) => e.empreiteiro_id === empreiteiroAtual.id && e.ativo) : []),
    [empreiteiroAtual, empregados],
  );

  const abrirEmpresa = (empreiteiroId: string) => { setEmpreiteiroSel(empreiteiroId); setTab('empresa'); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-accent" /> Controle de SST
          </h1>
          <p className="text-muted-foreground font-body">Controle de documentos de SST dos empreiteiros e funcionários</p>
        </div>
        <Button asChild variant="outline" className="font-body">
          <Link to="/sst/config"><Settings2 className="h-4 w-4 mr-2" /> Configurações</Link>
        </Button>
      </div>

      {/* Seletor de medição (usado nos dois painéis) */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground font-body">Medição:</span>
          <Input type="month" value={mesSel} onChange={(e) => setMesSel(e.target.value)} className="w-[150px] font-body h-9" />
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button type="button" onClick={() => setDiaSel(1)} className={`px-3 py-1 text-xs font-body rounded ${diaSel === 1 ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}>Dia 1</button>
            <button type="button" onClick={() => setDiaSel(16)} className={`px-3 py-1 text-xs font-body rounded ${diaSel === 16 ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}>Dia 16</button>
          </div>
          <span className="text-xs text-muted-foreground font-body">Vale para os documentos mensais/por medição.</span>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'empresa' | 'obra')}>
        <TabsList>
          <TabsTrigger value="empresa" className="font-body"><Building2 className="h-4 w-4 mr-1.5" /> Por empresa</TabsTrigger>
          <TabsTrigger value="obra" className="font-body"><HardHat className="h-4 w-4 mr-1.5" /> Por obra</TabsTrigger>
        </TabsList>

        <TabsContent value="empresa" className="space-y-4 pt-2">
          <div className="max-w-sm">
            <Select value={empreiteiroAtual?.id ?? ''} onValueChange={setEmpreiteiroSel}>
              <SelectTrigger className="font-body"><SelectValue placeholder="Escolha o empreiteiro" /></SelectTrigger>
              <SelectContent>
                {empreiteirosAtivos.map((e) => <SelectItem key={e.id} value={e.id} className="font-body">{e.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loadingEmp ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
          ) : !empreiteiroAtual ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground font-body">Nenhum empreiteiro cadastrado. Cadastre em <Link to="/empreiteiros" className="underline">Empreiteiros</Link>.</CardContent></Card>
          ) : (
            <EmpresaPanel empreiteiro={empreiteiroAtual} docs={docs} empregados={empregadosDoAtual} medicao={medicao} actions={actions} />
          )}
        </TabsContent>

        <TabsContent value="obra" className="space-y-4 pt-2">
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
            <ObraPanel
              obraId={obraAtual.id} docs={docs} empreiteiros={empreiteiros} empreiteiroObras={empreiteiroObras}
              allEmpregados={empregados} medicao={medicao} onAbrir={abrirEmpresa}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
