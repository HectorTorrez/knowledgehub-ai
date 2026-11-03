import { describe, expect, it } from 'vitest';
import {
  canContinueConversation,
  canManageConversation,
  canReadConversation,
  canSetConversationVisibility,
  type ConversationAccess,
} from './conversation-policy.js';

describe('conversation access', () => {
  const cases: Array<{
    conversation: ConversationAccess;
    userId: string;
    manager: boolean;
    read: boolean;
    continue: boolean;
    manage: boolean;
    private: boolean;
    organization: boolean;
  }> = [
    { conversation: { createdById: 'owner', visibility: 'PRIVATE' }, userId: 'owner', manager: false, read: true, continue: true, manage: true, private: true, organization: true },
    { conversation: { createdById: 'owner', visibility: 'ORGANIZATION' }, userId: 'owner', manager: false, read: true, continue: true, manage: true, private: true, organization: true },
    { conversation: { createdById: 'owner', visibility: 'PRIVATE' }, userId: 'other', manager: true, read: false, continue: false, manage: false, private: false, organization: false },
    { conversation: { createdById: 'owner', visibility: 'ORGANIZATION' }, userId: 'other', manager: true, read: true, continue: false, manage: false, private: false, organization: false },
    { conversation: { createdById: null, visibility: 'ORGANIZATION' }, userId: 'other', manager: false, read: true, continue: false, manage: false, private: false, organization: false },
    { conversation: { createdById: null, visibility: 'ORGANIZATION' }, userId: 'other', manager: true, read: true, continue: false, manage: true, private: false, organization: true },
  ];

  it.each(cases)('enforces access for $conversation and $userId', (test) => {
    expect(canReadConversation(test.conversation, test.userId)).toBe(test.read);
    expect(canContinueConversation(test.conversation, test.userId)).toBe(test.continue);
    expect(canManageConversation(test.conversation, test.userId, test.manager)).toBe(test.manage);
    expect(canSetConversationVisibility(test.conversation, test.userId, test.manager, 'PRIVATE')).toBe(test.private);
    expect(canSetConversationVisibility(test.conversation, test.userId, test.manager, 'ORGANIZATION')).toBe(test.organization);
  });
});
