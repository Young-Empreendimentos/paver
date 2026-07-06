import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCheck, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSolicitacoesPendentes, aprovarSolicitacao, recusarSolicitacao } from '@/services/api';

// Card exibido no topo da home APENAS para admins, com as solicitações de acesso pendentes.
// O pedido em si é criado automaticamente quando um usuário sem role loga no sistema.
export function PendingAccessRequests() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleFor, setRoleFor] = useState<Record<string, string>>({});

  const isAdmin = hasRole('admin');

  const { data: requests = [] } = useQuery({
    queryKey: ['access-requests'],
    queryFn: fetchSolicitacoesPendentes,
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => aprovarSolicitacao(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-requests'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Acesso aprovado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => recusarSolicitacao(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-requests'] });
      toast({ title: 'Solicitação recusada' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  if (!isAdmin || requests.length === 0) return null;

  const pending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-heading">
          <UserCheck className="h-4 w-4 text-accent" />
          Solicitações de acesso
          <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{requests.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((r) => {
          const role = roleFor[r.id] ?? 'engenharia';
          return (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium font-body">{r.full_name || 'Sem nome'}</p>
                <p className="truncate text-xs text-muted-foreground font-body">{r.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={role} onValueChange={(v) => setRoleFor((s) => ({ ...s, [r.id]: v }))}>
                  <SelectTrigger className="h-8 w-36 font-body text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="engenharia" className="font-body">Engenharia</SelectItem>
                    <SelectItem value="admin" className="font-body">Administrador</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8 bg-accent text-accent-foreground hover:bg-accent/90 font-body"
                  disabled={pending}
                  onClick={() => approveMutation.mutate({ id: r.id, role })}
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 font-body"
                  disabled={pending}
                  onClick={() => rejectMutation.mutate(r.id)}
                  title="Recusar"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
