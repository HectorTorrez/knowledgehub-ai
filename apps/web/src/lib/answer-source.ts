export function sourceId(
  sourceIdPrefix: string | undefined,
  marker: number,
): string {
  return sourceIdPrefix === undefined
    ? `source-${marker}`
    : `${sourceIdPrefix}-source-${marker}`;
}
