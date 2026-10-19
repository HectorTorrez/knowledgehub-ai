export interface ListCursor {
  createdAt: Date;
  id: string;
}

export function encodeListCursor(cursor: ListCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

export function decodeListCursor(value: string): ListCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };

    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export type ListDirection = 'asc' | 'desc';

export function listCursorFilter(
  cursor: ListCursor,
  direction: ListDirection = 'desc',
): {
  OR: [
    { createdAt: { lt: Date } | { gt: Date } },
    { createdAt: Date; id: { lt: string } | { gt: string } },
  ];
} {
  if (direction === 'asc') {
    return {
      OR: [
        { createdAt: { gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ],
    };
  }

  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}
