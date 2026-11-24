import CelebracaoVenda from "@/components/CelebracaoVenda";
import { supabase } from "@/integrations/supabase/client";
import { Suspense, lazy, type ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { RouteErrorBoundary, reloadOnceForChunk } from '@/components/ErrorBoundary';

// Carrega a página; se o chunk sumiu (deploy novo), recarrega 1x em vez de quebrar na tela branca.
function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      if (reloadOnceForChunk()) return new Promise<{ default: T }>(() => {}); // vai recarregar; segura o render
      throw err; // recarregou há pouco: deixa o ErrorBoundary mostrar o aviso
    }),
  );
}

const Dashboard = lazyWithReload(() => import('./pages/Dashboard'));
const DashboardServicos = lazyWithReload(() => import('./pages/DashboardServicos'));
const Eap = lazyWithReload(() => import('./pages/Eap'));
const Relatorios = lazyWithReload(() => import('./pages/Relatorios'));
const RelatorioFotografico = lazyWithReload(() => import('./pages/RelatorioFotografico'));
const LinhaBalancoPage = lazyWithReload(() => import('./pages/LinhaBalanco'));
const DatasEap = lazyWithReload(() => import('./pages/DatasEap'));
const Dependencias = lazyWithReload(() => import('./pages/Dependencias'));
const DiarioObra = lazyWithReload(() => import('./pages/DiarioObra'));
const DiarioDetalhe = lazyWithReload(() => import('./pages/DiarioDetalhe'));
const DiarioObraNovo = lazyWithReload(() => import('./pages/DiarioObraNovo'));
const AdminObras = lazyWithReload(() => import('./pages/AdminObras'));
const Empreiteiros = lazyWithReload(() => import('./pages/Empreiteiros'));
const Sst = lazyWithReload(() => import('./pages/Sst'));
const SstConfig = lazyWithReload(() => import('./pages/SstConfig'));
const Estoque = lazyWithReload(() => import('./pages/Estoque'));
const EstoqueConfig = lazyWithReload(() => import('./pages/EstoqueConfig'));
const Usuarios = lazyWithReload(() => import('./pages/Usuarios'));
const Login = lazyWithReload(() => import('./pages/Login'));
const ResetPassword = lazyWithReload(() => import('./pages/ResetPassword'));
const NotFound = lazyWithReload(() => import('./pages/NotFound'));

const queryClient = new QueryClient();

function AppLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-heading text-lg text-foreground">Carregando página</p>
          <p className="font-body text-sm text-muted-foreground">Preparando a interface sem bloquear a navegação.</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <CelebracaoVenda supabase={supabase} sistema="Paver" somUrl="/sons/venda-celebracao.mp3" />
      <BrowserRouter>
        <AuthProvider>
          <RouteErrorBoundary>
          <Suspense fallback={<AppLoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard-servicos" element={<DashboardServicos />} />
                <Route path="/eap" element={<Eap />} />
                <Route path="/diario-obra" element={<DiarioObra />} />
                <Route path="/diario-obra/:id" element={<DiarioDetalhe />} />
                <Route path="/diario-obra/novo" element={<DiarioObraNovo />} />
                <Route path="/dependencias" element={<Dependencias />} />
                <Route path="/relatorios" element={<Relatorios />} />
                <Route path="/relatorio-fotografico" element={<RelatorioFotografico />} />
                <Route path="/linha-balanco" element={<LinhaBalancoPage />} />
                <Route path="/datas-eap" element={<DatasEap />} />
                <Route path="/empreiteiros" element={<Empreiteiros />} />
                <Route path="/sst" element={<Sst />} />
                <Route path="/sst/config" element={<SstConfig />} />
                <Route path="/estoque" element={<Estoque />} />
                <Route path="/estoque/config" element={<EstoqueConfig />} />
                <Route
                  path="/admin/obras"
                  element={(
                    <ProtectedRoute requiredRole="admin">
                      <AdminObras />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="/usuarios"
                  element={(
                    <ProtectedRoute requiredRole="admin">
                      <Usuarios />
                    </ProtectedRoute>
                  )}
                />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </RouteErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
