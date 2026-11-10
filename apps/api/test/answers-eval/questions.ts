import type { EvalQuestion } from './metrics.js';

export const EVAL_QUESTIONS: EvalQuestion[] = [
  {
    id: 'staging-dwell',
    kind: 'single_source',
    question:
      'How long must a release stay in staging before it reaches production?',
    expected: [{ documentTitle: 'Aurora Deployment Guide', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Aurora Deployment Guide', pageNumber: 1 }],
  },
  {
    id: 'p1-first-response',
    kind: 'single_source',
    question:
      'What is the first-response target for a Priority 1 support ticket?',
    expected: [{ documentTitle: 'Helios Support SLA', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Helios Support SLA', pageNumber: 1 }],
  },
  {
    id: 'rollback-and-escalation',
    kind: 'multi_source',
    question:
      'What is the production rollback window, and when does a page escalate to the secondary on-call engineer?',
    expected: [
      { documentTitle: 'Aurora Deployment Guide', pageNumber: 2 },
      { documentTitle: 'Aurora On-Call Handbook', pageNumber: 2 },
    ],
    supporting: [
      { documentTitle: 'Aurora Deployment Guide', pageNumber: 2 },
      { documentTitle: 'Aurora On-Call Handbook', pageNumber: 2 },
    ],
  },
  {
    id: 'retention-and-deletion',
    kind: 'multi_source',
    question:
      'How long are Nimbus application logs kept, and when is a verified deletion request completed?',
    expected: [
      { documentTitle: 'Nimbus Data Retention Notice', pageNumber: 1 },
      { documentTitle: 'Nimbus Data Retention Notice', pageNumber: 2 },
    ],
    supporting: [
      { documentTitle: 'Nimbus Data Retention Notice', pageNumber: 1 },
      { documentTitle: 'Nimbus Data Retention Notice', pageNumber: 2 },
    ],
  },
  {
    id: 'invoice-terms-distractor',
    kind: 'distractor',
    question: 'What are the payment terms for a Helios invoice?',
    expected: [{ documentTitle: 'Helios Billing Policy', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Helios Billing Policy', pageNumber: 1 }],
  },
  {
    id: 'incident-review-distractor',
    kind: 'distractor',
    question:
      'Within how many business days is a post-incident review due after resolution?',
    expected: [{ documentTitle: 'Aurora On-Call Handbook', pageNumber: 3 }],
    supporting: [{ documentTitle: 'Aurora On-Call Handbook', pageNumber: 3 }],
  },
  {
    id: 'parental-leave-unanswerable',
    kind: 'unanswerable',
    question: 'What is the company parental leave policy?',
    expected: [],
    supporting: [],
  },
  {
    id: 'analytics-region-unanswerable',
    kind: 'unanswerable',
    question: 'Which cloud region hosts the analytics cluster?',
    expected: [],
    supporting: [],
  },
  {
    id: 'spanish-staging',
    kind: 'single_source',
    question:
      '¿Cuánto tiempo debe permanecer una versión en staging antes de llegar a producción?',
    expected: [{ documentTitle: 'Aurora Deployment Guide', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Aurora Deployment Guide', pageNumber: 1 }],
  },
  {
    id: 'spanish-access',
    kind: 'single_source',
    question: '¿Quién aprueba las solicitudes de acceso y en cuánto tiempo?',
    expected: [{ documentTitle: 'Manual de incorporación', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Manual de incorporación', pageNumber: 1 }],
  },
  {
    id: 'cross-language-access',
    kind: 'single_source',
    question:
      'Which team approves access requests and how long does approval take?',
    expected: [{ documentTitle: 'Manual de incorporación', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Manual de incorporación', pageNumber: 1 }],
  },
  {
    id: 'conversation-refund',
    kind: 'single_source',
    question: 'How is that refund returned?',
    history: [
      {
        question: 'What is the Helios refund window?',
        answer:
          'Helios customers can request a refund within 14 days of a charge.',
      },
    ],
    expected: [{ documentTitle: 'Helios Billing Policy', pageNumber: 2 }],
    supporting: [{ documentTitle: 'Helios Billing Policy', pageNumber: 2 }],
  },
  {
    id: 'conversation-backups',
    kind: 'single_source',
    question: 'And how long are its backups retained?',
    history: [
      {
        question: 'How long are Nimbus application logs kept?',
        answer: 'Nimbus application logs are retained for 30 days.',
      },
    ],
    expected: [
      { documentTitle: 'Nimbus Data Retention Notice', pageNumber: 1 },
    ],
    supporting: [
      { documentTitle: 'Nimbus Data Retention Notice', pageNumber: 1 },
    ],
  },
  {
    id: 'conflicting-payment-terms',
    kind: 'multi_source',
    question:
      'How do the current 2026 Helios invoice payment terms differ from the archived policy that applied through 2024?',
    expected: [
      { documentTitle: 'Helios Billing Policy', pageNumber: 1 },
      { documentTitle: 'Archived Helios Billing Policy', pageNumber: 1 },
    ],
    supporting: [
      { documentTitle: 'Helios Billing Policy', pageNumber: 1 },
      { documentTitle: 'Archived Helios Billing Policy', pageNumber: 1 },
    ],
  },
  {
    id: 'current-payment-terms',
    kind: 'distractor',
    question:
      'What are the currently effective Helios invoice payment terms in 2026?',
    expected: [{ documentTitle: 'Helios Billing Policy', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Helios Billing Policy', pageNumber: 1 }],
  },
  {
    id: 'spanish-budget-unanswerable',
    kind: 'unanswerable',
    question: '¿Cuál es el presupuesto anual para viajes del equipo?',
    expected: [],
    supporting: [],
  },
];
