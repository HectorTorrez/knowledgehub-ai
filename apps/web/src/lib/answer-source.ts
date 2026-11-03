export function sourceId(
  sourceIdPrefix: string | undefined,
  marker: number,
): string {
  return sourceIdPrefix === undefined
    ? `source-${marker}`
    : `${sourceIdPrefix}-source-${marker}`;
}

export function passageSearch(page?: number, quote?: string): { page?: number; quote?: string } {
  return { page, quote };
}
