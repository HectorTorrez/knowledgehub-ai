import { describe, expect, it } from 'vitest';
import { onboardingSteps } from './onboarding';

describe('onboardingSteps', () => {
  it('tracks each milestone and accepts an invitation as a teammate', () => {
    const steps = onboardingSteps({ documents: 1, readyDocuments: 0, conversations: 1, members: 1, invitations: 1, canManageMembers: true });
    expect(steps.map((step) => step.complete)).toEqual([true, false, true, true]);
  });
  it('omits the invitation step for members', () => {
    expect(onboardingSteps({ documents: 0, readyDocuments: 0, conversations: 0, members: 1, invitations: 0, canManageMembers: false })).toHaveLength(3);
  });
});
