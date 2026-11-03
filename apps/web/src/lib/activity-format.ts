import type { OrganizationActivityItem } from '@knowledgehub/shared-types';

export function formatActivity(item: OrganizationActivityItem): string {
  const actor = item.actor ? `${item.actor.firstName} ${item.actor.lastName}`.trim() || item.actor.email : 'Someone';
  const { email, from, to, title } = item.metadata;
  const person = email || 'a member';
  const document = title ? `document “${title}”` : 'a document';
  switch (item.action) {
    case 'MEMBER_ADDED': return `${actor} added ${person}`;
    case 'MEMBER_REMOVED': return `${actor} removed ${person}`;
    case 'MEMBER_ROLE_CHANGED': return `${actor} changed ${email ? `${email}'s` : 'a member’s'} role${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}`;
    case 'MEMBER_LEFT': return `${actor} left the organization`;
    case 'INVITATION_CREATED': return `${actor} invited ${email || 'someone'}`;
    case 'INVITATION_REVOKED': return `${actor} revoked ${email ? `the invitation for ${email}` : 'an invitation'}`;
    case 'INVITATION_ACCEPTED': return `${actor} accepted ${email ? `the invitation for ${email}` : 'an invitation'}`;
    case 'ORGANIZATION_RENAMED': return `${actor} renamed the organization${from ? ` from “${from}”` : ''}${to ? ` to “${to}”` : ''}`;
    case 'DOCUMENT_UPLOADED': return `${actor} uploaded ${document}`;
    case 'DOCUMENT_RENAMED': return `${actor} renamed ${from ? `document “${from}”` : 'a document'}${to ? ` to “${to}”` : ''}`;
    case 'DOCUMENT_DELETED': return `${actor} deleted ${document}`;
    case 'DOCUMENT_REPROCESSED': return `${actor} reprocessed ${document}`;
  }
}
