import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'engenharia';
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        <p className="text-sm text-muted-foreground font-body">Carregando...</p>
      </div>
    </div>
  );
}

function AccessDenied() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-heading font-bold text-foreground">Acesso não autorizado</h1>
          <p className="text-sm text-muted-foreground font-body">
            Sua conta{user?.email ? ` (${user.email})` : ''} não tem permissão para acessar o Paver.
            Solicite a um administrador que libere seu acesso.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => signOut()}
          className="font-body"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading, accessLoading, authorized, hasRole } = useAuth();

  // Aguarda a sessão e a verificação de acesso (roles/perfil) antes de decidir.
  if (loading || (user && accessLoading)) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Autenticado mas sem role no Paver (ou perfil inativo): bloqueia o acesso.
  if (!authorized) {
    return <AccessDenied />;
  }

  if (requiredRole && !hasRole(requiredRole) && !hasRole('admin')) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
