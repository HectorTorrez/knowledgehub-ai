import type { OrganizationActivityItem } from '@knowledgehub/shared-types';
import type { Translator } from '~/lib/i18n/translate';

export function activityActionLabel(
  action: OrganizationActivityItem['action'],
  t: Translator,
): string {
  return t(`activity.actions.${action}`);
}

export function formatActivity(
  item: OrganizationActivityItem,
  t: Translator,
): string {
  const actor = item.actor
    ? `${item.actor.firstName} ${item.actor.lastName}`.trim() ||
      item.actor.email
    : t('activity.someone');
  const { email, from, to, title } = item.metadata;
  const person = email || t('activity.aMember');
  const document = title
    ? t('activity.documentNamed', { title })
    : t('activity.aDocument');
  const renamedDocument = from
    ? t('activity.documentNamed', { title: from })
    : t('activity.aDocument');
  const roleFrom = from ? t('activity.roleFrom', { value: from }) : '';
  const roleTo = to ? t('activity.roleTo', { value: to }) : '';
  const quotedFrom = from ? t('activity.quotedFrom', { value: from }) : '';
  const quotedTo = to ? t('activity.quotedTo', { value: to }) : '';
  const quotedName = to ? t('activity.quotedName', { value: to }) : '';
  switch (item.action) {
    case 'MEMBER_ADDED':
      return t('activity.memberAdded', { actor, person });
    case 'MEMBER_REMOVED':
      return t('activity.memberRemoved', { actor, person });
    case 'MEMBER_ROLE_CHANGED':
      return `${t('activity.roleChanged', { actor, person })}${roleFrom}${roleTo}`;
    case 'MEMBER_LEFT':
      return t('activity.memberLeft', { actor });
    case 'INVITATION_CREATED':
      return t('activity.invitationCreated', {
        actor,
        person: email || t('activity.someoneLower'),
      });
    case 'INVITATION_REVOKED':
      return t('activity.invitationRevoked', {
        actor,
        invitation: invitationTarget(email, t),
      });
    case 'INVITATION_ACCEPTED':
      return t('activity.invitationAccepted', {
        actor,
        invitation: invitationTarget(email, t),
      });
    case 'ORGANIZATION_RENAMED':
      return `${t('activity.orgRenamed', { actor })}${quotedFrom}${quotedTo}`;
    case 'COLLECTION_CREATED':
      return `${t('activity.collectionCreated', { actor })}${quotedName}`;
    case 'COLLECTION_RENAMED':
      return `${t('activity.collectionRenamed', { actor })}${quotedFrom}${quotedTo}`;
    case 'COLLECTION_DELETED':
      return `${t('activity.collectionDeleted', { actor })}${quotedFrom}`;
    case 'DOCUMENT_UPLOADED':
      return t('activity.documentUploaded', { actor, document });
    case 'DOCUMENT_RENAMED':
      return `${t('activity.documentRenamed', { actor, document: renamedDocument })}${quotedTo}`;
    case 'DOCUMENT_DELETED':
      return t('activity.documentDeleted', { actor, document });
    case 'CONVERSATION_SHARED':
      return t('activity.conversationShared', { actor });
    case 'CONVERSATION_UNSHARED':
      return t('activity.conversationUnshared', { actor });
    case 'DOCUMENT_REVIEW_UPDATED':
      return t('activity.documentReviewUpdated', { actor, document });
    case 'DOCUMENT_REPROCESSED':
      return t('activity.documentReprocessed', { actor, document });
  }
}

function invitationTarget(email: string | undefined, t: Translator): string {
  return email
    ? t('activity.invitationFor', { email })
    : t('activity.anInvitation');
}
