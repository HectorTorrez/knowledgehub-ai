import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '~/lib/i18n/hooks';
import { QUESTION_MAX_LENGTH } from '~/lib/validation';

interface SpeechRecognizer extends EventTarget {
  lang: string;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
};

type DictationStatus =
  | 'idle'
  | 'listening'
  | 'finishing'
  | 'unavailable'
  | 'permission'
  | 'noSpeech'
  | 'failed';

function recognitionError(error: SpeechRecognitionErrorCode): DictationStatus {
  switch (error) {
    case 'not-allowed':
      return 'permission';
    case 'no-speech':
      return 'noSpeech';
    case 'aborted':
      return 'idle';
    default:
      return 'failed';
  }
}

export function useQuestionDictation(
  scope: string,
  question: string,
  onQuestionChange: (value: string) => void,
) {
  const locale = useLocale();
  const [state, setState] = useState<{
    scope: string;
    status: DictationStatus;
  }>({ scope, status: 'idle' });
  const session = useRef<SpeechRecognizer | null>(null);
  const draft = useRef({ question, onQuestionChange });

  if (state.scope !== scope) {
    setState({ scope, status: 'idle' });
  }

  useLayoutEffect(() => {
    draft.current = { question, onQuestionChange };
  }, [question, onQuestionChange]);

  useLayoutEffect(() => {
    return () => {
      const recognition = session.current;
      session.current = null;
      recognition?.abort();
    };
  }, [scope]);

  function setStatus(status: DictationStatus) {
    setState({ scope, status });
  }

  function toggle() {
    if (session.current) {
      setStatus('finishing');
      session.current.stop();
      return;
    }

    const browser: SpeechRecognitionWindow = window;
    const Recognition =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus('unavailable');
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.lang =
        navigator.languages.find(
          (language) => language.split('-')[0]?.toLowerCase() === locale,
        ) ?? locale;
      recognition.continuous = true;

      recognition.onresult = ({ resultIndex, results }) => {
        if (session.current !== recognition) {
          return;
        }

        const transcript = Array.from(results)
          .slice(resultIndex)
          .filter((result) => result.isFinal)
          .map((result) => result[0]?.transcript.trim())
          .filter(Boolean)
          .join(' ');
        if (!transcript) {
          return;
        }

        const current = draft.current;
        const separator =
          current.question && !/\s$/u.test(current.question) ? ' ' : '';
        const remaining =
          QUESTION_MAX_LENGTH - current.question.length - separator.length;
        const addition = transcript
          .slice(0, Math.max(0, remaining))
          .replace(/[\uD800-\uDBFF]$/u, '')
          .trimEnd();
        if (addition) {
          current.question += separator + addition;
          current.onQuestionChange(current.question);
        }
      };

      function finish(nextStatus: DictationStatus) {
        if (session.current === recognition) {
          session.current = null;
          setStatus(nextStatus);
        }
      }

      recognition.onerror = ({ error }) => finish(recognitionError(error));
      recognition.onend = () => finish('idle');
      session.current = recognition;
      setStatus('listening');
      recognition.start();
    } catch {
      session.current = null;
      setStatus('failed');
    }
  }

  return { status: state.status, toggle };
}
