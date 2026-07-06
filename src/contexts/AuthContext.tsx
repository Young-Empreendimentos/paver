import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'engenharia';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  accessLoading: boolean;
  roles: AppRole[];
  userName: string | null;
  ativo: boolean;
  /** Autorizado a usar o Paver: tem ao menos uma role E o perfil está ativo. */
  authorized: boolean;
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(true);

  // Busca perfil + roles do Paver. Determina se o usuário pode acessar o app.
  // Executado fora do callback do onAuthStateChange (setTimeout) para evitar
  // o deadlock conhecido do supabase-js ao chamar a API dentro do listener.
  const loadAccess = async (userId: string) => {
    setAccessLoading(true);
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from('paver_user_roles').select('role').eq('user_id', userId),
      supabase.from('paver_profiles').select('full_name, ativo').eq('id', userId).maybeSingle(),
    ]);

    setRoles((rolesRes.data ?? []).map((r: { role: AppRole }) => r.role));
    setUserName(profileRes.data?.full_name ?? null);
    // Sem linha de perfil não bloqueia (a role é o portão); só bloqueia se ativo === false.
    setAtivo(profileRes.data ? profileRes.data.ativo !== false : true);
    setAccessLoading(false);
  };

  const resetAccess = () => {
    setRoles([]);
    setUserName(null);
    setAtivo(true);
    setAccessLoading(false);
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setAccessLoading(true);
          setTimeout(() => loadAccess(session.user.id), 0);
        } else {
          resetAccess();
        }
        setLoading(false);
      }
    );

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadAccess(session.user.id);
      } else {
        resetAccess();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasRole = (role: AppRole) => roles.includes(role);
  const authorized = roles.length > 0 && ativo;

  const signOut = async () => {
    await supabase.auth.signOut();
    resetAccess();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, accessLoading, roles, userName, ativo, authorized, hasRole, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
