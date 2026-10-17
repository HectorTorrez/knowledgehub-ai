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
];
