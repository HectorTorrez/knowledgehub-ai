import type { ConversationSummary } from '@knowledgehub/shared-types';
import { History, LoaderCircle, MessageSquarePlus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { formatDate } from '~/lib/format';
import { cn } from '~/lib/utils';

interface ConversationGroup {
  label: string;
  conversations: ConversationSummary[];
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const;

export function ConversationRail({
  conversations,
  activeConversationId,
  listId,
  showHeading = true,
  isPending,
  isError,
  error,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  onNew,
  onSelect,
  onDelete,
  onOpenHistory,
}: Readonly<{
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  listId: string;
  showHeading?: boolean;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  onNew: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversation: ConversationSummary) => void;
  onOpenHistory: () => void;
}>) {
  const groups = useMemo(
    () => groupConversations(conversations),
    [conversations],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showHeading ? (
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
          <h2 className="text-sm font-semibold">Conversations</h2>
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
          New conversation
        </Button>
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

        {isError ? <ErrorNotice error={error} /> : null}

        {!isPending && !isError && conversations.length === 0 ? (
          <p className="px-2 py-4 text-xs leading-relaxed text-muted-foreground">
            Your conversations will appear here. Ask a question to start one.
          </p>
        ) : null}

        {groups.map((group) => (
          <section key={group.label} className="pt-2">
            <h3 className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
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
            {isFetchingNextPage ? <LoaderCircle className="animate-spin" /> : null}
            Load older
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
          Question history
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
  const title = conversation.title?.trim() || 'New conversation';

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        active ? 'bg-muted' : 'hover:bg-muted/60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span
          className={cn(
            'block truncate text-sm',
            active ? 'font-medium text-foreground' : 'text-foreground/90',
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {formatDate(conversation.createdAt)}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${title}`}
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
    return 'Today';
  }

  if (daysAgo === 1) {
    return 'Yesterday';
  }

  if (daysAgo < 7) {
    return 'Previous 7 days';
  }

  return 'Older';
}
