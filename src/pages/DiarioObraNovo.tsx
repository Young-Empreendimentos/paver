import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Loader2, Sun, Cloud, CloudSun, CloudRain, Snowflake,
  ChevronDown, ChevronRight, Check, Package, Layers, Search, Camera, Upload, X, Trash2,
  MapPin, Video, SkipForward, ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchObras, fetchEapItems, fetchPlantas, createDiario, createFotoLocalizada, uploadFile, EapItem, PlantaObra } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import CollapsibleClassification from '@/components/CollapsibleClassification';
import DxfParser from 'dxf-parser';
import { parseDxfToSvg, DxfSvgData } from '@/lib/dxfRenderer';
import { todayDateOnly } from '@/lib/dateOnly';

const climaOptions = [
  { value: 'ensolarado', label: 'Ensolarado', icon: Sun },
  { value: 'nublado', label: 'Nublado', icon: Cloud },
  { value: 'parcialmente_nublado', label: 'Parc. Nublado', icon: CloudSun },
  { value: 'chuvoso', label: 'Chuvoso', icon: CloudRain },
  { value: 'frio', label: 'Frio', icon: Snowflake },
];

type GroupMode = 'pacote' | 'servico';

interface AtividadeEntry {
  eap_item_id: string;
  quantidade_dia: number;
  avanco_percentual: number;
}

interface FotoDiario {
  file: File;
  preview: string;
  descricao: string;
  isVideo: boolean;
  // Pin location (optional)
  pinned: boolean;
  plantaId?: string;
  posX?: number;
  posY?: number;
}

interface EapNode {
  item: EapItem;
  children: EapNode[];
}

