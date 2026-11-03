export type ConversationVisibility = 'PRIVATE' | 'ORGANIZATION';

export interface ConversationAccess {
  createdById: string | null;
  visibility: ConversationVisibility;
}

export function canReadConversation(
  conversation: ConversationAccess,
  userId: string,
): boolean {
  return (
    conversation.createdById === userId ||
    conversation.visibility === 'ORGANIZATION'
  );
}

export function canContinueConversation(
  conversation: ConversationAccess,
  userId: string,
): boolean {
  return conversation.createdById === userId;
}

export function canManageConversation(
  conversation: ConversationAccess,
  userId: string,
  canManageMembers: boolean,
): boolean {
  return (
    canContinueConversation(conversation, userId) ||
    (conversation.createdById === null && canManageMembers)
  );
}

export function canSetConversationVisibility(
  conversation: ConversationAccess,
  userId: string,
  canManageMembers: boolean,
  visibility: ConversationVisibility,
): boolean {
  return (
    canManageConversation(conversation, userId, canManageMembers) &&
    (conversation.createdById !== null || visibility === 'ORGANIZATION')
  );
}
