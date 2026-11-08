export function hasTenantScope(where: unknown): boolean {
  if (!where || typeof where !== 'object' || Array.isArray(where)) return false;

  const filter = where as Record<string, unknown>;
  if (
    typeof filter.organizationId === 'string' &&
    filter.organizationId.length > 0
  ) {
    return true;
  }

  const and = filter.AND;
  return Array.isArray(and) ? and.some(hasTenantScope) : hasTenantScope(and);
}
