import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const DashboardServicos = lazy(() => import('./pages/DashboardServicos'));
const Eap = lazy(() => import('./pages/Eap'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const RelatorioFotografico = lazy(() => import('./pages/RelatorioFotografico'));
const LinhaBalancoPage = lazy(() => import('./pages/LinhaBalanco'));
const DatasEap = lazy(() => import('./pages/DatasEap'));
const Dependencias = lazy(() => import('./pages/Dependencias'));
const DiarioObra = lazy(() => import('./pages/DiarioObra'));
const DiarioDetalhe = lazy(() => import('./pages/DiarioDetalhe'));
const DiarioObraNovo = lazy(() => import('./pages/DiarioObraNovo'));
const AdminObras = lazy(() => import('./pages/AdminObras'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
const Login = lazy(() => import('./pages/Login'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const NotFound = lazy(() => import('./pages/NotFound'));

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
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<AppLoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/eap" element={<Eap />} />
                <Route path="/diario-obra" element={<DiarioObra />} />
                <Route path="/diario-obra/:id" element={<DiarioDetalhe />} />
                <Route path="/diario-obra/novo" element={<DiarioObraNovo />} />
                <Route path="/dependencias" element={<Dependencias />} />
                <Route path="/relatorios" element={<Relatorios />} />
                <Route path="/relatorio-fotografico" element={<RelatorioFotografico />} />
                <Route path="/linha-balanco" element={<LinhaBalancoPage />} />
                <Route path="/datas-eap" element={<DatasEap />} />
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
