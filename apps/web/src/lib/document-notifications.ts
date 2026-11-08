import type { DocumentDetailResponse } from '@knowledgehub/shared-types';
import { isNotFound } from './api/errors';
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

export function decideDocumentNotifications(
  pending: string[],
  results: PromiseSettledResult<DocumentDetailResponse>[],
) {
  const ready: DocumentDetailResponse['document'][] = [];
  const failed: DocumentDetailResponse['document'][] = [];
  const removed: string[] = [];
  const stillPending: string[] = [];
  pending.forEach((id, index) => {
    const result = results[index];
    if (
      result?.status === 'fulfilled' &&
      result.value.document.status === 'READY'
    ) {
      ready.push(result.value.document);
    } else if (
      result?.status === 'fulfilled' &&
      result.value.document.status === 'FAILED'
    ) {
      failed.push(result.value.document);
    } else if (result?.status === 'rejected' && isNotFound(result.reason)) {
      removed.push(id);
    } else {
      stillPending.push(id);
    }
  });
  return { ready, failed, removed, stillPending };
}
