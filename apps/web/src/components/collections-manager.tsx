import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { Collection } from '@knowledgehub/shared-types';
import { collectionsApi } from '~/lib/api/collections';
import { queryKeys } from '~/lib/api/query-keys';
import { useReportError } from '~/hooks/use-error-toast';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

export function CollectionBadges({ collections }: Readonly<{ collections: Collection[] | { id: string; name: string; color: string }[] }>) {
  return (
    <span className="flex flex-wrap gap-2">
      {collections.map((collection) => (
        <span key={collection.id} className="inline-flex items-center gap-1 text-xs">
          <span className="size-2 rounded-full" style={{ backgroundColor: collection.color }} />
          {collection.name}
        </span>
      ))}
    </span>
  );
}

export function CollectionsManager({ organizationId, collections }: Readonly<{ organizationId: string; collections: Collection[] }>) {
  const client = useQueryClient();
  const reportError = useReportError();
  const [name, setName] = useState('');
  const [color, setColor] = useState(colors[0]);
  const [editing, setEditing] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onError: reportError,
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.organizations.collections(organizationId) }),
        client.invalidateQueries({ queryKey: queryKeys.organizations.documents.all(organizationId) }),
      ]);
    },
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !color) return;
    try {
      await mutation.mutateAsync(() => editing
        ? collectionsApi.update(organizationId, editing, { name: name.trim(), color })
        : collectionsApi.create(organizationId, { name: name.trim(), color }));
      setName('');
      setEditing(null);
    } catch {
      return;
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Manage collections</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage collections</DialogTitle>
          <DialogDescription>Create and organize collections for your documents.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input aria-label="Collection name" placeholder="Collection name" value={name} onChange={(event) => setName(event.target.value)} maxLength={255} />
          <label className="block text-sm">Color
            <select className="ml-2 rounded border p-2" value={color} onChange={(event) => setColor(event.target.value)}>
              {colors.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={mutation.isPending || !name.trim()}>{editing ? 'Save collection' : 'Create collection'}</Button>
            {editing ? <Button type="button" variant="outline" onClick={() => { setEditing(null); setName(''); }}>Cancel</Button> : null}
          </div>
        </form>
        <ul className="space-y-2">
          {collections.map((collection) => (
            <li key={collection.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1"><CollectionBadges collections={[collection]} /></span>
              <Button variant="outline" size="sm" onClick={() => { setEditing(collection.id); setName(collection.name); setColor(collection.color); }}>Edit</Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (window.confirm(`Delete “${collection.name}”?`)) mutation.mutate(() => collectionsApi.remove(organizationId, collection.id));
              }}>Delete</Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
