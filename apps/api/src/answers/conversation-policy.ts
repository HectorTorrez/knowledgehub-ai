import type { Prisma } from '../generated/prisma/client.js';

export type ConversationVisibility = 'PRIVATE' | 'ORGANIZATION';

export interface ConversationAccess {
  createdById: string | null;
  visibility: ConversationVisibility;
}

export interface ConversationActor {
  userId: string;
  canManageMembers: boolean;
}

export interface ConversationPermissions {
  canEdit: boolean;
  canShare: boolean;
}

function isLegacy(conversation: ConversationAccess): boolean {
  return conversation.createdById === null;
}

export function canReadConversation(
  conversation: ConversationAccess,
  actor: ConversationActor,
): boolean {
  return (
    conversation.createdById === actor.userId ||
    conversation.visibility === 'ORGANIZATION'
  );
}

export function canContinueConversation(
  conversation: ConversationAccess,
  actor: ConversationActor,
): boolean {
  return conversation.createdById === actor.userId || isLegacy(conversation);
}

export function canManageConversation(
  conversation: ConversationAccess,
  actor: ConversationActor,
): boolean {
  return (
    conversation.createdById === actor.userId ||
    (isLegacy(conversation) && actor.canManageMembers)
  );
}

export function canShareConversation(
  conversation: ConversationAccess,
  actor: ConversationActor,
): boolean {
  return conversation.createdById === actor.userId;
}

export function conversationPermissions(
  conversation: ConversationAccess,
  actor: ConversationActor,
): ConversationPermissions {
  return {
    canEdit: canContinueConversation(conversation, actor),
    canShare: canShareConversation(conversation, actor),
  };
}

export function readableConversationWhere(
  userId: string,
): Prisma.ConversationWhereInput {
  return { OR: [{ createdById: userId }, { visibility: 'ORGANIZATION' }] };
}

export function continuableConversationWhere(
  userId: string,
): Prisma.ConversationWhereInput {
  return { OR: [{ createdById: userId }, { createdById: null }] };
}

export function manageableConversationWhere(
  actor: ConversationActor,
): Prisma.ConversationWhereInput {
  return actor.canManageMembers
    ? { OR: [{ createdById: actor.userId }, { createdById: null }] }
    : { createdById: actor.userId };
}

export function readableAnswerWhere(userId: string): Prisma.AnswerWhereInput {
  return {
    OR: [
      { conversationId: null },
      { conversation: readableConversationWhere(userId) },
    ],
  };
}
