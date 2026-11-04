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
      labelKey: 'overview.onboarding.upload' as const,
      complete: input.documents > 0,
    },
    {
      id: 'ready',
      labelKey: 'overview.onboarding.ready' as const,
      complete: input.readyDocuments > 0,
    },
    {
      id: 'ask',
      labelKey: 'overview.onboarding.ask' as const,
      complete: input.conversations > 0,
    },
    ...(input.canManageMembers
      ? [
          {
            id: 'invite',
            labelKey: 'overview.onboarding.invite' as const,
            complete: input.members >= 2 || input.invitations > 0,
          },
        ]
      : []),
  ] as const;
}
