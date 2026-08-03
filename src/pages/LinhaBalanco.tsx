import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Calendar,
  Check,
  ChevronsUpDown,
  FolderTree,
  History,
  Layers,
  Link2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fetchEapItems, fetchObras } from '@/services/api';
import { bulkUpdateEapItems, calculateDependencyDates } from '@/services/eapApi';

import { paverDb } from '@/integrations/supabase/paver';
import type { EapItem } from '@/services/api';

const BaselineManager = lazy(() => import('@/components/BaselineManager'));
const LinhaBalancoFullChart = lazy(() => import('@/components/LinhaBalancoFullChart'));

type GroupMode = 'pacote' | 'servico';

function PanelLoadingState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-6">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
        <div className="space-y-1 text-center">
          <p className="font-heading text-base text-foreground">{title}</p>
          <p className="font-body text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function ModalLoadingState({
  open,
  onOpenChange,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription className="font-body text-sm">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
          <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LinhaBalancoPage() {
  const [selectedObra, setSelectedObra] = useState('');
  const [mode, setMode] = useState<GroupMode>('pacote');
  const [selectedPacote, setSelectedPacote] = useState('all');
  const [selectedServico, setSelectedServico] = useState('all');
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [pacotePopoverOpen, setPacotePopoverOpen] = useState(false);
  const [pendingBaseline, setPendingBaseline] = useState(false);
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('engenharia');

  useEffect(() => {
    if (!pendingBaseline) return;
    const timer = window.setTimeout(() => {
      setBaselineOpen(true);
      setPendingBaseline(false);
    }, 30);
    return () => window.clearTimeout(timer);
  }, [pendingBaseline]);

  const { data: obras = [] } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: eapItems = [], isLoading } = useQuery({
    queryKey: ['eap-items-balance', selectedObra],
    queryFn: () => fetchEapItems(selectedObra),
    enabled: !!selectedObra,
  });

  const { data: lastDiarioDate } = useQuery({
    queryKey: ['last-diario-date', selectedObra],
    queryFn: async () => {
      const { data, error } = await paverDb
        .from('paver_diarios')
        .select('data')
        .eq('obra_id', selectedObra)
        .order('data', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.data ?? null;
    },
    enabled: !!selectedObra,
  });

  const uniquePacotes = useMemo(() => {
    const values = new Set<string>();
    eapItems.forEach(item => { if (item.pacote) values.add(item.pacote); });
    return Array.from(values).sort();
  }, [eapItems]);

  const uniqueServicos = useMemo(() => {
    const values = new Set<string>();
    eapItems.forEach(item => { if (item.lote) values.add(item.lote); });
    return Array.from(values).sort();
  }, [eapItems]);

  const filteredItems = useMemo(() => {
    let items = eapItems;
    if (selectedPacote !== 'all') items = items.filter(item => item.pacote === selectedPacote);
    if (selectedServico !== 'all') items = items.filter(item => item.lote === selectedServico);
    return items;
  }, [eapItems, selectedPacote, selectedServico]);

  const selectedObraObj = obras.find(obra => obra.id === selectedObra);
  const obraName = selectedObraObj?.nome;

  const effectiveDateStart = customDateStart || selectedObraObj?.data_inicio;
  const effectiveDateEnd = customDateEnd || selectedObraObj?.data_previsao;

  const handleRecalcDeps = async () => {
    const calculated = calculateDependencyDates(eapItems);
    const changes: { id: string; updates: Partial<EapItem> }[] = [];

    calculated.forEach((dates, itemId) => {
      changes.push({
        id: itemId,
        updates: { data_inicio_prevista: dates.inicio, data_fim_prevista: dates.fim },
      });
    });

    if (changes.length === 0) {
      toast({ title: 'Nenhum item com dependências para recalcular', variant: 'destructive' });
      return;
    }

    await bulkUpdateEapItems(changes);
    queryClient.invalidateQueries({ queryKey: ['eap-items-balance', selectedObra] });
    toast({ title: `Datas recalculadas para ${changes.length} itens!` });
  };

  if (!selectedObra) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-6">
        <BarChart3 className="h-16 w-16 text-muted-foreground/30" />
        <div className="space-y-1 text-center">
          <h1 className="font-heading text-2xl font-bold text-foreground">Linha de Balanço</h1>
          <p className="font-body text-muted-foreground">Selecione uma obra para visualizar</p>
        </div>
        <Select
          value=""
          onValueChange={value => {
            setSelectedObra(value);
            setSelectedPacote('all');
            setSelectedServico('all');
          }}
        >
          <SelectTrigger className="w-72 font-body">
            <Building2 className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Escolha uma obra" />
          </SelectTrigger>
          <SelectContent>
            {obras.map(obra => (
              <SelectItem key={obra.id} value={obra.id} className="font-body">{obra.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-2">
      {/* Linha 1: Filtros */}
      <div className="flex flex-wrap items-end gap-3 shrink-0">
        <div className="space-y-1">
          <Label className="font-body text-xs text-muted-foreground">Obra</Label>
          <Select
            value={selectedObra}
            onValueChange={value => {
              setSelectedObra(value);
              setSelectedPacote('all');
              setSelectedServico('all');
            }}
          >
            <SelectTrigger className="w-48 h-8 font-body text-sm">
              <Building2 className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {obras.map(obra => (
                <SelectItem key={obra.id} value={obra.id} className="font-body">{obra.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="font-body text-xs text-muted-foreground">Agrupar por</Label>
          <div className="overflow-hidden rounded-md border border-border flex items-center h-8">
            <button
              onClick={() => setMode('pacote')}
              className={`flex items-center gap-1 px-2.5 h-full text-xs font-body transition-colors ${
                mode === 'pacote' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <FolderTree className="h-3 w-3" />
              Pacote
            </button>
            <button
              onClick={() => setMode('servico')}
              className={`flex items-center gap-1 px-2.5 h-full text-xs font-body transition-colors ${
                mode === 'servico' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Layers className="h-3 w-3" />
              Serviço
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="font-body text-xs text-muted-foreground">Pacote</Label>
          <Popover open={pacotePopoverOpen} onOpenChange={setPacotePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-44 h-8 justify-between font-body text-xs font-normal">
                <span className="truncate">{selectedPacote === 'all' ? 'Todos' : selectedPacote}</span>
                <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar pacote..." className="font-body" />
                <CommandList>
                  <CommandEmpty className="py-3 text-center font-body text-xs text-muted-foreground">Nenhum pacote encontrado</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value="all" onSelect={() => { setSelectedPacote('all'); setPacotePopoverOpen(false); }} className="font-body">
                      <Check className={cn('mr-2 h-4 w-4', selectedPacote === 'all' ? 'opacity-100' : 'opacity-0')} />
                      Todos
                    </CommandItem>
                    {uniquePacotes.map(pacote => (
                      <CommandItem key={pacote} value={pacote} onSelect={() => { setSelectedPacote(pacote); setPacotePopoverOpen(false); }} className="font-body">
                        <Check className={cn('mr-2 h-4 w-4', selectedPacote === pacote ? 'opacity-100' : 'opacity-0')} />
                        {pacote}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label className="font-body text-xs text-muted-foreground">Tipo Serviço</Label>
          <Select value={selectedServico} onValueChange={setSelectedServico}>
            <SelectTrigger className="w-44 h-8 font-body text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-body">Todos</SelectItem>
              {uniqueServicos.map(servico => (
                <SelectItem key={servico} value={servico} className="font-body">{servico}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="font-body text-xs text-muted-foreground">De</Label>
          <Input
            type="date"
            value={customDateStart || selectedObraObj?.data_inicio || ''}
            onChange={e => setCustomDateStart(e.target.value)}
            className="w-32 h-8 text-xs font-body"
          />
        </div>
        <div className="space-y-1">
          <Label className="font-body text-xs text-muted-foreground">Até</Label>
          <Input
            type="date"
            value={customDateEnd || selectedObraObj?.data_previsao || ''}
            onChange={e => setCustomDateEnd(e.target.value)}
            className="w-32 h-8 text-xs font-body"
          />
        </div>
        {(customDateStart || customDateEnd) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setCustomDateStart(''); setCustomDateEnd(''); }}
            className="font-body text-xs h-8 px-2"
          >
            Resetar
          </Button>
        )}
      </div>

      {/* Linha 2: Botões de ação */}
      {canEdit && selectedObra && (
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/datas-eap?obra=${selectedObra}`)}
            className="font-body h-7 text-xs"
          >
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Datas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPendingBaseline(true)}
            disabled={pendingBaseline}
            className="font-body h-7 text-xs"
          >
            {pendingBaseline ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <History className="mr-1.5 h-3.5 w-3.5" />}
            Baselines
          </Button>
          <Button variant="outline" size="sm" onClick={handleRecalcDeps} className="font-body h-7 text-xs">
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Recalcular
          </Button>
        </div>
      )}

      {/* Gráfico */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <PanelLoadingState title="Carregando dados da obra" description="Buscando itens da EAP para montar a linha de balanço." />
        ) : (
          <Suspense fallback={<PanelLoadingState title="Preparando gráfico" description="Montando a linha de balanço em segundo plano." />}>
            <LinhaBalancoFullChart eapItems={filteredItems} mode={mode} obraName={obraName} obraDataInicio={effectiveDateStart} obraDataPrevisao={effectiveDateEnd} lastDiarioDate={lastDiarioDate ?? undefined} />
          </Suspense>
        )}
      </div>

      {baselineOpen && (
        <Suspense
          fallback={
            <ModalLoadingState
              open={baselineOpen}
              onOpenChange={setBaselineOpen}
              title="Carregando baselines"
              description="Buscando snapshots da obra em segundo plano."
            />
          }
        >
          <BaselineManager
            open={baselineOpen}
            onOpenChange={setBaselineOpen}
            obraId={selectedObra}
            eapItems={eapItems}
          />
        </Suspense>
      )}
    </div>
  );
}