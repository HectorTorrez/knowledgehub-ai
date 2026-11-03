import { CommandPalette } from '~/components/command-palette';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { BarChart3, Building2, ChevronsUpDown, FileText, LayoutGrid, LogOut, MessageSquareText, Moon, Search, Settings, Sun } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from '~/components/ui/sidebar';
import { useToast } from '~/components/ui/toast';
import { useLogout, useSession } from '~/hooks/use-auth';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { useTheme } from '~/hooks/use-theme';
import { useWebMcpTools } from '~/hooks/use-webmcp-tools';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';

const sections = [
  { label: 'Overview', to: '/organizations/$organizationId', icon: LayoutGrid, exact: true },
  { label: 'Documents', to: '/organizations/$organizationId/documents', icon: FileText },
  { label: 'Ask', to: '/organizations/$organizationId/ask', icon: MessageSquareText },
  { label: 'Search', to: '/organizations/$organizationId/search', icon: Search },
  { label: 'Insights', to: '/organizations/$organizationId/insights', icon: BarChart3, capability: 'insights.view' },
  { label: 'Settings', to: '/organizations/$organizationId/settings', icon: Settings },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return <SidebarProvider><ShellContent>{children}</ShellContent></SidebarProvider>;
}

function ShellContent({ children }: Readonly<{ children: ReactNode }>) {
  const session = useSession();
  const signOut = useLogout();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { organizationId } = useParams({ strict: false });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenMobile } = useSidebar();
  const reportError = useReportError();
  const { toast } = useToast();
  const organizations = useQuery({ queryKey: queryKeys.organizations.list(), queryFn: () => organizationsApi.list(), staleTime: 30_000 });
  const organization = useQuery({ queryKey: queryKeys.organizations.detail(organizationId ?? ''), queryFn: () => organizationsApi.detail(organizationId!), enabled: !!organizationId });
  useQueryErrorToast(organizations.error, () => void organizations.refetch());
  useWebMcpTools();
  const user = session.data?.status === 'authenticated' ? session.data.user : undefined;
  const active = organizations.data?.organizations.find((org) => org.id === organizationId);
  const currentSection = sections.find((section) => pathname === `/organizations/${organizationId}${section.to.split('$organizationId')[1]}` || (section.to !== '/organizations/$organizationId' && pathname.startsWith(`/organizations/${organizationId}${section.to.split('$organizationId')[1]}/`)));
  useEffect(() => { if (session.data?.status === 'unauthenticated') void navigate({ to: session.data.redirectTo ?? '/login' }); }, [session.data, navigate]);
  async function handleSignOut() {
    try { await signOut.mutateAsync(); } catch (error) { reportError(error); return; }
    toast({ variant: 'success', title: 'Signed out' });
    await navigate({ to: '/login' });
  }
  return <>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4">Skip to content</a>
    <Sidebar collapsible="icon">
      <SidebarHeader><SidebarMenu><SidebarMenuItem><DropdownMenu>
        <DropdownMenuTrigger asChild><SidebarMenuButton size="lg" tooltip={active?.name ?? 'Organizations'}><Building2 /><span className="flex-1 truncate font-semibold">{active?.name ?? 'KnowledgeHub AI'}</span><ChevronsUpDown /></SidebarMenuButton></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {organizations.data?.organizations.map((org) => <DropdownMenuItem key={org.id} onSelect={() => { setOpenMobile(false); void navigate({ to: '/organizations/$organizationId', params: { organizationId: org.id } }); }}>{org.name}</DropdownMenuItem>)}
          <DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/organizations" onClick={() => setOpenMobile(false)}>All organizations</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/organizations" hash="create" onClick={() => setOpenMobile(false)}>Create organization</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu></SidebarMenuItem></SidebarMenu></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupLabel>{organizationId ? 'Workspace' : 'Navigation'}</SidebarGroupLabel><SidebarMenu>
        {organizationId ? sections.filter((section) => !('capability' in section) || (organization.data?.organization.capabilities.includes(section.capability) ?? false)).map(({ icon: Icon, ...section }) => <SidebarMenuItem key={section.to}><SidebarMenuButton className="min-h-11 md:min-h-8" asChild tooltip={section.label} isActive={currentSection?.to === section.to}><Link to={section.to} params={{ organizationId }} activeOptions={{ exact: 'exact' in section }} onClick={() => setOpenMobile(false)}><Icon /><span>{section.label}</span></Link></SidebarMenuButton></SidebarMenuItem>) : <SidebarMenuItem><SidebarMenuButton asChild tooltip="Organizations"><Link to="/organizations" onClick={() => setOpenMobile(false)}><Building2 /><span>Organizations</span></Link></SidebarMenuButton></SidebarMenuItem>}
      </SidebarMenu></SidebarGroup></SidebarContent>
      <SidebarFooter>{user && <SidebarMenu><SidebarMenuItem><DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuButton size="lg" tooltip={user.email}><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted font-semibold">{(user.firstName[0] ?? user.email[0] ?? '').toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></span><ChevronsUpDown /></SidebarMenuButton></DropdownMenuTrigger><DropdownMenuContent side="top" align="start" className="w-60"><DropdownMenuLabel>{user.email}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/settings" onClick={() => setOpenMobile(false)}><Settings />Account settings</Link></DropdownMenuItem><DropdownMenuItem onSelect={toggle}>{theme === 'dark' ? <Sun /> : <Moon />}{theme === 'dark' ? 'Light mode' : 'Dark mode'}</DropdownMenuItem><DropdownMenuItem onSelect={() => void handleSignOut()} disabled={signOut.isPending}><LogOut />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarMenuItem></SidebarMenu>}</SidebarFooter>
    </Sidebar>
    <div className="min-w-0 flex-1"><header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6"><SidebarTrigger /><span className="text-sm text-muted-foreground">{active?.name ?? 'KnowledgeHub AI'}</span>{currentSection && <><span className="text-muted-foreground">/</span><span className="truncate text-sm font-medium">{currentSection.label}</span></>}<CommandPalette organizationId={organizationId} organizations={organizations.data?.organizations ?? []} canViewInsights={organization.data?.organization.capabilities.includes('insights.view') ?? false} toggleTheme={toggle} logout={() => void handleSignOut()} /></header><main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 outline-none sm:px-6 sm:py-8">{children}</main></div>
  </>;
}
