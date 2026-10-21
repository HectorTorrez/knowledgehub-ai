import type { OrganizationRole } from '@knowledgehub/shared-types';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function formatRole(role: OrganizationRole): string {
  return role === 'OWNER' ? 'Owner' : 'Member';
}

export function formatMinorAmount(
  amountMinor: string,
  currency: string,
  scale: number,
): string {
  const value = Number(amountMinor) / 10 ** scale;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
    }).format(value);
  } catch {
    return `${value.toFixed(scale)} ${currency}`;
  }
}
