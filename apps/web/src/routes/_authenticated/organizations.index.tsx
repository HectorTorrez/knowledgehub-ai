import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter, useRouterState } from '@tanstack/react-router';
import { ArrowRight, Building2, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { PageHeader } from '~/components/page-header';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import {
  useQueryErrorToast,
  useReportError,
} from '~/hooks/use-error-toast';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDate, formatRole } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { organizationNameSchema } from '~/lib/validation';

export const Route = createFileRoute('/_authenticated/organizations/')({
  head: () =>
    pageHead({
      title: 'Organizations · KnowledgeHub AI',
      description:
        'Manage the organizations you belong to and open their documents.',
    }),
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const client = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const reportError = useReportError();
  const [name, setName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const hash = useRouterState({ select: (state) => state.location.hash });
  useEffect(() => { if (hash === 'create') setCreateOpen(true); }, [hash]);

  const organizations = useQuery({
    queryKey: queryKeys.organizations.list(),
    queryFn: () => organizationsApi.list(),
  });
  useQueryErrorToast(organizations.error, () =>
    void organizations.refetch(),
  );

  const create = useMutation({
    mutationFn: (organizationName: string) =>
      organizationsApi.create({ name: organizationName }),
    onSuccess: (data) => {
      toast({
        variant: 'success',
        title: 'Organization created',
        description: `“${data.organization.name}” is ready for documents.`,
      });

      return client.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
    onError: (error) => reportError(error),
  });

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = organizationNameSchema.safeParse({ name });

    if (!result.success) {
      reportError(
        new Error(result.error.issues[0]?.message ?? 'Invalid name.'),
      );
      return;
    }

    try {
      const created = await create.mutateAsync(result.data.name);
      await router.navigate({ to: '/organizations/$organizationId', params: { organizationId: created.organization.id } });
      setName('');
      setCreateOpen(false);
    } catch {
      return;
    }
  }

  const hasOrganizations =
    organizations.data !== undefined && organizations.data.organizations.length > 0;

  return (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <div className="space-y-8">
        <PageHeader
          title="Organizations"
          description="Documents and answers are kept separate for each organization."
          action={
            <DialogTrigger asChild>
              <Button>
                <Plus />
                New organization
              </Button>
            </DialogTrigger>
          }
        />

        {organizations.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : null}

        {organizations.isError ? (
          <RouteError title="Unable to load organizations" onRetry={() => void organizations.refetch()} />
        ) : null}

        {organizations.isSuccess && !hasOrganizations ? (
          <EmptyState
            icon={Building2}
            title="No organizations yet"
            description="Create your first organization to start uploading documents and asking questions."
            action={
              <DialogTrigger asChild>
                <Button>
                  <Plus />
                  Create organization
                </Button>
              </DialogTrigger>
            }
          />
        ) : null}

        {hasOrganizations ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {organizations.data?.organizations.map((organization) => (
              <Link
                key={organization.id}
                to="/organizations/$organizationId"
                params={{ organizationId: organization.id }}
                className="group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              >
                <Card className="h-full transition-colors group-hover:border-foreground/20 group-hover:bg-accent/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-md bg-muted text-foreground">
                        <Building2 className="size-4" />
                      </span>
                      <span className="truncate">{organization.name}</span>
                    </CardTitle>
                    <CardDescription>
                      Created {formatDate(organization.createdAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <Badge variant={organization.role === 'OWNER' ? 'default' : 'secondary'}>
                      {formatRole(organization.role)}
                    </Badge>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create an organization</DialogTitle>
          <DialogDescription>
            Organizations keep documents and answers isolated per team.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="organization-name">Name</Label>
            <Input
              id="organization-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Inc."
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
