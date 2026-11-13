import { useRef, useState } from 'react';
import { Upload, FileText, Loader2, MessageSquarePlus, MessageSquareText, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { SstDocumento, SstStatus, SstStatusValor } from '@/services/api';
import { SST_STATUS_META, SST_STATUS_OPCOES, freqCurta } from '@/lib/sst';

interface SstDocRowProps {
  doc: SstDocumento;
  status?: SstStatus;
  busy?: boolean;
  showFreq?: boolean;
  onStatus: (valor: SstStatusValor) => void;
  onUpload: (file: File) => void;
  onOpenFile: (path: string) => void;
  onObservacao: (texto: string) => void;
  onLink: (url: string) => void;
}

export function SstDocRow({
  doc, status, busy, showFreq, onStatus, onUpload, onOpenFile, onObservacao, onLink,
}: SstDocRowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const valor: SstStatusValor = status?.status ?? 'pendente';
  const meta = SST_STATUS_META[valor];
  const [obs, setObs] = useState(status?.observacao ?? '');
  const [linkInput, setLinkInput] = useState(status?.link_url ?? '');
  const temObs = !!status?.observacao?.trim();

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-0">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-body text-sm truncate">{doc.nome}</span>
          {showFreq && <Badge variant="outline" className="text-[10px] font-body">{freqCurta(doc.frequencia)}</Badge>}
          {!doc.obrigatorio && <Badge variant="secondary" className="text-[10px] font-body">opcional</Badge>}
        </div>
        {status?.arquivo_nome && (
          <button
            type="button"
            onClick={() => status.arquivo_path && onOpenFile(status.arquivo_path)}
            className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground font-body hover:underline max-w-full"
          >
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{status.arquivo_nome}</span>
          </button>
        )}
        {status?.link_url && (
          <button
            type="button"
            onClick={() => window.open(status.link_url!, '_blank', 'noopener')}
            className="mt-0.5 flex items-center gap-1 text-[11px] text-accent font-body hover:underline max-w-full"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">Abrir link</span>
          </button>
        )}
      </div>

      {/* Observação */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            title={temObs ? status?.observacao ?? '' : 'Adicionar observação'}
          >
            {temObs
              ? <MessageSquareText className="h-4 w-4 text-accent" />
              : <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2" align="end">
          <p className="text-xs font-body text-muted-foreground">
            Observação (ex.: motivo do "não se aplica", "não optante", "sem faturamento")
          </p>
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} className="font-body text-sm" />
          <div className="flex justify-end">
            <Button size="sm" className="font-body" onClick={() => onObservacao(obs.trim())} disabled={busy}>
              Salvar observação
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Link externo */}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" title={status?.link_url ? 'Editar link' : 'Colar link do documento'}>
            <Link2 className={`h-4 w-4 ${status?.link_url ? 'text-accent' : 'text-muted-foreground'}`} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-2" align="end">
          <p className="text-xs font-body text-muted-foreground">Link do documento (ex.: Google Drive)</p>
          <Input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} placeholder="https://..." className="font-body text-sm" />
          <div className="flex justify-between items-center">
            {status?.link_url
              ? <Button size="sm" variant="ghost" className="font-body text-destructive" onClick={() => { setLinkInput(''); onLink(''); }} disabled={busy}>Remover</Button>
              : <span />}
            <Button size="sm" className="font-body" onClick={() => onLink(linkInput.trim())} disabled={busy}>Salvar link</Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Upload */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ''; }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        title={status?.arquivo_path ? 'Trocar arquivo' : 'Enviar arquivo (opcional)'}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      </Button>

      {/* Status */}
      <Select value={valor} onValueChange={(v) => onStatus(v as SstStatusValor)} disabled={busy}>
        <SelectTrigger className={`h-8 w-[140px] shrink-0 text-xs font-body border ${meta.badge}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SST_STATUS_OPCOES.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs font-body">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
