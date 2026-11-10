import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { KnowledgeGapTask } from '@knowledgehub/shared-types';
import { useState } from 'react';
import { knowledgeGapsApi } from '~/lib/api/knowledge-gaps';
import { organizationsApi } from '~/lib/api/organizations';
import { documentsApi } from '~/lib/api/documents';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { useT } from '~/lib/i18n/hooks';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';

export function CreateKnowledgeGap({
  organizationId,
  answerId,
}: {
  organizationId: string;
  answerId: string;
}) {
  const t = useT();
  const client = useQueryClient();
  const reportError = useReportError();
  const mutation = useMutation({
    mutationFn: () =>
      knowledgeGapsApi.save(organizationId, answerId, {
        status: 'OPEN',
        assigneeId: null,
        documentId: null,
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ['knowledge-gaps', organizationId],
      }),
    onError: reportError,
  });
  const tasks = useQuery({
    queryKey: ['knowledge-gaps', organizationId],
    queryFn: () => knowledgeGapsApi.list(organizationId),
  });
  const exists = tasks.data?.tasks.some((task) => task.answerId === answerId);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mutation.isPending || exists || mutation.isSuccess}
      onClick={() => mutation.mutate()}
    >
      {exists || mutation.isSuccess
        ? t('knowledgeGaps.tracked')
        : t('knowledgeGaps.create')}
    </Button>
  );
}

export function KnowledgeGapTasks({
  organizationId,
}: {
  organizationId: string;
}) {
  const t = useT();
  const tasks = useQuery({
    queryKey: ['knowledge-gaps', organizationId],
    queryFn: () => knowledgeGapsApi.list(organizationId),
  });
  useQueryErrorToast(tasks.error);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('knowledgeGaps.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.isPending ? <p role="status">{t('common.saving')}</p> : null}
        {tasks.isError ? (
          <Button variant="outline" onClick={() => void tasks.refetch()}>
            {t('common.tryAgain')}
          </Button>
        ) : null}
        {tasks.data?.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('knowledgeGaps.empty')}
          </p>
        ) : null}
        {tasks.data?.tasks.map((task) => (
          <KnowledgeGapEditor
            key={`${task.id}-${task.updatedAt}`}
            organizationId={organizationId}
            task={task}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function KnowledgeGapEditor({
  organizationId,
  task,
}: {
  organizationId: string;
  task: KnowledgeGapTask;
}) {
  const t = useT();
  const client = useQueryClient();
  const reportError = useReportError();
  const [status, setStatus] = useState(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [documentId, setDocumentId] = useState(task.documentId ?? '');
  const members = useQuery({
    queryKey: ['members', organizationId],
    queryFn: () => organizationsApi.members(organizationId),
  });
  const documents = useQuery({
    queryKey: ['gap-documents', organizationId],
    queryFn: () => documentsApi.list(organizationId, { limit: 100 }),
  });
  useQueryErrorToast(members.error);
  useQueryErrorToast(documents.error);
  const mutation = useMutation({
    mutationFn: () =>
      knowledgeGapsApi.save(organizationId, task.answerId, {
        status,
        assigneeId: assigneeId || null,
        documentId: documentId || null,
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ['knowledge-gaps', organizationId],
      }),
    onError: reportError,
  });
  const selectClass =
    'h-11 w-full rounded-md border bg-background px-3 text-sm';
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="font-medium break-words">{task.question}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${task.id}-status`}>
            {t('knowledgeGaps.status')}
          </Label>
          <select
            id={`${task.id}-status`}
            className={selectClass}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as KnowledgeGapTask['status'])
            }
          >
            <option value="OPEN">{t('knowledgeGaps.open')}</option>
            <option value="IN_PROGRESS">{t('knowledgeGaps.inProgress')}</option>
            <option value="RESOLVED">{t('knowledgeGaps.resolved')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${task.id}-assignee`}>
            {t('knowledgeGaps.assignee')}
          </Label>
          <select
            id={`${task.id}-assignee`}
            className={selectClass}
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">{t('knowledgeGaps.unassigned')}</option>
            {members.data?.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.firstName} {member.lastName}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${task.id}-document`}>
            {t('knowledgeGaps.document')}
          </Label>
          <select
            id={`${task.id}-document`}
            className={selectClass}
            value={documentId}
            required={status === 'RESOLVED'}
            onChange={(event) => setDocumentId(event.target.value)}
          >
            <option value="">{t('knowledgeGaps.noDocument')}</option>
            {documents.data?.documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={
            mutation.isPending ||
            members.isPending ||
            documents.isPending ||
            members.isError ||
            documents.isError
          }
          type="submit"
        >
          {t('common.save')}
        </Button>
        {task.documentId ? (
          <Link
            className="text-sm text-brand underline"
            to="/organizations/$organizationId/documents/$documentId"
            params={{ organizationId, documentId: task.documentId }}
          >
            {t('knowledgeGaps.viewDocument')}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
