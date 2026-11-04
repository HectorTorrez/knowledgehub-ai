import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
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
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDate, formatRole } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { organizationNameSchema } from '~/lib/validation';

export const Route = createFileRoute('/_authenticated/organizations/')({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('orgs.pageTitle'),
      description: t('orgs.pageDescription'),
    });
  },
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const t = useT();
  const locale = useLocale();
  const client = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const reportError = useReportError();
  const [name, setName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const hash = useRouterState({ select: (state) => state.location.hash });
  useEffect(() => {
    if (hash === 'create') setCreateOpen(true);
  }, [hash]);

  const organizations = useQuery({
    queryKey: queryKeys.organizations.list(),
    queryFn: () => organizationsApi.list(),
  });
  useQueryErrorToast(organizations.error, () => void organizations.refetch());

  const create = useMutation({
    mutationFn: (organizationName: string) =>
      organizationsApi.create({ name: organizationName }),
    onSuccess: (data) => {
      toast({
        variant: 'success',
        title: t('orgs.created'),
        description: t('orgs.createdDescription', {
          name: data.organization.name,
        }),
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.all,
      });
    },
    onError: (error) => reportError(error),
  });

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = organizationNameSchema(t).safeParse({ name });

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    try {
      const created = await create.mutateAsync(result.data.name);
      await router.navigate({
        to: '/organizations/$organizationId',
        params: { organizationId: created.organization.id },
      });
      setName('');
      setCreateOpen(false);
    } catch {
      return;
    }
  }

  const hasOrganizations =
    organizations.data !== undefined &&
    organizations.data.organizations.length > 0;

  return (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <div className="space-y-8">
        <PageHeader
          title={t('orgs.title')}
          description={t('orgs.description')}
          action={
            <DialogTrigger asChild>
              <Button>
                <Plus />
                {t('orgs.newOrganization')}
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
          <RouteError
            title={t('orgs.loadError')}
            onRetry={() => void organizations.refetch()}
          />
        ) : null}

        {organizations.isSuccess && !hasOrganizations ? (
          <EmptyState
            icon={Building2}
            title={t('orgs.emptyTitle')}
            description={t('orgs.emptyDescription')}
            action={
              <DialogTrigger asChild>
                <Button>
                  <Plus />
                  {t('orgs.createOrganization')}
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
                      {t('orgs.createdOn', {
                        date: formatDate(organization.createdAt, locale),
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <Badge
                      variant={
                        organization.role === 'OWNER' ? 'default' : 'secondary'
                      }
                    >
                      {formatRole(organization.role, t)}
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
          <DialogTitle>{t('orgs.createTitle')}</DialogTitle>
          <DialogDescription>{t('orgs.createDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="organization-name">{t('orgs.nameLabel')}</Label>
            <Input
              id="organization-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('orgs.namePlaceholder')}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending
                ? t('orgs.creating')
                : t('orgs.createOrganization')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
