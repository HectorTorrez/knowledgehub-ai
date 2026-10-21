import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerCitation, AnswerResponse } from '@knowledgehub/shared-types';
import { streamAnswer } from '~/lib/api/answers';

type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

interface AnswerStreamState {
  status: StreamStatus;
  answerStatus: AnswerResponse['status'] | null;
  text: string;
  citations: AnswerCitation[];
  error: unknown;
}

const IDLE_STATE: AnswerStreamState = {
  status: 'idle',
  answerStatus: null,
  text: '',
  citations: [],
  error: null,
};

export function useAnswerStream(organizationId: string) {
  const [state, setState] = useState<AnswerStreamState>(IDLE_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE_STATE);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((current) =>
      current.status === 'streaming' ? { ...current, status: 'done' } : current,
    );
  }, []);

  const ask = useCallback(
    async (question: string, documentId?: string, conversationId?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ ...IDLE_STATE, status: 'streaming' });

      try {
        await streamAnswer(
          organizationId,
          question,
          documentId,
          conversationId,
          (event) => {
            setState((current) => {
              switch (event.type) {
                case 'status':
                  return { ...current, answerStatus: event.status };
                case 'delta':
                  return { ...current, text: current.text + event.text };
                case 'citations':
                  return { ...current, citations: event.citations };
              }
            });
          },
          controller.signal,
        );

        setState((current) => ({ ...current, status: 'done' }));
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }

        setState((current) => ({ ...current, status: 'error', error }));
      }
    },
    [organizationId],
  );

  useEffect(() => {
    abortRef.current?.abort();
    setState(IDLE_STATE);
  }, [organizationId]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { ...state, ask, reset, cancel };
}
