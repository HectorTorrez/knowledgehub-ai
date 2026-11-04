import { usageProgress } from '~/lib/usage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LogOut, Settings, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { OrganizationActivity } from '~/components/organization-activity';
import { OrganizationMembers } from '~/components/organization-members';
import { RouteError } from '~/components/route-states';
import { PageHeader } from '~/components/page-header';
import { Button, buttonVariants } from '~/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Progress } from '~/components/ui/progress';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime, formatRole } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { organizationNameSchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/settings',
)({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('orgSettings.pageTitle'),
      description: t('orgSettings.pageDescription'),
    });
  },
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const t = useT();
  const locale = useLocale();
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportError = useReportError();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  useQueryErrorToast(organization.error, () => void organization.refetch());

  const canDeleteOrganization =
    organization.data?.organization.capabilities.includes(
      'organization.delete',
    ) ?? false;
  const canManage =
    organization.data?.organization.capabilities.includes(
      'organization.manage',
    ) ?? false;
  const usage = useQuery({
    queryKey: ['organizations', organizationId, 'usage'],
    queryFn: () => organizationsApi.usage(organizationId),
    enabled: canManage,
  });
  useQueryErrorToast(usage.error, () => void usage.refetch());
  const currentName = organization.data?.organization.name ?? '';
  const nameDraft = name ?? currentName;
  const dirty = name !== null && name !== currentName;

  const rename = useMutation({
    mutationFn: (nextName: string) =>
      organizationsApi.updateName(organizationId, { name: nextName }),
    onSuccess: async (data) => {
      toast({
        variant: 'success',
        title: t('orgSettings.renamed'),
        description: t('orgSettings.renamedDescription', {
          name: data.organization.name,
        }),
      });
      setName(null);
      await Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.organizations.detail(organizationId),
        }),
        client.invalidateQueries({ queryKey: queryKeys.organizations.list() }),
      ]);
    },
    onError: (error) => reportError(error),
  });

  const leave = useMutation({
    mutationFn: () => organizationsApi.leave(organizationId),
    onSuccess: async () => {
      toast({ variant: 'success', title: t('orgSettings.left') });
      await client.invalidateQueries({ queryKey: queryKeys.organizations.all });
      await navigate({ to: '/organizations' });
    },
    onError: (error) => reportError(error),
  });

  const remove = useMutation({
    mutationFn: () => organizationsApi.remove(organizationId),
    onSuccess: async () => {
      toast({
        variant: 'success',
        title: t('orgSettings.deleted'),
        description: t('orgSettings.deletedDescription'),
      });
      await client.invalidateQueries({ queryKey: queryKeys.organizations.all });
      await navigate({ to: '/organizations' });
    },
    onError: (error) => reportError(error),
  });

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = organizationNameSchema(t).safeParse({ name: nameDraft });

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    try {
      await rename.mutateAsync(result.data.name);
    } catch {
      return;
    }
  }

  if (organization.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (organization.isError) {
    return (
      <RouteError
        title={t('orgSettings.loadError')}
        onRetry={() => void organization.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('orgSettings.title')}
        description={t('orgSettings.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-4 text-muted-foreground" />
            {t('orgSettings.details')}
          </CardTitle>
          <CardDescription>
            {canManage
              ? t('orgSettings.renameHintManage')
              : t('orgSettings.renameHintMember', {
                  role: formatRole(organization.data.organization.role, t),
                })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <form
              onSubmit={handleRename}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              noValidate
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="organization-name-setting">
                  {t('orgs.nameLabel')}
                </Label>
                <Input
                  id="organization-name-setting"
                  value={nameDraft}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={
                  !dirty || rename.isPending || nameDraft.trim().length === 0
                }
              >
                {rename.isPending ? t('orgSettings.saving') : t('common.save')}
              </Button>
            </form>
          ) : (
            <p className="text-sm">{organization.data.organization.name}</p>
          )}
        </CardContent>
      </Card>

      <OrganizationMembers organizationId={organizationId} />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('orgSettings.usagePlan')}</CardTitle>
            <CardDescription>
              {t('orgSettings.currentPlan', {
                plan: t('orgSettings.planFree'),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage.data ? (
              <div className="space-y-4">
                {(
                  [
                    [t('orgSettings.dailyAnswers'), usage.data.usage.answers],
                    [t('nav.documents'), usage.data.usage.documents],
                    [t('orgSettings.storage'), usage.data.usage.storageBytes],
                    [t('orgSettings.members'), usage.data.usage.members],
                  ] as const
                ).map(([label, counter]) => {
                  const progress = usageProgress(counter.used, counter.limit);
                  return (
                    <div key={label} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{label}</span>
                        <span>
                          {counter.used.toLocaleString(locale)} /{' '}
                          {counter.limit?.toLocaleString(locale) ??
                            t('orgSettings.unlimited')}
                        </span>
                      </div>
                      <Progress
                        aria-label={label}
                        value={progress.value}
                        indicatorClassName={
                          progress.tone === 'destructive'
                            ? 'bg-destructive'
                            : progress.tone === 'warning'
                              ? 'bg-amber-500'
                              : undefined
                        }
                      />
                    </div>
                  );
                })}
                <p className="text-sm text-muted-foreground">
                  {t('orgSettings.resetsAt', {
                    date: formatDateTime(
                      usage.data.usage.answers.resetsAt,
                      locale,
                    ),
                  })}
                </p>
              </div>
            ) : usage.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : usage.isError ? (
              <RouteError
                title={t('orgSettings.usageLoadError')}
                onRetry={() => void usage.refetch()}
              />
            ) : null}
            <Button asChild variant="outline">
              <a href="/#pricing">{t('orgSettings.upgrade')}</a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <OrganizationActivity organizationId={organizationId} />
      ) : null}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{t('orgSettings.dangerZone')}</CardTitle>
          <CardDescription>
            {t('orgSettings.dangerDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('orgSettings.leaveTitle')}</p>
            <p className="text-sm text-muted-foreground">
              {canDeleteOrganization
                ? t('orgSettings.leaveLastOwner')
                : t('orgSettings.leaveLoseAccess')}
            </p>
          </div>
          <Button variant="outline" onClick={() => setLeaveOpen(true)}>
            <LogOut />
            {t('orgSettings.leave')}
          </Button>
        </CardContent>

        {canDeleteOrganization ? (
          <CardContent className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between sm:pt-6">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t('orgSettings.deleteTitle')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('orgSettings.deleteDescription')}
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 />
              {t('orgSettings.delete')}
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('orgSettings.leaveDialogTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('orgSettings.leaveDialogDescription', {
                name: organization.data.organization.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={leave.isPending}
              onClick={(event) => {
                event.preventDefault();
                void leave.mutateAsync();
              }}
            >
              {leave.isPending
                ? t('orgSettings.leaving')
                : t('orgSettings.leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('orgSettings.deleteDialogTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('orgSettings.deleteDialogDescription', {
                name: organization.data.organization.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void remove.mutateAsync();
              }}
            >
              {remove.isPending
                ? t('orgSettings.deleting')
                : t('orgSettings.deleteOrganization')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
