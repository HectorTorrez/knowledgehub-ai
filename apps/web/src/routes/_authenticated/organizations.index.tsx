import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ErrorNotice, RouteMessage } from '~/components/route-states';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { organizationNameSchema } from '~/lib/validation';

export const Route = createFileRoute('/_authenticated/organizations/')({
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const organizations = useQuery({
    queryKey: queryKeys.organizations.list(),
    queryFn: () => organizationsApi.list(),
  });

  const create = useMutation({
    mutationFn: (organizationName: string) =>
      organizationsApi.create({ name: organizationName }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.organizations.all }),
  });

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const result = organizationNameSchema.safeParse({ name });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Invalid name.');
      return;
    }

    try {
      await create.mutateAsync(result.data.name);
      setName('');
    } catch {
      return;
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organizations you belong to. Documents and answers are scoped to one
          organization at a time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your organizations</h2>
        {organizations.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : null}
        {organizations.isError ? <ErrorNotice error={organizations.error} /> : null}
        {organizations.data && organizations.data.organizations.length === 0 ? (
          <RouteMessage
            title="No organizations yet"
            description="Create your first organization to start uploading documents."
          />
        ) : null}
        <ul className="divide-y rounded-md border">
          {organizations.data?.organizations.map((organization) => (
            <li key={organization.id}>
              <Link
                to="/organizations/$organizationId"
                params={{ organizationId: organization.id }}
                className="flex items-center justify-between p-4 hover:bg-accent"
              >
                <span className="font-medium">{organization.name}</span>
                <span className="text-xs uppercase text-muted-foreground">
                  {organization.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Create an organization</h2>
        <form onSubmit={handleCreate} className="space-y-3" noValidate>
          {validationError ? (
            <ErrorNotice error={new Error(validationError)} />
          ) : null}
          {create.isError ? <ErrorNotice error={create.error} /> : null}
          <div className="flex gap-2">
            <input
              aria-label="Organization name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Inc."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
