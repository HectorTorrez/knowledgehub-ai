export function isReviewOverdue(dueAt: Date | null, now = new Date()): boolean {
  return (
    dueAt !== null &&
    dueAt.toISOString().slice(0, 10) < now.toISOString().slice(0, 10)
  );
}
