import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '~/components/ui/dialog';
import { conversationsApi } from '~/lib/api/conversations';
import { documentsApi } from '~/lib/api/documents';
import { shortcutLabel } from '~/lib/shortcut-label';
import { writeAskDraft } from '~/lib/ask-draft';

export function CommandPalette({
  organizationId,
  organizations,
  canViewInsights,
  toggleTheme,
  logout,
}: Readonly<{
  organizationId?: string;
  organizations: Array<{ id: string; name: string }>;
  canViewInsights: boolean;
  toggleTheme: () => void;
  logout: () => void;
}>) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [shortcut, setShortcut] = useState('Ctrl K');
  useEffect(() => {
    setShortcut(shortcutLabel(navigator.platform));
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === 'k' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const documents = useQuery({
    queryKey: ['palette-documents', organizationId, debounced],
    queryFn: ({ signal }) =>
      documentsApi.list(organizationId!, { q: debounced, limit: 8, signal }),
    enabled: open && !!organizationId && debounced.length >= 2,
  });
  const conversations = useQuery({
    queryKey: ['palette-conversations', organizationId],
    queryFn: ({ signal }) =>
      conversationsApi.list(organizationId!, { limit: 8, signal }),
    enabled: open && !!organizationId,
  });
  function go(href: string) {
    setOpen(false);
    setQuery('');
    void navigate({ href });
  }
  const base = `/organizations/${organizationId}`;
  const text = query.trim();
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto gap-2"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span>Search…</span>
        <span className="text-xs text-muted-foreground">{shortcut}</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setQuery('');
        }}
      >
        <DialogContent className="h-dvh max-h-dvh max-w-none rounded-none p-0 sm:h-auto sm:max-h-[80dvh] sm:max-w-lg sm:rounded-lg">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search navigation, organizations, documents, and actions.
          </DialogDescription>
          <Command>
            <CommandInput
              placeholder="Search or type a command…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-none flex-1 sm:max-h-[60dvh]">
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Navigation">
                {organizationId &&
                  [
                    'Overview',
                    'Documents',
                    'Ask',
                    'Search',
                    ...(canViewInsights ? ['Insights'] : []),
                    'Settings',
                  ].map((name) => (
                    <CommandItem
                      key={name}
                      onSelect={() =>
                        go(
                          base +
                            (name === 'Overview'
                              ? ''
                              : `/${name.toLowerCase()}`),
                        )
                      }
                    >
                      {name}
                    </CommandItem>
                  ))}
                <CommandItem onSelect={() => go('/settings')}>
                  Account settings
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Organizations">
                {organizations.map((org) => (
                  <CommandItem
                    key={org.id}
                    value={`organization ${org.name} ${org.id}`}
                    onSelect={() => go(`/organizations/${org.id}`)}
                  >
                    {org.name}
                  </CommandItem>
                ))}
                <CommandItem onSelect={() => go('/organizations#create')}>
                  Create organization
                </CommandItem>
              </CommandGroup>
              {organizationId && debounced.length >= 2 && (
                <CommandGroup heading="Documents">
                  {documents.isFetching && (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      Searching documents…
                    </p>
                  )}
                  {documents.isError && (
                    <p className="px-2 py-2 text-sm text-destructive">
                      Could not load documents.
                    </p>
                  )}
                  {documents.data?.documents.map((doc) => (
                    <CommandItem
                      key={doc.id}
                      value={`document ${doc.title} ${doc.id}`}
                      onSelect={() => go(`${base}/documents/${doc.id}`)}
                    >
                      {doc.title}
                      <Badge variant="secondary" className="ml-auto">
                        {doc.status}
                      </Badge>
                    </CommandItem>
                  ))}
                  {documents.data?.documents.length === 0 && (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      No matching documents.
                    </p>
                  )}
                </CommandGroup>
              )}
              {organizationId && (
                <CommandGroup heading="Conversations">
                  {conversations.isLoading && (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      Loading conversations…
                    </p>
                  )}
                  {conversations.isError && (
                    <p className="px-2 py-2 text-sm text-destructive">
                      Could not load conversations.
                    </p>
                  )}
                  {conversations.data?.conversations.map((conversation) => (
                    <CommandItem
                      key={conversation.id}
                      value={`conversation ${conversation.title ?? 'Untitled'} ${conversation.id}`}
                      onSelect={() =>
                        go(
                          `${base}/ask?conversation=${encodeURIComponent(conversation.id)}`,
                        )
                      }
                    >
                      {conversation.title ?? 'Untitled conversation'}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Actions">
                {organizationId && text && (
                  <>
                    <CommandItem
                      value={`ask a question ${text}`}
                      onSelect={() => {
                        writeAskDraft(organizationId, undefined, text);
                        go(`${base}/ask?q=${encodeURIComponent(text)}`);
                      }}
                    >
                      Ask a question… {text}
                    </CommandItem>
                    <CommandItem
                      value={`search documents for ${text}`}
                      onSelect={() =>
                        go(`${base}/search?q=${encodeURIComponent(text)}`)
                      }
                    >
                      Search documents for {text}
                    </CommandItem>
                  </>
                )}
                {organizationId && (
                  <CommandItem onSelect={() => go(`${base}/documents#upload`)}>
                    Upload documents
                  </CommandItem>
                )}
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    toggleTheme();
                  }}
                >
                  Toggle theme
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  Log out
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
