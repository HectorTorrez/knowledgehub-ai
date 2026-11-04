export function onboardingSteps(input: {
  documents: number;
  readyDocuments: number;
  conversations: number;
  members: number;
  invitations: number;
  canManageMembers: boolean;
}) {
  return [
    {
      id: 'upload',
      labelKey: 'overview.onboarding.upload',
      complete: input.documents > 0,
    },
    {
      id: 'ready',
      labelKey: 'overview.onboarding.ready',
      complete: input.readyDocuments > 0,
    },
    {
      id: 'ask',
      labelKey: 'overview.onboarding.ask',
      complete: input.conversations > 0,
    },
    ...(input.canManageMembers
      ? [
          {
            id: 'invite',
            labelKey: 'overview.onboarding.invite',
            complete: input.members >= 2 || input.invitations > 0,
          },
        ]
      : []),
  ] as const;
}
