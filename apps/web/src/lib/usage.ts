export function usageProgress(used: number, limit: number | null) {
  if (limit === null) return { value: 0, tone: 'normal' as const };
  const percentage = limit <= 0 ? 100 : Math.max(0, (used / limit) * 100);
  return {
    value: Math.min(100, percentage),
    tone:
      percentage >= 100
        ? ('destructive' as const)
        : percentage >= 80
          ? ('warning' as const)
          : ('normal' as const),
  };
}
