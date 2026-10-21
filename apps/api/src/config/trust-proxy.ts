export function resolveTrustProxy(raw: string | undefined): false | number {
  if (raw === undefined || raw === 'false') {
    return false;
  }

  const hops = Number(raw);

  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(
      'TRUST_PROXY must be "false" or a positive number of proxy hops',
    );
  }

  return hops;
}
