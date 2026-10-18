import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ErrorNotice } from '~/components/route-states';
import type { OrganizationRole } from '@knowledgehub/shared-types';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { memberEmailSchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/',
)({
  component: OrganizationOverviewPage,
});

function OrganizationOverviewPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  const members = useQuery({
    queryKey: queryKeys.organizations.members(organizationId),
    queryFn: () => organizationsApi.members(organizationId),
  });

  const isOwner = organization.data?.organization.role === 'OWNER';

  const addMember = useMutation({
    mutationFn: (input: { organizationId: string; email: string }) =>
      organizationsApi.addMember(input.organizationId, { email: input.email }),
    onSuccess: (_data, variables) =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      }),
  });

  const updateRole = useMutation({
    mutationFn: (input: {
      organizationId: string;
      userId: string;
      role: OrganizationRole;
    }) =>
      organizationsApi.updateMemberRole(input.organizationId, input.userId, {
        role: input.role,
      }),
    onSuccess: (_data, variables) =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      }),
  });

  const removeMember = useMutation({
    mutationFn: (input: { organizationId: string; userId: string }) =>
      organizationsApi.removeMember(input.organizationId, input.userId),
    onSuccess: (_data, variables) =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      }),
  });

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const result = memberEmailSchema.safeParse({ email });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Invalid email.');
      return;
    }

    try {
      await addMember.mutateAsync({ organizationId, email: result.data.email });
      setEmail('');
    } catch {
      return;
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Details</h2>
        {organization.data ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{organization.data.organization.name}</dd>
            <dt className="text-muted-foreground">Your role</dt>
            <dd>{organization.data.organization.role}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{new Date(organization.data.organization.createdAt).toLocaleString()}</dd>
          </dl>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Members</h2>
        {members.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : null}
        {members.isError ? <ErrorNotice error={members.error} /> : null}
        <ul className="divide-y rounded-md border">
          {members.data?.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div>
                <p className="font-medium">
                  {member.firstName} {member.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {isOwner ? (
                  <select
                    aria-label={`Role for ${member.email}`}
                    value={member.role}
                    disabled={updateRole.isPending}
                    onChange={(event) =>
                      updateRole.mutate({
                        organizationId,
                        userId: member.userId,
                        role: event.target.value as OrganizationRole,
                      })
                    }
                    className="rounded-md border bg-background px-2 py-1 text-sm"
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="MEMBER">MEMBER</option>
                  </select>
                ) : (
                  <span className="text-xs uppercase text-muted-foreground">
                    {member.role}
                  </span>
                )}
                {isOwner ? (
                  <button
                    type="button"
                    disabled={removeMember.isPending}
                    onClick={() =>
                      removeMember.mutate({ organizationId, userId: member.userId })
                    }
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {updateRole.isError ? <ErrorNotice error={updateRole.error} /> : null}
        {removeMember.isError ? <ErrorNotice error={removeMember.error} /> : null}
      </section>

      {isOwner ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Add a member</h2>
          <p className="text-sm text-muted-foreground">
            The person must already have a KnowledgeHub AI account. They join as a
            MEMBER.
          </p>
          <form onSubmit={handleAddMember} className="space-y-3" noValidate>
            {validationError ? (
              <ErrorNotice error={new Error(validationError)} />
            ) : null}
            {addMember.isError ? <ErrorNotice error={addMember.error} /> : null}
            <div className="flex gap-2">
              <input
                aria-label="Member email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={addMember.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {addMember.isPending ? 'Adding…' : 'Add member'}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
