import type { DocumentSummary } from '@knowledgehub/shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderPlus, Trash2, UserRound, X } from 'lucide-react';
import { useState } from 'react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Spinner } from '~/components/ui/spinner';
import { useToast } from '~/components/ui/toast';
import { collectionsApi } from '~/lib/api/collections';
import { documentsApi } from '~/lib/api/documents';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { runBulk } from '~/lib/bulk';
import { useT } from '~/lib/i18n/hooks';

export function DocumentBulkActions({
  organizationId,
  selected,
  collections,
  onClear,
}: Readonly<{
  organizationId: string;
  selected: DocumentSummary[];
  collections: { id: string; name: string }[];
  onClear: () => void;
}>) {
  const t = useT();
  const client = useQueryClient();
  const { toast } = useToast();
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const members = useQuery({
    queryKey: queryKeys.organizations.members(organizationId),
    queryFn: () => organizationsApi.members(organizationId),
  });

  async function apply(
    action: (document: DocumentSummary) => Promise<unknown>,
    successKey: 'bulkDocuments.done' | 'bulkDocuments.deleted',
  ) {
    setWorking(true);

    try {
      const result = await runBulk(selected, action);

      await Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.all(organizationId),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.organizations.collections(organizationId),
        }),
      ]);

      if (result.succeeded.length > 0) {
        toast({
          variant: 'success',
          title: t(successKey, { count: result.succeeded.length }),
        });
      }

      if (result.failed.length > 0) {
        toast({
          variant: 'error',
          title: t('bulkDocuments.failed', { count: result.failed.length }),
        });
        return;
      }

      onClear();
    } finally {
      setWorking(false);
    }
  }

  function addToCollection(collectionId: string) {
    void apply((document) => {
      const current = (document.collections ?? []).map((item) => item.id);

      if (current.includes(collectionId)) {
        return Promise.resolve();
      }

      return collectionsApi.setDocumentCollections(
        organizationId,
        document.id,
        [...current, collectionId],
      );
    }, 'bulkDocuments.done');
  }

  function assignOwner(ownerId: string | null) {
    void apply(
      (document) =>
        documentsApi.updateReview(organizationId, document.id, {
          ownerId,
          dueDate: document.review?.dueDate ?? null,
        }),
      'bulkDocuments.done',
    );
  }

  return (
    <div
      role="toolbar"
      aria-label={t('bulkDocuments.toolbar')}
      className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
    >
      <span
        className="px-2 text-sm font-medium tabular-nums"
        aria-live="polite"
      >
        {t('bulkDocuments.selected', { count: selected.length })}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={working}
            aria-label={t('bulkDocuments.addToCollection')}
          >
            <FolderPlus />
            <span className="hidden sm:inline">
              {t('bulkDocuments.addToCollection')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          {collections.length === 0 ? (
            <DropdownMenuItem disabled>
              {t('bulkDocuments.noCollections')}
            </DropdownMenuItem>
          ) : (
            collections.map((collection) => (
              <DropdownMenuItem
                key={collection.id}
                onSelect={() => addToCollection(collection.id)}
              >
                {collection.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={working || members.isPending || members.isError}
            aria-label={t('bulkDocuments.assignOwner')}
          >
            <UserRound />
            <span className="hidden sm:inline">
              {t('bulkDocuments.assignOwner')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          side="top"
          className="max-h-72 overflow-y-auto"
        >
          <DropdownMenuItem onSelect={() => assignOwner(null)}>
            {t('documentReview.unassigned')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {(members.data?.members ?? []).map((member) => (
            <DropdownMenuItem
              key={member.userId}
              onSelect={() => assignOwner(member.userId)}
            >
              {member.firstName} {member.lastName}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        disabled={working}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={t('bulkDocuments.delete')}
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 />
        <span className="hidden sm:inline">{t('bulkDocuments.delete')}</span>
      </Button>

      {working ? (
        <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          {t('bulkDocuments.working')}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('bulkDocuments.clear')}
          title={t('bulkDocuments.clear')}
          onClick={onClear}
        >
          <X className="size-4" />
        </Button>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('bulkDocuments.deleteTitle', { count: selected.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('bulkDocuments.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                setConfirmDelete(false);
                void apply(
                  (document) =>
                    documentsApi.remove(organizationId, document.id),
                  'bulkDocuments.deleted',
                );
              }}
            >
              {t('bulkDocuments.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
