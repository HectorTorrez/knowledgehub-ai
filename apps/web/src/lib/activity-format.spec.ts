import { describe, expect, it } from 'vitest';
import type { OrganizationActivityItem } from '@knowledgehub/shared-types';
import { formatActivity } from './activity-format';
import { createTranslator } from '~/lib/i18n/translate';

const t = createTranslator('en');

const item: OrganizationActivityItem = {
  id: '1',
  action: 'DOCUMENT_RENAMED',
  actor: {
    id: '1',
    firstName: 'Ana',
    lastName: 'Lopez',
    email: 'ana@example.com',
  },
  targetType: 'document',
  targetId: '1',
  metadata: { from: 'Q3 budget', to: 'Q3 budget final' },
  createdAt: '2026-01-01',
};

describe('formatActivity', () => {
  it('formats document renames', () => {
    expect(formatActivity(item, t)).toBe(
      'Ana Lopez renamed document “Q3 budget” to “Q3 budget final”',
    );
  });
  it('formats role changes', () => {
    expect(
      formatActivity(
        {
          ...item,
          action: 'MEMBER_ROLE_CHANGED',
          metadata: { email: 'bob@x.com', from: 'MEMBER', to: 'OWNER' },
        },
        t,
      ),
    ).toBe('Ana Lopez changed the role of bob@x.com from MEMBER to OWNER');
  });
  it('handles missing actors and metadata', () => {
    expect(
      formatActivity(
        {
          ...item,
          actor: null,
          action: 'INVITATION_CREATED',
          metadata: {},
        },
        t,
      ),
    ).toBe('Someone invited someone');
  });
});
