import { describe, expect, it } from 'vitest';
import {
  canContinueConversation,
  canManageConversation,
  canReadConversation,
  canShareConversation,
  type ConversationAccess,
  type ConversationActor,
} from './conversation-policy.js';

const creator: ConversationActor = {
  userId: 'creator',
  canManageMembers: false,
};
const teammate: ConversationActor = {
  userId: 'teammate',
  canManageMembers: false,
};
const manager: ConversationActor = {
  userId: 'manager',
  canManageMembers: true,
};

const privateConversation: ConversationAccess = {
  createdById: 'creator',
  visibility: 'PRIVATE',
};
const sharedConversation: ConversationAccess = {
  createdById: 'creator',
  visibility: 'ORGANIZATION',
};
const legacyConversation: ConversationAccess = {
  createdById: null,
  visibility: 'ORGANIZATION',
};

describe('conversation access', () => {
  it.each([
    [
      'creator, private',
      privateConversation,
      creator,
      [true, true, true, true],
    ],
    [
      'teammate, private',
      privateConversation,
      teammate,
      [false, false, false, false],
    ],
    [
      'manager, private',
      privateConversation,
      manager,
      [false, false, false, false],
    ],
    ['creator, shared', sharedConversation, creator, [true, true, true, true]],
    [
      'teammate, shared',
      sharedConversation,
      teammate,
      [true, false, false, false],
    ],
    [
      'manager, shared',
      sharedConversation,
      manager,
      [true, false, false, false],
    ],
    [
      'teammate, legacy',
      legacyConversation,
      teammate,
      [true, true, false, false],
    ],
    ['manager, legacy', legacyConversation, manager, [true, true, true, false]],
  ] as const)(
    '%s → read, continue, manage, share',
    (_label, conversation, actor, [read, proceed, manage, share]) => {
      expect(canReadConversation(conversation, actor)).toBe(read);
      expect(canContinueConversation(conversation, actor)).toBe(proceed);
      expect(canManageConversation(conversation, actor)).toBe(manage);
      expect(canShareConversation(conversation, actor)).toBe(share);
    },
  );
});
