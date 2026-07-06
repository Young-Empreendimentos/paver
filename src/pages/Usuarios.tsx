import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, ShieldOff, Loader2, UserPlus, Pencil, Check, X, UserX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchAllUsers, assignRole, removeRole, updateProfileName, toggleUserAtivo, authorizeUserByEmail, UserWithRole } from '@/services/api';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  engenharia: 'Engenharia',
};

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-accent/10 text-accent border-accent/30',
  engenharia: 'bg-blue-500/10 text-blue-700 border-blue-200',
};

export default function Usuarios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('engenharia');
  const [creating, setCreating] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchAllUsers,
  });

  const activeUsers = useMemo(() => users.filter(u => u.ativo), [users]);
  const inactiveUsers = useMemo(() => users.filter(u => !u.ativo), [users]);

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ userId, role, has }: { userId: string; role: string; has: boolean }) => {
      if (has) {
        await removeRole(userId, role);
      } else {
        await assignRole(userId, role);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Permissão atualizada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ userId, ativo }: { userId: string; ativo: boolean }) => {
      await toggleUserAtivo(userId, ativo);
    },
    onMutate: async ({ userId, ativo }) => {
      await queryClient.cancelQueries({ queryKey: ['users'] });
      const previous = queryClient.getQueryData<UserWithRole[]>(['users']);
      queryClient.setQueryData<UserWithRole[]>(['users'], (old) =>
        (old || []).map(u => u.id === userId ? { ...u, ativo } : u)
      );
      return { previous };
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: vars.ativo ? 'Usuário ativado!' : 'Usuário desativado!' });
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['users'], context.previous);
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async ({ userId, name }: { userId: string; name: string }) => {
      await updateProfileName(userId, name);
    },
    onMutate: async ({ userId, name }) => {
      await queryClient.cancelQueries({ queryKey: ['users'] });
      const previous = queryClient.getQueryData<UserWithRole[]>(['users']);
      queryClient.setQueryData<UserWithRole[]>(['users'], (old) =>
        (old || []).map(u => u.id === userId ? { ...u, full_name: name } : u)
      );
      setEditingNameId(null);
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Nome atualizado!' });
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['users'], context.previous);
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const startEditName = (user: UserWithRole) => {
    setEditingNameId(user.id);
    setEditNameValue(user.full_name || '');
  };

  const saveEditName = () => {
    if (editingNameId) {
      updateNameMutation.mutate({ userId: editingNameId, name: editNameValue });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      // Login é só via Google: aqui liberamos o acesso de uma conta que já entrou no sistema.
      await authorizeUserByEmail(newEmail, newRole);
      toast({ title: 'Usuário liberado!', description: 'O acesso ao Paver foi concedido.' });

      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
      setNewEmail('');
      setNewRole('engenharia');
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const renderUserCard = (u: UserWithRole) => (
    <Card key={u.id} className={!u.ativo ? 'opacity-60' : ''}>
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            {editingNameId === u.id ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={editNameValue}
                  onChange={e => setEditNameValue(e.target.value)}
                  className="h-7 text-sm font-body w-48"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveEditName();
                    if (e.key === 'Escape') setEditingNameId(null);
                  }}
                />
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveEditName} disabled={updateNameMutation.isPending}>
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingNameId(null)}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <p className="text-sm font-medium font-body">{u.full_name || 'Sem nome'}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => startEditName(u)}
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground font-body">{u.email || ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(['admin', 'engenharia'] as const).map((role) => {
            const has = u.roles.includes(role);
            return (
              <Button
                key={role}
                size="sm"
                variant="outline"
                className={`h-7 text-xs font-body ${has ? roleBadgeColors[role] : 'text-muted-foreground'}`}
                onClick={() => toggleRoleMutation.mutate({ userId: u.id, role, has })}
                disabled={toggleRoleMutation.isPending}
              >
                {has ? <Shield className="h-3 w-3 mr-1" /> : <ShieldOff className="h-3 w-3 mr-1" />}
                {roleLabels[role]}
              </Button>
            );
          })}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border">
            <Switch
              checked={u.ativo}
              onCheckedChange={(checked) => toggleAtivoMutation.mutate({ userId: u.id, ativo: checked })}
              disabled={toggleAtivoMutation.isPending}
            />
            <span className="text-[10px] text-muted-foreground font-body w-10">
              {u.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Usuários</h1>
          <p className="text-muted-foreground font-body">Gerenciamento de usuários e permissões</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
              <UserPlus className="h-4 w-4 mr-2" />
              Liberar Acesso
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">Adicionar Usuário</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label className="font-body">E-mail</Label>
                <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required className="font-body" placeholder="pessoa@exemplo.com" />
                <p className="text-xs text-muted-foreground font-body">
                  Libera o acesso de alguém que já entrou com Google ao menos uma vez.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="font-body">Perfil</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="font-body"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin" className="font-body">Administrador</SelectItem>
                    <SelectItem value="engenharia" className="font-body">Engenharia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="font-body">Cancelar</Button>
                <Button type="submit" disabled={creating} className="bg-accent text-accent-foreground hover:bg-accent/90 font-body">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-heading font-semibold text-muted-foreground">Nenhum usuário encontrado</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active users */}
          <div className="space-y-3">
            {activeUsers.map(renderUserCard)}
          </div>

          {/* Inactive users */}
          {inactiveUsers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <UserX className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-heading font-semibold text-muted-foreground">
                  Usuários desativados ({inactiveUsers.length})
                </h2>
              </div>
              {inactiveUsers.map(renderUserCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
