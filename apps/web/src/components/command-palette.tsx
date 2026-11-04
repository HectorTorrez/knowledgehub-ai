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
import { useT } from '~/lib/i18n/provider';

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
  const t = useT();
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
        <span>{t('commandPalette.openButton')}</span>
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
          <DialogTitle className="sr-only">
            {t('commandPalette.title')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('commandPalette.description')}
          </DialogDescription>
          <Command>
            <CommandInput
              placeholder={t('commandPalette.placeholder')}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-none flex-1 sm:max-h-[60dvh]">
              <CommandEmpty>{t('commandPalette.empty')}</CommandEmpty>
              <CommandGroup heading={t('nav.navigation')}>
                {organizationId &&
                  [
                    { label: t('nav.overview'), path: '' },
                    { label: t('nav.documents'), path: '/documents' },
                    { label: t('nav.ask'), path: '/ask' },
                    { label: t('nav.search'), path: '/search' },
                    ...(canViewInsights
                      ? [{ label: t('nav.insights'), path: '/insights' }]
                      : []),
                    { label: t('nav.settings'), path: '/settings' },
                  ].map((item) => (
                    <CommandItem
                      key={item.path}
                      onSelect={() => go(base + item.path)}
                    >
                      {item.label}
                    </CommandItem>
                  ))}
                <CommandItem onSelect={() => go('/settings')}>
                  {t('nav.accountSettings')}
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading={t('nav.organizations')}>
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
                  {t('nav.createOrganization')}
                </CommandItem>
              </CommandGroup>
              {organizationId && debounced.length >= 2 && (
                <CommandGroup heading={t('nav.documents')}>
                  {documents.isFetching && (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      {t('commandPalette.searchingDocuments')}
                    </p>
                  )}
                  {documents.isError && (
                    <p className="px-2 py-2 text-sm text-destructive">
                      {t('commandPalette.documentsError')}
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
                        {t(`documentStatus.${doc.status}`)}
                      </Badge>
                    </CommandItem>
                  ))}
                  {documents.data?.documents.length === 0 && (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      {t('commandPalette.noMatchingDocuments')}
                    </p>
                  )}
                </CommandGroup>
              )}
              {organizationId && (
                <CommandGroup heading={t('commandPalette.conversations')}>
                  {conversations.isLoading && (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      {t('commandPalette.loadingConversations')}
                    </p>
                  )}
                  {conversations.isError && (
                    <p className="px-2 py-2 text-sm text-destructive">
                      {t('commandPalette.conversationsError')}
                    </p>
                  )}
                  {conversations.data?.conversations.map((conversation) => (
                    <CommandItem
                      key={conversation.id}
                      value={`conversation ${conversation.title ?? t('commandPalette.untitledConversation')} ${conversation.id}`}
                      onSelect={() =>
                        go(
                          `${base}/ask?conversation=${encodeURIComponent(conversation.id)}`,
                        )
                      }
                    >
                      {conversation.title ?? t('commandPalette.untitledConversation')}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading={t('commandPalette.actions')}>
                {organizationId && text && (
                  <>
                    <CommandItem
                      value={t('commandPalette.askQuestion', { text })}
                      onSelect={() => {
                        writeAskDraft(organizationId, undefined, text);
                        go(`${base}/ask?q=${encodeURIComponent(text)}`);
                      }}
                    >
                      {t('commandPalette.askQuestion', { text })}
                    </CommandItem>
                    <CommandItem
                      value={t('commandPalette.searchDocumentsFor', { text })}
                      onSelect={() =>
                        go(`${base}/search?q=${encodeURIComponent(text)}`)
                      }
                    >
                      {t('commandPalette.searchDocumentsFor', { text })}
                    </CommandItem>
                  </>
                )}
                {organizationId && (
                  <CommandItem onSelect={() => go(`${base}/documents#upload`)}>
                    {t('commandPalette.uploadDocuments')}
                  </CommandItem>
                )}
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    toggleTheme();
                  }}
                >
                  {t('commandPalette.toggleTheme')}
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  {t('commandPalette.logOut')}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
