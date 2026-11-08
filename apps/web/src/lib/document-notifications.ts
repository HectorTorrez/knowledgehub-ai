import { createContext, useContext } from 'react';

export const TrackingContext = createContext<(id: string) => void>(() => {});
const preferenceKey = 'document-browser-notifications';

export function useTrackDocument() {
  return useContext(TrackingContext);
}

export function browserNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(preferenceKey) === 'true';
  } catch {
    return false;
  }
}

export function setBrowserNotificationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(preferenceKey, String(enabled));
  } catch {
    return;
  }
}

export function readTrackedDocuments(organizationId: string): string[] {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`tracked-documents:${organizationId}`) ?? '[]',
    );
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeTrackedDocuments(
  organizationId: string,
  ids: string[],
): void {
  try {
    sessionStorage.setItem(
      `tracked-documents:${organizationId}`,
      JSON.stringify(ids),
    );
  } catch {
    return;
  }
}
