import { LayoutDashboard, FileBarChart, Users, LogOut, Camera, BarChart3, GitBranch, ClipboardList, FolderTree, Building2, Calendar, Activity } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Dashboard de Serviços", url: "/dashboard-servicos", icon: Activity },
  { title: "EAP", url: "/eap", icon: FolderTree },
  { title: "Diário de Obra", url: "/diario-obra", icon: ClipboardList },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { title: "Rel. Fotográfico", url: "/relatorio-fotografico", icon: Camera },
  { title: "Linha de Balanço", url: "/linha-balanco", icon: BarChart3 },
  { title: "Datas EAP", url: "/datas-eap", icon: Calendar },
  { title: "Dependências", url: "/dependencias", icon: GitBranch },
];

const adminItems = [
  { title: "Gestão de Obras", url: "/admin/obras", icon: Building2 },
  { title: "Usuários", url: "/usuarios", icon: Users },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, hasRole, signOut, userName } = useAuth();

  const showAdmin = hasRole('admin');

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary">
              <span className="text-sm font-bold text-sidebar-primary-foreground font-heading">P</span>
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-sidebar-foreground font-heading tracking-wide">
                  PAVER
                </span>
                <span className="text-[10px] text-sidebar-foreground/60 font-body">
                  Young Empreendimentos
                </span>
              </div>
            )}
          </div>
          <SidebarTrigger className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/40 font-body text-[10px]">MENU</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdmin && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/40 font-body text-[10px]">ADMIN</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={false}
                        className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        {collapsed ? (
          <SidebarTrigger className="w-full flex items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground h-9" />
        ) : (
          <>
            {user && (
              <div className="text-[11px] text-sidebar-foreground/60 font-body truncate">
                {userName || user.email}
              </div>
            )}
            <SidebarMenuButton
              onClick={signOut}
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground w-full"
            >
              <LogOut className="h-4 w-4" />
              <span className="font-body">Sair</span>
            </SidebarMenuButton>
            <p className="text-[10px] text-sidebar-foreground/40 font-body text-center">
              © {new Date().getFullYear()} Young Empreendimentos
            </p>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
