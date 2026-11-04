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
      label: 'Upload your first document',
      complete: input.documents > 0,
    },
    {
      id: 'ready',
      label: 'Wait until it’s Ready',
      complete: input.readyDocuments > 0,
    },
    {
      id: 'ask',
      label: 'Ask your first question',
      complete: input.conversations > 0,
    },
    ...(input.canManageMembers
      ? [
          {
            id: 'invite',
            label: 'Invite a teammate',
            complete: input.members >= 2 || input.invitations > 0,
          },
        ]
      : []),
  ];
}
