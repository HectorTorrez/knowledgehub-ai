import { describe, expect, it } from 'vitest';
import { queryKeys } from './query-keys';

describe('queryKeys', () => {
  it('scopes organization data by organization id', () => {
    expect(queryKeys.organizations.detail('org-a')).not.toEqual(
      queryKeys.organizations.detail('org-b'),
    );
    expect(queryKeys.organizations.members('org-a')).not.toEqual(
      queryKeys.organizations.members('org-b'),
    );
    expect(queryKeys.organizations.documents.list('org-a')).not.toEqual(
      queryKeys.organizations.documents.list('org-b'),
    );
  });

  it('isolates document detail keys by document id', () => {
    expect(queryKeys.organizations.documents.detail('org-a', 'doc-1')).not.toEqual(
      queryKeys.organizations.documents.detail('org-a', 'doc-2'),
    );
  });

  it('keeps every organization key under the organizations prefix', () => {
    const keys = [
      queryKeys.organizations.list(),
      queryKeys.organizations.detail('org-a'),
      queryKeys.organizations.members('org-a'),
      queryKeys.organizations.documents.list('org-a'),
      queryKeys.organizations.documents.ready('org-a'),
      queryKeys.organizations.documents.detail('org-a', 'doc-1'),
    ];

    for (const key of keys) {
      expect(key[0]).toBe('organizations');
    }
  });

  it('exposes the document list key in the organization subtree', () => {
    expect(queryKeys.organizations.documents.list('org-a')).toEqual([
      'organizations',
      'org-a',
      'documents',
      'list',
    ]);
  });

  it('keys every document query under the all prefix so a broad invalidation reaches them', () => {
    const all = queryKeys.organizations.documents.all('org-a');

    expect(all).toEqual(['organizations', 'org-a', 'documents']);
    expect(queryKeys.organizations.documents.list('org-a').slice(0, 3)).toEqual([
      ...all,
    ]);
    expect(queryKeys.organizations.documents.ready('org-a').slice(0, 3)).toEqual([
      ...all,
    ]);
  });

  it('scopes conversation keys and nested answer queries by organization', () => {
    const conversations = queryKeys.organizations.conversations.list('org-a');
    const scopedAnswers = queryKeys.organizations.answers.list(
      'org-a',
      'conversation-1',
    );

    expect(conversations).toEqual([
      'organizations',
      'org-a',
      'conversations',
      'list',
    ]);
    expect(scopedAnswers.slice(0, 5)).toEqual([
      'organizations',
      'org-a',
      'answers',
      'list',
      'conversation',
    ]);
    expect(
      queryKeys.organizations.conversations.detail('org-a', 'conversation-1'),
    ).not.toEqual(
      queryKeys.organizations.conversations.detail('org-b', 'conversation-1'),
    );
  });

  it('keys the ready-documents picker under the list prefix so invalidations reach it', () => {
    const list = queryKeys.organizations.documents.list('org-a');
    const ready = queryKeys.organizations.documents.ready('org-a');

    expect(ready.slice(0, list.length)).toEqual([...list]);
    expect(ready).not.toEqual(list);
  });
});
