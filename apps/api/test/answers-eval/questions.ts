import type { EvalQuestion } from './metrics.js';

const invoice = [{ documentTitle: 'Registro de facturas', pageNumber: 1 }];
const inventory = [{ documentTitle: 'Inventario', pageNumber: 1 }];

export const EVAL_QUESTIONS: EvalQuestion[] = [
  ...[
    { id: 'sum-en', question: 'give me the total of monto', value: '$1,500.00' },
    { id: 'sum-es', question: 'dame la suma de los montos', value: '1500,00 US$' },
    { id: 'average', question: '¿cuál es el promedio del monto?', value: '300,00 US$' },
    { id: 'count', question: 'how many invoices are there?', value: '5' },
    { id: 'max', question: '¿cuál es el monto máximo?', value: '500,00 US$' },
    {
      id: 'difference',
      question: 'diferencia entre la factura F-001 y la F-002',
      value: '-100,00 US$',
    },
  ].map((item): EvalQuestion => ({
    id: item.id,
    kind: 'calculation',
    question: item.question,
    expectedValue: item.value,
    expected: invoice,
    supporting: invoice,
  })),
  {
    id: 'inventory-total',
    kind: 'calculation',
    question: 'total de unidades en inventario',
    expectedValue: '20 unidades',
    expected: inventory,
    supporting: inventory,
  },
  {
    id: 'exact-sku',
    kind: 'single_source',
    question: 'What is the inspection interval for SKU QZX-8492-MK?',
    expected: [{ documentTitle: 'Orion Equipment Register', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Orion Equipment Register', pageNumber: 1 }],
  },
  {
    id: 'follow-up',
    kind: 'single_source',
    question: 'How often is it inspected?',
    history: [{ question: 'What is SKU QZX-8492-MK?', answer: 'It is the cobalt pressure valve.' }],
    expected: [{ documentTitle: 'Orion Equipment Register', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Orion Equipment Register', pageNumber: 1 }],
  },
  {
    id: 'adjacent-chunks',
    kind: 'single_source',
    question: 'What token does the Orion beacon need before activation and how long does it stay in standby afterward?',
    expected: [{ documentTitle: 'Orion Field Manual', pageNumber: 1 }],
    supporting: [{ documentTitle: 'Orion Field Manual', pageNumber: 1 }],
  },
  {
    id: 'diverse-documents',
    kind: 'multi_source',
    question: 'What token does the Orion beacon need before activation and who approves its dispatch?',
    expected: [
      { documentTitle: 'Orion Field Manual', pageNumber: 1 },
      { documentTitle: 'Orion Dispatch Rules', pageNumber: 1 },
    ],
    supporting: [
      { documentTitle: 'Orion Field Manual', pageNumber: 1 },
      { documentTitle: 'Orion Dispatch Rules', pageNumber: 1 },
    ],
  },
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
