import type { ConversationSummary } from '@knowledgehub/shared-types';
import { History, MessageSquarePlus, Trash2, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '~/components/ui/button';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { formatDate } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { initials } from '~/lib/initials';
import { useSession } from '~/hooks/use-auth';
import { cn } from '~/lib/utils';

interface ConversationGroup {
  label: (typeof GROUP_ORDER)[number];
  conversations: ConversationSummary[];
}

const GROUP_ORDER = ['today', 'yesterday', 'previous7', 'older'] as const;

export function ConversationRail({
  conversations,
  scope,
  onScopeChange,
  activeConversationId,
  listId,
  showHeading = true,
  isPending,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  onNew,
  onSelect,
  onDelete,
  onOpenHistory,
}: Readonly<{
  conversations: ConversationSummary[];
  scope: 'all' | 'mine' | 'shared';
  onScopeChange: (scope: 'all' | 'mine' | 'shared') => void;
  activeConversationId: string | null;
  listId: string;
  showHeading?: boolean;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  onNew: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversation: ConversationSummary) => void;
  onOpenHistory: () => void;
}>) {
  const t = useT();
  const groups = useMemo(
    () => groupConversations(conversations),
    [conversations],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showHeading ? (
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
          <h2 className="text-sm font-semibold">{t('ask.conversations')}</h2>
        </div>
      ) : null}

      <div className="shrink-0 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={onNew}
        >
          <MessageSquarePlus />
          {t('ask.newConversation')}
        </Button>
      </div>

      <div className="flex gap-1 px-2" aria-label={t('rail.scopeLabel')}>
        {(['all', 'mine', 'shared'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={scope === value ? 'secondary' : 'ghost'}
            onClick={() => onScopeChange(value)}
          >
            {t(`rail.scopes.${value}`)}
          </Button>
        ))}
      </div>

      <div
        id={listId}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3"
      >
        {isPending ? (
          <div className="space-y-2 px-1 py-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        ) : null}

        {isError ? (
          <RouteError title={t('rail.loadError')} onRetry={onRetry} />
        ) : null}
        {!isPending && !isError && conversations.length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            title={t('rail.emptyTitle')}
            description={t('rail.emptyDescription')}
            action={<Button onClick={onNew}>{t('ask.newConversation')}</Button>}
          />
        ) : null}

        {groups.map((group) => (
          <section key={group.label} className="pt-2">
            <h3 className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {t(`rail.groups.${group.label}`)}
            </h3>
            <ul className="space-y-0.5">
              {group.conversations.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationRailItem
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    onSelect={() => onSelect(conversation.id)}
                    onDelete={() => onDelete(conversation)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={onFetchNextPage}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Spinner /> : null}
            {t('rail.loadOlder')}
          </Button>
        ) : null}
      </div>

      <div className="shrink-0 border-t p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={onOpenHistory}
        >
          <History />
          {t('ask.history')}
        </Button>
      </div>
    </div>
  );
}

function ConversationRailItem({
  conversation,
  active,
  onSelect,
  onDelete,
}: Readonly<{
  conversation: ConversationSummary;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}>) {
  const t = useT();
  const locale = useLocale();
  const session = useSession();
  const viewerId =
    session.data?.status === 'authenticated' ? session.data.user.id : undefined;
  const creator = conversation.createdBy;
  const showCreator = creator && viewerId && creator.id !== viewerId;
  const title = conversation.title?.trim() || t('ask.newConversation');

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-brand/10' : 'hover:bg-muted/60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 flex-col items-stretch rounded-lg px-2.5 py-2 text-left outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span
          title={title}
          className={cn(
            'block w-full min-w-0 truncate text-sm',
            active ? 'font-medium text-brand' : 'text-foreground/90',
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 flex w-full min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <span className="shrink-0">
            {formatDate(conversation.createdAt, locale)}
          </span>
          {conversation.visibility === 'ORGANIZATION' ? (
            <Users
              aria-label={t('rail.sharedLabel')}
              className="size-3 shrink-0"
            />
          ) : null}
          {showCreator ? (
            <>
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px]">
                {initials(creator.firstName, creator.lastName)}
              </span>
              <span className="min-w-0 truncate">
                {creator.firstName} {creator.lastName}
              </span>
            </>
          ) : null}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('rail.deleteFor', { title })}
        className="size-11 shrink-0 text-muted-foreground opacity-100 hover:text-destructive lg:size-8 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function groupConversations(
  conversations: ConversationSummary[],
): ConversationGroup[] {
  const buckets = new Map<string, ConversationSummary[]>();

  for (const conversation of conversations) {
    const label = groupLabel(conversation.createdAt);
    const bucket = buckets.get(label) ?? [];
    bucket.push(conversation);
    buckets.set(label, bucket);
  }

  return GROUP_ORDER.map((label) => ({
    label,
    conversations: buckets.get(label) ?? [],
  })).filter((group) => group.conversations.length > 0);
}

function groupLabel(iso: string): (typeof GROUP_ORDER)[number] {
  const date = new Date(iso);
  const today = new Date();

  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const daysAgo = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );

  if (daysAgo <= 0) {
    return 'today';
  }

  if (daysAgo === 1) {
    return 'yesterday';
  }

  if (daysAgo < 7) {
    return 'previous7';
  }

  return 'older';
}