function DxfPinCanvas({
  plantaUrl, dxfData, dxfLoading, setDxfData, setDxfLoading, onPinPlace, tempPin, onDragPin,
}: {
  plantaUrl: string;
  dxfData: DxfSvgData | null;
  dxfLoading: boolean;
  setDxfData: (d: DxfSvgData | null) => void;
  setDxfLoading: (b: boolean) => void;
  onPinPlace: (e: React.MouseEvent<HTMLDivElement>) => void;
  tempPin?: { x: number; y: number } | null;
  onDragPin?: (x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [showLayers, setShowLayers] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setDxfLoading(true);
      setDxfData(null);
      try {
        const res = await fetch(plantaUrl);
        const text = await res.text();
        const parser = new DxfParser();
        const dxf = parser.parseSync(text);
        if (cancelled || !dxf) return;

        const parsed = parseDxfToSvg(dxf);
        setDxfData(parsed);
        setLayerVisibility(Object.fromEntries(parsed.layers.map(layer => [layer.name, layer.visible])));
      } catch {
        if (!cancelled) setDxfData(null);
      } finally {
        if (!cancelled) setDxfLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [plantaUrl, setDxfData, setDxfLoading]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      setCanvasSize({ width: node.clientWidth, height: node.clientHeight });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, [dxfData]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(10, Math.max(0.1, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.altKey) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) return;

    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      return;
    }

    onPinPlace({
      ...e,
      currentTarget: viewportRef.current,
      target: viewportRef.current,
    } as React.MouseEvent<HTMLDivElement>);
  }, [isPanning, onPinPlace]);

  if (dxfLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <span className="ml-2 text-xs text-muted-foreground font-body">Carregando DXF...</span>
      </div>
    );
  }

  if (!dxfData) {
    return <p className="text-xs text-destructive font-body text-center py-4">Erro ao carregar DXF</p>;
  }

  const { viewBox, pathsByLayer, layers } = dxfData;
  const visibleCount = layers.filter(l => layerVisibility[l.name] !== false).length;
  const aspectRatio = viewBox.width > 0 && viewBox.height > 0 ? viewBox.width / viewBox.height : 1;

  const fittedViewport = (() => {
    const { width, height } = canvasSize;
    if (!width || !height) return null;

    const containerRatio = width / height;
    if (containerRatio > aspectRatio) {
      const fittedHeight = height;
      const fittedWidth = fittedHeight * aspectRatio;
      return {
        width: fittedWidth,
        height: fittedHeight,
        left: (width - fittedWidth) / 2,
        top: 0,
      };
    }

    const fittedWidth = width;
    const fittedHeight = fittedWidth / aspectRatio;
    return {
      width: fittedWidth,
      height: fittedHeight,
      left: 0,
      top: (height - fittedHeight) / 2,
    };
  })();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.1, z / 1.25))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Slider className="w-24" min={10} max={500} step={10} value={[zoom * 100]} onValueChange={([v]) => setZoom(v / 100)} />
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(10, z * 1.25))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[10px] font-body text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
        {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant={showLayers ? 'default' : 'outline'}
          size="sm"
          className="ml-auto h-7 font-body text-[10px]"
          onClick={() => setShowLayers(!showLayers)}
        >
          <Layers className="mr-1 h-3 w-3" />
          Layers ({visibleCount}/{layers.length})
        </Button>
      </div>

      <div className="flex gap-2">
        {showLayers && (
          <div className="shrink-0 w-44 rounded-lg border border-border bg-background p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-heading font-semibold">Layers</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[9px]"
                  onClick={() => setLayerVisibility(Object.fromEntries(layers.map(l => [l.name, true])))}
                >
                  <Eye className="mr-0.5 h-2.5 w-2.5" />Todas
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[9px]"
                  onClick={() => setLayerVisibility(Object.fromEntries(layers.map(l => [l.name, false])))}
                >
                  <EyeOff className="mr-0.5 h-2.5 w-2.5" />Nenhuma
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[45vh]">
              <div className="space-y-0.5 pr-2">
                {layers.map(layer => (
                  <label key={layer.name} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/50">
                    <UiCheckbox
                      checked={layerVisibility[layer.name] !== false}
                      onCheckedChange={() => setLayerVisibility(prev => ({ ...prev, [layer.name]: !prev[layer.name] }))}
                      className="h-3 w-3"
                    />
                    <span className="h-2 w-2 shrink-0 rounded-full border border-border" style={{ backgroundColor: layer.color }} />
                    <span className="flex-1 truncate text-[10px] font-body">{layer.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden rounded-lg border border-border bg-muted/20"
          style={{ height: '60vh', minHeight: '420px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={e => e.preventDefault()}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              width: '100%',
              height: '100%',
              position: 'relative',
            }}
          >
            <div
              className={`relative h-full w-full ${!isPanning ? 'cursor-crosshair' : 'cursor-grabbing'}`}
              onClick={handleClick}
            >
              {fittedViewport && (
                <div
                  ref={viewportRef}
                  className="absolute overflow-hidden"
                  style={{
                    left: fittedViewport.left,
                    top: fittedViewport.top,
                    width: fittedViewport.width,
                    height: fittedViewport.height,
                  }}
                >
                  <svg
                    viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
                    className="block h-full w-full"
                    preserveAspectRatio="none"
                  >
                    {Array.from(pathsByLayer.entries()).map(([layerName, paths]) => {
                      if (layerVisibility[layerName] === false) return null;
                      const layerInfo = layers.find(l => l.name === layerName);
                      const color = layerInfo?.color || '#888';
                      return (
                        <g key={layerName}>
                          {paths.map((d, i) => (
                            <path key={i} d={d} fill="none" stroke={color} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                          ))}
                        </g>
                      );
                    })}
                  </svg>

                  {tempPin && (
                    <div
                      className="absolute z-20 cursor-grab active:cursor-grabbing"
                      style={{
                        left: `${tempPin.x}%`,
                        top: `${tempPin.y}%`,
                        transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const parent = viewportRef.current;
                        if (!parent) return;

                        const onMove = (ev: MouseEvent) => {
                          const rect = parent.getBoundingClientRect();
                          const nx = ((ev.clientX - rect.left) / rect.width) * 100;
                          const ny = ((ev.clientY - rect.top) / rect.height) * 100;
                          onDragPin?.(Math.min(100, Math.max(0, nx)), Math.min(100, Math.max(0, ny)));
                        };

                        const onUp = () => {
                          document.removeEventListener('mousemove', onMove);
                          document.removeEventListener('mouseup', onUp);
                        };

                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                      }}
                    >
                      <MapPin className="h-6 w-6 fill-accent/30 text-accent drop-shadow-md" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground font-body">Alt+arrastar para mover · Scroll para zoom</p>
    </div>
  );
}

export default function DiarioObraNovoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const obraIdFromUrl = searchParams.get('obra') || '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedObraId, setSelectedObraId] = useState(obraIdFromUrl);
  const [data, setData] = useState(todayDateOnly);
  const [climaManha, setClimaManha] = useState('ensolarado');
  const [climaTarde, setClimaTarde] = useState('ensolarado');
  const [maoDeObra, setMaoDeObra] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [atividades, setAtividades] = useState<Map<string, AtividadeEntry>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set());
  const [groupMode, setGroupMode] = useState<GroupMode>('pacote');
  const [filterText, setFilterText] = useState('');
  const [fotos, setFotos] = useState<FotoDiario[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pin modal state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinQueue, setPinQueue] = useState<number[]>([]);
  const [currentPinIndex, setCurrentPinIndex] = useState(0);
  const [selectedPlantaId, setSelectedPlantaId] = useState<string>('');
  const [skipConfirming, setSkipConfirming] = useState(false);
  const [skipCountdown, setSkipCountdown] = useState(10);
  const skipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dxfData, setDxfData] = useState<DxfSvgData | null>(null);
  const [dxfLoading, setDxfLoading] = useState(false);

  const { data: obras = [] } = useQuery({ queryKey: ['obras'], queryFn: fetchObras });
  const { data: eapItems = [] } = useQuery({
    queryKey: ['eap', selectedObraId],
    queryFn: () => fetchEapItems(selectedObraId),
    enabled: !!selectedObraId,
  });
  const { data: plantas = [] } = useQuery({
    queryKey: ['plantas', selectedObraId],
    queryFn: () => fetchPlantas(selectedObraId),
    enabled: !!selectedObraId,
  });

  const eapItensOnly = useMemo(() => eapItems.filter(i => i.tipo === 'item'), [eapItems]);

  // Build parent map for hierarchy breadcrumb
  const parentMap = useMemo(() => {
    const map = new Map<string, EapItem>();
    for (const item of eapItems) map.set(item.id, item);
    return map;
  }, [eapItems]);

  const getHierarchyPath = (item: EapItem): EapItem[] => {
    const path: EapItem[] = [];
    let current = item.parent_id ? parentMap.get(item.parent_id) : undefined;
    while (current) {
      path.unshift(current);
      current = current.parent_id ? parentMap.get(current.parent_id) : undefined;
    }
    return path;
  };

  // Group items by pacote or servico (lote)
  const groupedItems = useMemo(() => {
    const groups = new Map<string, EapItem[]>();
    for (const item of eapItensOnly) {
      const key = groupMode === 'pacote' ? (item.pacote || 'Sem pacote') : (item.lote || 'Sem serviço');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [eapItensOnly, groupMode]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    if (!filterText.trim()) return groupedItems;
    const lower = filterText.toLowerCase();
    return groupedItems
      .map(([key, items]) => {
        const keyMatch = key.toLowerCase().includes(lower);
        const filteredItems = items.filter(item => {
          const descMatch = item.descricao.toLowerCase().includes(lower);
          const codeMatch = (item.codigo || '').toLowerCase().includes(lower);
          const pathMatch = getHierarchyPath(item).some(p => p.descricao.toLowerCase().includes(lower));
          return descMatch || codeMatch || pathMatch;
        });
        if (keyMatch) return [key, items] as [string, EapItem[]];
        if (filteredItems.length > 0) return [key, filteredItems] as [string, EapItem[]];
        return null;
      })
      .filter(Boolean) as [string, EapItem[]][];
  }, [groupedItems, filterText]);

  // Start with all groups collapsed (no auto-expand)

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSubGroup = (key: string) => {
    setExpandedSubGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleItem = (item: EapItem) => {
    setAtividades(prev => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, { eap_item_id: item.id, quantidade_dia: 0, avanco_percentual: item.avanco_realizado || 0 });
      }
      return next;
    });
  };

  const updateQuantidadeDia = (item: EapItem, qtdDia: number) => {
    const totalQtd = item.quantidade || 0;
    const currentRealized = item.avanco_realizado || 0;
    const currentQtdRealized = totalQtd * (currentRealized / 100);
    const restante = Math.max(0, Math.round((totalQtd - currentQtdRealized) * 100) / 100);
    let capped = Math.max(0, qtdDia);
    if (totalQtd > 0 && capped > restante) {
      capped = restante;
      toast({
        title: 'Quantidade limitada ao planejado',
        description: `Restam apenas ${restante} ${item.unidade || 'un'} para este item.`,
        variant: 'destructive',
      });
    }
    const newQtdRealized = currentQtdRealized + capped;
    const newPercent = totalQtd > 0
      ? Math.min(100, Math.round((newQtdRealized / totalQtd) * 10000) / 100)
      : currentRealized;
    setAtividades(prev => {
      const next = new Map(prev);
      next.set(item.id, { eap_item_id: item.id, quantidade_dia: capped, avanco_percentual: newPercent });
      return next;
    });
  };

  const updatePercentual = (item: EapItem, newPercent: number) => {
    const totalQtd = item.quantidade || 0;
    const currentRealized = item.avanco_realizado || 0;
    const cappedPercent = Math.min(100, Math.max(0, newPercent));
    const currentQtdRealized = totalQtd * (currentRealized / 100);
    const newQtdRealized = totalQtd * (cappedPercent / 100);
    const qtdDia = Math.max(0, Math.round((newQtdRealized - currentQtdRealized) * 100) / 100);
    if (newPercent > 100) {
      toast({
        title: 'Percentual limitado a 100%',
        description: 'Não é possível ultrapassar o total planejado.',
        variant: 'destructive',
      });
    }
    setAtividades(prev => {
      const next = new Map(prev);
      next.set(item.id, { eap_item_id: item.id, quantidade_dia: qtdDia, avanco_percentual: cappedPercent });
      return next;
    });
  };

  // Media handlers (photos + videos)
  const handleAddFotos = (files: FileList | null) => {
    if (!files) return;
    const newFotos: FotoDiario[] = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      descricao: '',
      isVideo: file.type.startsWith('video/'),
      pinned: false,
    }));
    const startIndex = fotos.length;
    setFotos(prev => [...prev, ...newFotos]);

    // If there are plantas available, auto-open pinning modal
    if (plantas.length > 0 && newFotos.length > 0) {
      const indices = newFotos.map((_, i) => startIndex + i);
      setPinQueue(indices);
      setCurrentPinIndex(0);
      if (!selectedPlantaId && plantas.length > 0) {
        setSelectedPlantaId(plantas[0].id);
      }
      setPinModalOpen(true);
    }
  };

  const removeFoto = (index: number) => {
    setFotos(prev => { const next = [...prev]; URL.revokeObjectURL(next[index].preview); next.splice(index, 1); return next; });
  };
  const updateFotoDescricao = (index: number, descricao: string) => {
    setFotos(prev => prev.map((f, i) => i === index ? { ...f, descricao } : f));
  };

  // Temporary pin position (before confirming)
  const [tempPin, setTempPin] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingPin, setIsDraggingPin] = useState(false);

  // Pin placement handler - now just places a temporary pin
  const handlePinPlace = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (pinQueue.length === 0) return;
    // Cancel any active skip confirmation
    setSkipConfirming(false);
    if (skipTimerRef.current) clearInterval(skipTimerRef.current);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setTempPin({ x, y });
  }, [pinQueue, currentPinIndex, selectedPlantaId]);

  // Confirm the temporary pin placement
  const handleConfirmPin = useCallback(() => {
    if (!tempPin || pinQueue.length === 0) return;
    const fotoIndex = pinQueue[currentPinIndex];

    setFotos(prev => prev.map((f, i) =>
      i === fotoIndex ? { ...f, pinned: true, plantaId: selectedPlantaId, posX: tempPin.x, posY: tempPin.y } : f
    ));
    setTempPin(null);

    // Move to next in queue
    if (currentPinIndex < pinQueue.length - 1) {
      setCurrentPinIndex(prev => prev + 1);
    } else {
      setPinModalOpen(false);
      setPinQueue([]);
      setCurrentPinIndex(0);
    }
  }, [pinQueue, currentPinIndex, selectedPlantaId, tempPin]);

  const startSkipConfirmation = () => {
    setSkipConfirming(true);
    setSkipCountdown(10);
    if (skipTimerRef.current) clearInterval(skipTimerRef.current);
    skipTimerRef.current = setInterval(() => {
      setSkipCountdown(prev => {
        if (prev <= 1) {
          if (skipTimerRef.current) clearInterval(skipTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSkipConfirmation = () => {
    setSkipConfirming(false);
    if (skipTimerRef.current) clearInterval(skipTimerRef.current);
  };

  const handleSkipPin = () => {
    setSkipConfirming(false);
    setTempPin(null);
    if (skipTimerRef.current) clearInterval(skipTimerRef.current);
    if (currentPinIndex < pinQueue.length - 1) {
      setCurrentPinIndex(prev => prev + 1);
    } else {
      setPinModalOpen(false);
      setPinQueue([]);
      setCurrentPinIndex(0);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (skipTimerRef.current) clearInterval(skipTimerRef.current); };
  }, []);

  const selectedCount = atividades.size;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const atividadesArr = Array.from(atividades.values()).filter(a => a.quantidade_dia > 0 || a.avanco_percentual > 0);
      const fotoUrls: string[] = [];

      // Upload all media files
      const uploadedFotos: { url: string; foto: FotoDiario }[] = [];
      for (const foto of fotos) {
        const ext = foto.file.name.split('.').pop() || 'jpg';
        const path = `diarios/${selectedObraId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const url = await uploadFile('paver-fotos', path, foto.file);
        fotoUrls.push(url);
        uploadedFotos.push({ url, foto });
      }

      const diario = await createDiario({
        obra_id: selectedObraId, data, clima: climaManha, clima_manha: climaManha, clima_tarde: climaTarde,
        mao_de_obra: maoDeObra, fotos: fotoUrls.length > 0 ? fotoUrls : null,
        atividades: atividadesArr.length > 0
          ? atividadesArr.map(a => { const item = eapItensOnly.find(i => i.id === a.eap_item_id); return `${item?.descricao || 'Item'}: ${a.avanco_percentual}%`; }).join('; ')
          : 'Sem atividades registradas',
        observacoes: observacoes || undefined, created_by: user!.id,
      } as any);

      // Create paver_fotos_localizadas for pinned files
      for (const { url, foto } of uploadedFotos) {
        if (foto.pinned && foto.plantaId && foto.posX != null && foto.posY != null) {
          await createFotoLocalizada({
            planta_id: foto.plantaId,
            obra_id: selectedObraId,
            foto_url: url,
            descricao: foto.descricao || undefined,
            pos_x: foto.posX,
            pos_y: foto.posY,
            diario_id: diario.id,
            created_by: user!.id,
          });
        }
      }

      if (atividadesArr.length > 0) {
        const { error } = await supabase.from('paver_diario_atividades').insert(atividadesArr.map(a => ({
          diario_id: diario.id, eap_item_id: a.eap_item_id, avanco_percentual: a.avanco_percentual, quantidade_dia: a.quantidade_dia,
        })));
        if (error) throw error;

        // Update data_inicio_real / data_fim_real (avanco_realizado is computed dynamically)
        for (const a of atividadesArr) {
          const item = eapItensOnly.find(i => i.id === a.eap_item_id);
          const totalQtd = item?.quantidade || 0;

          const { data: allMeasurements } = await supabase
            .from('paver_diario_atividades')
            .select('quantidade_dia')
            .eq('eap_item_id', a.eap_item_id);

          const sumQtdDia = (allMeasurements || []).reduce((sum: number, m: any) => sum + (m.quantidade_dia || 0), 0);
          const newAvanco = totalQtd > 0
            ? Math.min(100, Math.round((sumQtdDia / totalQtd) * 10000) / 100)
            : a.avanco_percentual;

          const updateFields: Record<string, any> = {};

          // Auto-set data_inicio_real on first measurement
          if (item && !item.data_inicio_real && newAvanco > 0) {
            updateFields.data_inicio_real = data;
          }

          // Auto-set data_fim_real when reaching 100%
          if (newAvanco >= 100) {
            updateFields.data_fim_real = data;
          }

          if (Object.keys(updateFields).length > 0) {
            const { error: updErr } = await supabase.from('paver_eap_items').update(updateFields).eq('id', a.eap_item_id);
            if (updErr) console.error('Failed to update EAP item:', updErr);
          }
        }
      }
      return diario;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios'] });
      queryClient.invalidateQueries({ queryKey: ['diario-atividades'] });
      queryClient.invalidateQueries({ queryKey: ['eap'] });
      queryClient.invalidateQueries({ queryKey: ['eap-items-balance'] });
      queryClient.invalidateQueries({ queryKey: ['fotos-localizadas'] });
      toast({ title: 'Diário registrado com sucesso!' });
      navigate('/diario-obra');
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);
  const handleSubmit = () => saveMutation.mutate();

  // Get the current planta object for the pin modal
  const currentPlanta = plantas.find(p => p.id === selectedPlantaId);

  // Render a single EAP item row with hierarchy breadcrumb
  const renderItemRow = (item: EapItem, hideClassification = false) => {
    const selected = atividades.get(item.id);
    const currentPercent = item.avanco_realizado || 0;
    const totalQtd = item.quantidade || 0;
    const currentQtdRealized = totalQtd * (currentPercent / 100);
    const hierarchy = getHierarchyPath(item);

    return (
      <div
        key={item.id}
        className={`px-3 py-2 transition-colors rounded-md ${selected ? 'bg-accent/5' : 'hover:bg-muted/20'}`}
      >
        <div className="flex items-center gap-3">
          <Checkbox checked={!!selected} onCheckedChange={() => toggleItem(item)} />
          <div className="flex-1 min-w-0">
            {hierarchy.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mb-0.5">
                {hierarchy.map((parent, idx) => (
                  <span key={parent.id} className="text-[10px] text-muted-foreground/70 font-body flex items-center gap-0.5">
                    {parent.codigo && <span className="font-mono text-accent/60">{parent.codigo}</span>}
                    <span className="truncate max-w-[150px]">{parent.descricao}</span>
                    {idx < hierarchy.length - 1 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              {item.codigo && <span className="text-xs text-muted-foreground font-mono shrink-0">{item.codigo}</span>}
              <div className="min-w-0">
                <span className="text-sm font-body text-foreground truncate block">
                  {item.descricao}
                  {!hideClassification && item.classificacao_adicional && <CollapsibleClassification text={item.classificacao_adicional} />}
                </span>
                {groupMode === 'pacote' && item.lote && (
                  <span className="text-[10px] font-body italic text-muted-foreground/60 truncate block">{item.lote}</span>
                )}
                {groupMode === 'servico' && item.pacote && (
                  <span className="text-[10px] font-body italic text-muted-foreground/60 truncate block">{item.pacote}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-xs text-muted-foreground font-body block">Atual: {currentPercent.toFixed(1)}%</span>
              {totalQtd > 0 && (
                <span className="text-[10px] text-muted-foreground/70 font-body">
                  {currentQtdRealized.toFixed(1)} / {totalQtd} {item.unidade || 'un'}
                </span>
              )}
            </div>
            <Progress value={currentPercent} className="w-16 h-2" />
          </div>
        </div>
        {selected && (
          <div className="mt-2 ml-8 flex items-center gap-4 flex-wrap">
            {totalQtd > 0 && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-body text-muted-foreground whitespace-nowrap">Qtd. do dia:</Label>
                <Input type="number" min={0} step="any" value={selected.quantidade_dia || ''} onChange={e => updateQuantidadeDia(item, Number(e.target.value) || 0)} className="w-20 h-7 text-xs font-body text-center" />
                <span className="text-xs text-muted-foreground font-body">{item.unidade || 'un'}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs font-body text-muted-foreground whitespace-nowrap">Novo %:</Label>
              <Input type="number" min={0} max={100} step="any" value={selected.avanco_percentual || ''} onChange={e => updatePercentual(item, Number(e.target.value) || 0)} className="w-20 h-7 text-xs font-body text-center" />
              <span className="text-xs text-muted-foreground font-body">%</span>
            </div>
            {selected.avanco_percentual > currentPercent && (
              <Badge variant="secondary" className="text-[10px] font-body">
                <Check className="h-3 w-3 mr-0.5" />+{(selected.avanco_percentual - currentPercent).toFixed(1)}%
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => step === 1 ? navigate('/diario-obra') : handleBack()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-heading font-bold text-foreground">Novo Diário de Obra</h1>
          <p className="text-sm text-muted-foreground font-body">
            {step === 1 ? 'Etapa 1 — Registre as atividades executadas no dia' : 'Etapa 2 — Registro fotográfico do dia'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${step === 1 ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
          <div className={`h-2.5 w-2.5 rounded-full ${step === 2 ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
        </div>
      </div>

      {step === 1 ? (
        <div className="space-y-6">
          {/* Obra + Data */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="font-body">Obra</Label>
              <Select value={selectedObraId} onValueChange={v => { setSelectedObraId(v); setAtividades(new Map()); }}>
                <SelectTrigger className="font-body"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                <SelectContent>
                  {obras.map(o => <SelectItem key={o.id} value={o.id} className="font-body">{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-body">Data</Label>
              <Input
                type="date"
                value={data}
                onChange={e => {
                  const novaData = e.target.value;
                  const hoje = todayDateOnly();
                  if (novaData && novaData !== hoje) {
                    const [y, m, d] = novaData.split('-');
                    const ok = window.confirm(
                      `Você está lançando este diário para ${d}/${m}/${y}, diferente de hoje (${hoje.split('-').reverse().join('/')}). Confirmar?`
                    );
                    if (!ok) return;
                  }
                  setData(novaData);
                }}
                required
                className="font-body"
              />
            </div>

          </div>

          {/* Clima */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-body">Clima — Manhã</Label>
              <Select value={climaManha} onValueChange={setClimaManha}>
                <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                <SelectContent>{climaOptions.map(c => <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-body">Clima — Tarde</Label>
              <Select value={climaTarde} onValueChange={setClimaTarde}>
                <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                <SelectContent>{climaOptions.map(c => <SelectItem key={c.value} value={c.value} className="font-body">{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label className="font-body">Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} className="font-body" placeholder="Observações gerais sobre o dia..." />
          </div>

          {/* Equipes */}
          <div className="space-y-2">
            <Label className="font-body">Equipes / Mão de Obra</Label>
            <Textarea value={maoDeObra} onChange={e => setMaoDeObra(e.target.value)} rows={3} placeholder="Ex: 2 pedreiros, 1 encanador, 3 serventes..." className="font-body" />
          </div>

          {/* EAP Tree */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="font-heading text-base">Atividades Executadas (EAP)</CardTitle>
                <div className="flex items-center gap-2">
                  {selectedCount > 0 && <Badge variant="secondary" className="font-body">{selectedCount} atividade(s) selecionada(s)</Badge>}
                  <Button type="button" variant="outline" size="sm" onClick={() => navigate('/diario-obra')} className="font-body">Cancelar</Button>
                  <Button type="button" size="sm" onClick={handleNext} disabled={!selectedObraId} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                    Próximo: Fotos <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-body">
                Selecione os itens executados. Informe a quantidade do dia — o percentual é calculado automaticamente.
              </p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <button type="button" onClick={() => { setGroupMode('pacote'); setFilterText(''); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${groupMode === 'pacote' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                    <Package className="h-3.5 w-3.5" />Pacote
                  </button>
                  <button type="button" onClick={() => { setGroupMode('servico'); setFilterText(''); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors ${groupMode === 'servico' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                    <Layers className="h-3.5 w-3.5" />Serviço
                  </button>
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={filterText} onChange={e => setFilterText(e.target.value)}
                    placeholder="Filtrar por código, descrição ou grupo..." className="pl-8 h-8 text-xs font-body" />
                  {filterText && (
                    <button type="button" onClick={() => setFilterText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {!selectedObraId ? (
                <p className="text-sm text-muted-foreground font-body italic py-4 text-center">Selecione uma obra para ver os itens da EAP.</p>
              ) : eapItems.length === 0 ? (
                <p className="text-sm text-muted-foreground font-body italic py-4 text-center">Nenhum item de EAP cadastrado para esta obra.</p>
              ) : filteredGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground font-body italic py-4 text-center">Nenhum resultado para "{filterText}".</p>
              ) : (
                filteredGroups.map(([groupKey, items]) => {
                  const isExpanded = expandedGroups.has(groupKey);
                  const selInGroup = items.filter(i => atividades.has(i.id)).length;
                  return (
                    <Collapsible key={groupKey} open={isExpanded} onOpenChange={() => toggleGroup(groupKey)}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-left"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          }
                          {groupMode === 'pacote'
                            ? <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          }
                          <span className="flex-1 text-sm font-heading font-semibold truncate">{groupKey}</span>
                          <Badge variant="outline" className="text-[10px] font-body shrink-0">{items.length} itens</Badge>
                          {selInGroup > 0 && (
                            <Badge className="text-[10px] font-body bg-accent text-accent-foreground shrink-0">{selInGroup} sel.</Badge>
                          )}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-l-2 border-border ml-4 space-y-0.5 mt-0.5">
                          {(() => {
                            // Sub-group items by classificacao_adicional
                            const subGroups = new Map<string, EapItem[]>();
                            for (const item of items) {
                              const subKey = item.classificacao_adicional || '';
                              if (!subGroups.has(subKey)) subGroups.set(subKey, []);
                              subGroups.get(subKey)!.push(item);
                            }
                            // Only render flat if there's a single group with no classificacao
                            if (subGroups.size === 1 && subGroups.has('')) {
                              return items.map(item => renderItemRow(item, false));
                            }
                            return [...subGroups.entries()]
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([subKey, subItems]) => {
                                const subId = `${groupKey}::${subKey}`;
                                const isSubExpanded = expandedSubGroups.has(subId);
                                const selInSub = subItems.filter(i => atividades.has(i.id)).length;
                                if (!subKey) {
                                  return <div key="__none__" className="space-y-0.5">{subItems.map(item => renderItemRow(item, true))}</div>;
                                }
                                return (
                                  <Collapsible key={subId} open={isSubExpanded} onOpenChange={() => toggleSubGroup(subId)}>
                                    <CollapsibleTrigger asChild>
                                      <button type="button" className="flex items-center gap-2 w-full px-3 py-1.5 ml-2 rounded-md hover:bg-muted/30 transition-colors text-left">
                                        {isSubExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
                                        <span className="text-[11px] font-body font-medium text-muted-foreground/80 italic flex-1 truncate">{subKey}</span>
                                        <Badge variant="outline" className="text-[9px] font-body shrink-0">{subItems.length}</Badge>
                                        {selInSub > 0 && <Badge className="text-[9px] font-body bg-accent text-accent-foreground shrink-0">{selInSub}</Badge>}
                                      </button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="border-l border-border/50 ml-5 space-y-0.5">
                                        {subItems.map(item => renderItemRow(item, true))}
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              });
                          })()}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ═══ STEP 2: Photos & Videos ═══ */
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Camera className="h-5 w-5 text-accent" />Registro Fotográfico e Vídeos
                </CardTitle>
                <Badge variant="secondary" className="font-body">{fotos.length} arquivo(s)</Badge>
              </div>
              <p className="text-xs text-muted-foreground font-body">
                Adicione fotos e vídeos do dia.
                {plantas.length > 0 && ' Ao selecionar, você poderá marcar a localização na planta da obra.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-accent/50 hover:bg-muted/30 transition-colors">
                <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-body text-muted-foreground">Clique para adicionar fotos e vídeos</p>
                <p className="text-xs font-body text-muted-foreground/60 mt-1">JPG, PNG, WEBP, MP4, MOV</p>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { handleAddFotos(e.target.files); e.target.value = ''; }} />
              </div>
              {fotos.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {fotos.map((foto, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden group">
                      <div className="aspect-video bg-muted relative">
                        {foto.isVideo ? (
                          <video src={foto.preview} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={foto.preview} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                        )}
                        <button type="button" onClick={() => removeFoto(index)}
                          className="absolute top-2 right-2 h-7 w-7 bg-destructive/90 text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {foto.isVideo && (
                          <div className="absolute top-2 left-2">
                            <Badge variant="secondary" className="text-[9px] font-body"><Video className="h-3 w-3 mr-0.5" />Vídeo</Badge>
                          </div>
                        )}
                        {foto.pinned && (
                          <div className="absolute bottom-2 left-2">
                            <Badge className="text-[9px] font-body bg-accent text-accent-foreground">
                              <MapPin className="h-3 w-3 mr-0.5" />Localizado
                            </Badge>
                          </div>
                        )}
                        {!foto.pinned && plantas.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPinQueue([index]);
                              setCurrentPinIndex(0);
                              if (!selectedPlantaId && plantas.length > 0) setSelectedPlantaId(plantas[0].id);
                              setPinModalOpen(true);
                            }}
                            className="absolute bottom-2 left-2"
                          >
                            <Badge variant="outline" className="text-[9px] font-body bg-background/80 hover:bg-background cursor-pointer">
                              <MapPin className="h-3 w-3 mr-0.5" />Marcar no mapa
                            </Badge>
                          </button>
                        )}
                      </div>
                      <div className="p-2">
                        <Input value={foto.descricao} onChange={e => updateFotoDescricao(index, e.target.value)} placeholder="Descrição (opcional)" className="text-xs font-body h-7" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm text-muted-foreground">Resumo das atividades</CardTitle>
            </CardHeader>
            <CardContent>
              {atividades.size === 0 ? (
                <p className="text-xs text-muted-foreground font-body italic">Nenhuma atividade selecionada.</p>
              ) : (
                <div className="space-y-2">
                  {Array.from(atividades.values()).map(a => {
                    const item = eapItensOnly.find(i => i.id === a.eap_item_id);
                    return (
                      <div key={a.eap_item_id} className="border border-border/50 rounded-md p-2 space-y-1">
                        <div className="flex items-center justify-between text-xs font-body">
                          <span className="truncate text-foreground">
                            {item?.codigo && <span className="font-mono text-muted-foreground mr-1">{item.codigo}</span>}
                            {item?.descricao || 'Item'}
                            {item?.classificacao_adicional && <CollapsibleClassification text={item.classificacao_adicional} />}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {a.quantidade_dia > 0 && <span className="text-muted-foreground">+{a.quantidade_dia} {item?.unidade || 'un'}</span>}
                            <Badge variant="secondary" className="text-[10px]">{a.avanco_percentual.toFixed(1)}%</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {item?.pacote && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-body">
                              <Package className="h-3 w-3" />
                              <span className="font-medium">Pacote:</span> {item.pacote}
                            </span>
                          )}
                          {item?.lote && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-body">
                              <Layers className="h-3 w-3" />
                              <span className="font-medium">Serviço:</span> {item.lote}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between pb-8">
            <Button type="button" variant="outline" onClick={handleBack} className="font-body">
              <ArrowLeft className="h-4 w-4 mr-2" />Voltar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!selectedObraId || saveMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Registrar Diário
            </Button>
          </div>
        </div>
      )}

      {/* ═══ PIN MODAL ═══ */}
      <Dialog open={pinModalOpen} onOpenChange={() => { /* prevent close by clicking outside */ }}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] !flex !flex-col overflow-hidden p-4 [&>button:last-child]:hidden" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-heading flex items-center gap-2">
              <MapPin className="h-5 w-5 text-accent" />
              Marcar localização na planta
            </DialogTitle>
          </DialogHeader>

          {pinQueue.length > 0 && fotos[pinQueue[currentPinIndex]] && (
            <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              {/* Current file preview */}
              <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
                <div className="h-16 w-16 rounded-md overflow-hidden bg-muted shrink-0">
                  {fotos[pinQueue[currentPinIndex]].isVideo ? (
                    <video src={fotos[pinQueue[currentPinIndex]].preview} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={fotos[pinQueue[currentPinIndex]].preview} className="w-full h-full object-cover" alt="" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body font-medium text-foreground truncate">
                    {fotos[pinQueue[currentPinIndex]].file.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-body">
                    {fotos[pinQueue[currentPinIndex]].isVideo ? 'Vídeo' : 'Foto'} {currentPinIndex + 1} de {pinQueue.length}
                  </p>
                  {fotos[pinQueue[currentPinIndex]].pinned && (
                    <Badge className="text-[9px] font-body bg-accent text-accent-foreground mt-1">
                      <MapPin className="h-3 w-3 mr-0.5" />Localizado
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {pinQueue.length > 1 && (
                    <span className="text-xs text-muted-foreground font-body">{currentPinIndex + 1}/{pinQueue.length}</span>
                  )}
                </div>
              </div>

              {/* Planta selector (if multiple) */}
              {plantas.length > 1 && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-body text-muted-foreground whitespace-nowrap">Planta:</Label>
                  <Select value={selectedPlantaId} onValueChange={setSelectedPlantaId}>
                    <SelectTrigger className="font-body text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plantas.map(p => (
                        <SelectItem key={p.id} value={p.id} className="font-body text-xs">{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Plant image with crosshair */}
              {currentPlanta && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-body flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Clique na planta para marcar · Arraste o pin para ajustar
                  </p>
                  {currentPlanta.imagem_url.match(/\.pdf(\?|$)/i) ? (
                    <div className="bg-muted/50 rounded-lg p-8 text-center">
                      <p className="text-sm text-muted-foreground font-body">
                        Esta planta é um arquivo PDF.
                      </p>
                      <p className="text-xs text-muted-foreground/70 font-body mt-1">
                        A marcação de localização está disponível apenas para plantas em formato de imagem (JPG, PNG) ou DXF.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSkipPin}
                        className="font-body text-xs mt-3"
                      >
                        <SkipForward className="h-3.5 w-3.5 mr-1" />
                        Continuar sem localização
                      </Button>
                    </div>
                  ) : currentPlanta.imagem_url.match(/\.dxf(\?|$)/i) ? (
                    <DxfPinCanvas
                      plantaUrl={currentPlanta.imagem_url}
                      dxfData={dxfData}
                      dxfLoading={dxfLoading}
                      setDxfData={setDxfData}
                      setDxfLoading={setDxfLoading}
                      onPinPlace={handlePinPlace}
                      tempPin={tempPin}
                      onDragPin={(x, y) => setTempPin({ x, y })}
                    />
                  ) : (
                    <div
                      className="relative w-full border border-border rounded-lg overflow-hidden cursor-crosshair"
                      onClick={handlePinPlace}
                    >
                      <img
                        src={currentPlanta.imagem_url}
                        alt={currentPlanta.nome}
                        className="w-full block"
                        draggable={false}
                      />
                      {/* Show temporary pin */}
                      {tempPin && (
                        <div
                          className="absolute w-6 h-6 -ml-3 -mt-6 z-20 cursor-grab active:cursor-grabbing"
                          style={{
                            left: `${tempPin.x}%`,
                            top: `${tempPin.y}%`,
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const parent = e.currentTarget.parentElement;
                            if (!parent) return;
                            const onMove = (ev: MouseEvent) => {
                              const rect = parent.getBoundingClientRect();
                              const nx = ((ev.clientX - rect.left) / rect.width) * 100;
                              const ny = ((ev.clientY - rect.top) / rect.height) * 100;
                              setTempPin({ x: nx, y: ny });
                            };
                            const onUp = () => {
                              document.removeEventListener('mousemove', onMove);
                              document.removeEventListener('mouseup', onUp);
                            };
                            document.addEventListener('mousemove', onMove);
                            document.addEventListener('mouseup', onUp);
                          }}
                        >
                          <MapPin className="h-6 w-6 text-accent drop-shadow-md fill-accent/30" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Skip confirmation annoy box */}
              {skipConfirming && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-body font-medium text-foreground">
                    Tem certeza que não quer marcar a localização?
                  </p>
                  <p className="text-xs text-muted-foreground font-body">
                    Fotos com localização são muito mais úteis para o acompanhamento da obra.
                  </p>
                  <div className="space-y-1.5">
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-destructive/50 transition-all duration-1000 ease-linear rounded-full"
                        style={{ width: `${(skipCountdown / 10) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 font-body text-center">
                      {skipCountdown > 0 ? `${skipCountdown}s` : 'Pronto'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={cancelSkipConfirmation}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 font-body text-xs flex-1"
                    >
                      <MapPin className="h-3.5 w-3.5 mr-1" />Voltar e marcar localização
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSkipPin}
                      disabled={skipCountdown > 0}
                      className="font-body text-muted-foreground text-xs"
                    >
                      <SkipForward className="h-3.5 w-3.5 mr-1" />Pular
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                {!skipConfirming ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={startSkipConfirmation}
                    className="font-body text-muted-foreground text-xs"
                  >
                    <SkipForward className="h-3.5 w-3.5 mr-1" />
                    Pular — sem localização
                  </Button>
                ) : <div />}
                <div className="flex items-center gap-2">
                  {currentPinIndex > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setTempPin(null); setCurrentPinIndex(prev => prev - 1); }}
                      className="font-body text-xs"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />Anterior
                    </Button>
                  )}
                  {tempPin && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConfirmPin}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 font-body text-xs"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />Confirmar localização
                    </Button>
                  )}
                  {fotos[pinQueue[currentPinIndex]]?.pinned && !tempPin && currentPinIndex < pinQueue.length - 1 && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => { setTempPin(null); setCurrentPinIndex(prev => prev + 1); }}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 font-body text-xs"
                    >
                      Próximo <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  )}
                  {fotos[pinQueue[currentPinIndex]]?.pinned && !tempPin && currentPinIndex === pinQueue.length - 1 && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => { setPinModalOpen(false); setPinQueue([]); setCurrentPinIndex(0); }}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 font-body text-xs"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />Concluir
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
