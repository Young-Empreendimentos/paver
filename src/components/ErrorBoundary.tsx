import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** Erro típico de "chunk" que sumiu após um deploy novo (o index antigo aponta p/ arquivos que não existem mais). */
export function isChunkError(error: unknown): boolean {
  const m = String((error as { message?: string } | undefined)?.message ?? error ?? '');
  return /dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported module|Failed to fetch/i.test(m);
}

/** Recarrega a página no máximo 1x a cada 10s (evita loop de reload). Retorna se vai recarregar. */
export function reloadOnceForChunk(): boolean {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem('paver_chunk_reload_at') || 0);
    if (now - last > 10000) {
      sessionStorage.setItem('paver_chunk_reload_at', String(now));
      window.location.reload();
      return true;
    }
    return false;
  } catch {
    window.location.reload();
    return true;
  }
}

type Props = { children: ReactNode; location: string };
type State = { hasError: boolean; errLoc: string | null };

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false, errLoc: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Chunk sumido após deploy: recarrega sozinho (1x). Outros erros: mostra o aviso.
    if (isChunkError(error)) reloadOnceForChunk();
    this.setState({ errLoc: this.props.location });
  }

  componentDidUpdate() {
    // Ao trocar de página (menu), reseta — a tela quebrada não "gruda".
    if (this.state.hasError && this.state.errLoc && this.state.errLoc !== this.props.location) {
      this.setState({ hasError: false, errLoc: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="w-full max-w-sm space-y-4 text-center">
            <p className="font-heading text-lg text-foreground">Ops, esta tela travou</p>
            <p className="font-body text-sm text-muted-foreground">
              Pode ter sido uma atualização do sistema. Troque de página pelo menu ou recarregue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 font-body text-sm text-primary-foreground hover:bg-primary/90"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Boundary que sabe a rota atual, p/ se recuperar automaticamente ao navegar. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundaryInner location={pathname}>{children}</ErrorBoundaryInner>;
}
