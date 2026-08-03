import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, Loader2, Download, Filter, FolderTree, Layers, ChevronDown, ChevronRight, Check, ChevronsUpDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fetchObras, fetchAllEapItems, Obra, EapItem } from '@/services/api';

type GroupMode = 'pacote' | 'servico';

export default function Relatorios() {
  const [selectedObra, setSelectedObra] = useState<string>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('pacote');
  const [selectedPacote, setSelectedPacote] = useState<string>('all');
  const [selectedServico, setSelectedServico] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openObra, setOpenObra] = useState(false);
  const [openPacote, setOpenPacote] = useState(false);
  const [openServico, setOpenServico] = useState(false);

  const { data: obras = [], isLoading: loadingObras } = useQuery({
    queryKey: ['obras'],
    queryFn: fetchObras,
  });

  const { data: allEapItems = [], isLoading: loadingEap } = useQuery({
    queryKey: ['eap-all'],
    queryFn: fetchAllEapItems,
  });

  // Itens com quantidade 0 (diâmetro/serviço que não existe naquela rua) não têm
  // nada a executar; contá-los como 0% distorcia a média pra baixo. Ficam de fora
  // do relatório (continuam na EAP/orçamento).
  const withQty = allEapItems.filter(i => (i.quantidade ?? 0) > 0);
  const obraFiltered = selectedObra === 'all'
    ? withQty
    : withQty.filter(i => i.obra_id === selectedObra);

  const uniquePacotes = useMemo(() => {
    const set = new Set<string>();
    obraFiltered.forEach(i => { if (i.pacote) set.add(i.pacote); });
    return Array.from(set).sort();
  }, [obraFiltered]);

  const uniqueServicos = useMemo(() => {
    const set = new Set<string>();
    obraFiltered.forEach(i => { if (i.lote) set.add(i.lote); });
    return Array.from(set).sort();
  }, [obraFiltered]);

  const filteredItems = useMemo(() => {
    let items = obraFiltered;
    if (selectedPacote !== 'all') items = items.filter(i => i.pacote === selectedPacote);
    if (selectedServico !== 'all') items = items.filter(i => i.lote === selectedServico);
    return items;
  }, [obraFiltered, selectedPacote, selectedServico]);

  const obraMap = Object.fromEntries(obras.map(o => [o.id, o]));

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: EapItem[] }>();
    for (const item of filteredItems) {
      const key = groupMode === 'pacote'
        ? (item.pacote || 'Sem pacote')
        : (item.lote || 'Sem classificação');
      if (!map.has(key)) map.set(key, { label: key, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values());
  }, [filteredItems, groupMode]);

  const totalItems = filteredItems.length;
  const avgBase = totalItems > 0 ? filteredItems.reduce((s, i) => s + (i.avanco_base || 0), 0) / totalItems : 0;
  const avgPrevisto = totalItems > 0 ? filteredItems.reduce((s, i) => s + (i.avanco_previsto || 0), 0) / totalItems : 0;
  const avgRealizado = totalItems > 0 ? filteredItems.reduce((s, i) => s + (i.avanco_realizado || 0), 0) / totalItems : 0;

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExportCSV = () => {
    const headers = ['Obra', 'Código', 'Descrição', 'Pacote', 'Tipo Serviço', 'Unidade', 'Qtd', 'Base %', 'Previsto %', 'Realizado %'];
    const rows = filteredItems.map(item => [
      obraMap[item.obra_id]?.nome || '',
      item.codigo || '',
      item.descricao,
      item.pacote || '',
      item.lote || '',
      item.unidade || '',
      String(item.quantidade || 0),
      String(item.avanco_base || 0),
      String(item.avanco_previsto || 0),
      String(item.avanco_realizado || 0),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-avanco-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = loadingObras || loadingEap;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground font-body">Relatórios de avanço físico e medições</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={filteredItems.length === 0}
          className="font-body"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Obra combobox */}
        <Popover open={openObra} onOpenChange={setOpenObra}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={openObra} className="w-56 justify-between font-body">
              <div className="flex items-center gap-2 truncate">
                <Filter className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {selectedObra === 'all' ? 'Todas as obras' : obras.find(o => o.id === selectedObra)?.nome || 'Obra'}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0">
            <Command>
              <CommandInput placeholder="Buscar obra..." className="font-body" />
              <CommandList>
                <CommandEmpty className="font-body text-xs p-2">Nenhuma obra encontrada.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="all" onSelect={() => { setSelectedObra('all'); setSelectedPacote('all'); setSelectedServico('all'); setOpenObra(false); }} className="font-body">
                    <Check className={cn("mr-2 h-4 w-4", selectedObra === 'all' ? "opacity-100" : "opacity-0")} />
                    Todas as obras
                  </CommandItem>
                  {obras.map(o => (
                    <CommandItem key={o.id} value={o.nome} onSelect={() => { setSelectedObra(o.id); setSelectedPacote('all'); setSelectedServico('all'); setOpenObra(false); }} className="font-body">
                      <Check className={cn("mr-2 h-4 w-4", selectedObra === o.id ? "opacity-100" : "opacity-0")} />
                      {o.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Pacote combobox */}
        <Popover open={openPacote} onOpenChange={setOpenPacote}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={openPacote} className="w-52 justify-between font-body">
              <div className="flex items-center gap-2 truncate">
                <FolderTree className="h-4 w-4 shrink-0" />
                <span className="truncate">{selectedPacote === 'all' ? 'Todos os pacotes' : selectedPacote}</span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <Command>
              <CommandInput placeholder="Buscar pacote..." className="font-body" />
              <CommandList>
                <CommandEmpty className="font-body text-xs p-2">Nenhum pacote encontrado.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="all" onSelect={() => { setSelectedPacote('all'); setOpenPacote(false); }} className="font-body">
                    <Check className={cn("mr-2 h-4 w-4", selectedPacote === 'all' ? "opacity-100" : "opacity-0")} />
                    Todos os pacotes
                  </CommandItem>
                  {uniquePacotes.map(p => (
                    <CommandItem key={p} value={p} onSelect={() => { setSelectedPacote(p); setOpenPacote(false); }} className="font-body">
                      <Check className={cn("mr-2 h-4 w-4", selectedPacote === p ? "opacity-100" : "opacity-0")} />
                      {p}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Serviço combobox */}
        <Popover open={openServico} onOpenChange={setOpenServico}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={openServico} className="w-52 justify-between font-body">
              <div className="flex items-center gap-2 truncate">
                <Layers className="h-4 w-4 shrink-0" />
                <span className="truncate">{selectedServico === 'all' ? 'Todos os tipos' : selectedServico}</span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <Command>
              <CommandInput placeholder="Buscar tipo..." className="font-body" />
              <CommandList>
                <CommandEmpty className="font-body text-xs p-2">Nenhum tipo encontrado.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="all" onSelect={() => { setSelectedServico('all'); setOpenServico(false); }} className="font-body">
                    <Check className={cn("mr-2 h-4 w-4", selectedServico === 'all' ? "opacity-100" : "opacity-0")} />
                    Todos os tipos
                  </CommandItem>
                  {uniqueServicos.map(s => (
                    <CommandItem key={s} value={s} onSelect={() => { setSelectedServico(s); setOpenServico(false); }} className="font-body">
                      <Check className={cn("mr-2 h-4 w-4", selectedServico === s ? "opacity-100" : "opacity-0")} />
                      {s}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Group mode toggle */}
        <div className="flex items-center rounded-md border border-border overflow-hidden ml-auto">
          <button
            onClick={() => { setGroupMode('pacote'); setCollapsedGroups(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
              groupMode === 'pacote'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <FolderTree className="h-3.5 w-3.5" />
            Pacote
          </button>
          <button
            onClick={() => { setGroupMode('servico'); setCollapsedGroups(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${
              groupMode === 'servico'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Serviço
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Itens de Serviço</p>
            <p className="text-2xl font-bold font-heading">{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Avanço Base</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold font-heading">{avgBase.toFixed(1)}%</p>
              <Progress value={avgBase} className="flex-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Avanço Previsto</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold font-heading">{avgPrevisto.toFixed(1)}%</p>
              <Progress value={avgPrevisto} className="flex-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground font-body">Avanço Realizado</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold font-heading">{avgRealizado.toFixed(1)}%</p>
              <Progress value={avgRealizado} className="flex-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table grouped */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileBarChart className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-heading font-semibold text-muted-foreground">
              Nenhum item de EAP encontrado
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-1 font-body">
              Importe uma EAP em uma obra para gerar relatórios
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => {
            const groupAvg = group.items.length > 0
              ? group.items.reduce((s, i) => s + (i.avanco_realizado || 0), 0) / group.items.length
              : 0;
            const isCollapsed = collapsedGroups.has(group.label);
            return (
              <Card key={group.label}>
                <CardContent className="p-0">
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      {groupMode === 'pacote' ? (
                        <FolderTree className="h-4 w-4 text-accent" />
                      ) : (
                        <Layers className="h-4 w-4 text-accent" />
                      )}
                      <span className="font-heading font-semibold text-sm">{group.label}</span>
                      <Badge variant="secondary" className="text-[10px]">{group.items.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={groupAvg} className="w-20 h-1.5" />
                      <span className="text-xs font-body text-muted-foreground">{groupAvg.toFixed(1)}%</span>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-heading">Obra</TableHead>
                          <TableHead className="font-heading">Descrição</TableHead>
                          <TableHead className="font-heading">
                            {groupMode === 'pacote' ? 'Tipo Serviço' : 'Pacote'}
                          </TableHead>
                          <TableHead className="font-heading text-right">Base</TableHead>
                          <TableHead className="font-heading text-right">Previsto</TableHead>
                          <TableHead className="font-heading text-right">Realizado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="font-body text-xs">{obraMap[item.obra_id]?.nome || '—'}</TableCell>
                            <TableCell className="font-body text-sm">{item.descricao}</TableCell>
                            <TableCell>
                              {groupMode === 'pacote'
                                ? (item.lote ? <Badge variant="outline" className="text-[10px]">{item.lote}</Badge> : '—')
                                : (item.pacote ? <Badge variant="outline" className="text-[10px]">{item.pacote}</Badge> : '—')
                              }
                            </TableCell>
                            <TableCell className="text-right font-body text-sm">{(item.avanco_base || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-right font-body text-sm">{(item.avanco_previsto || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Progress value={item.avanco_realizado || 0} className="w-16 h-1.5" />
                                <span className="font-body text-sm font-medium">{(item.avanco_realizado || 0).toFixed(1)}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
