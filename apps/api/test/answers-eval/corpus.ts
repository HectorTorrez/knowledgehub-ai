export interface CorpusPage {
  pageNumber: number;
  text: string;
}

export interface CorpusDocument {
  title: string;
  pages: CorpusPage[];
}

export const EVAL_CORPUS: CorpusDocument[] = [
  {
    title: 'Orion Equipment Register',
    pages: [
      {
        pageNumber: 1,
        text: 'Equipment SKU QZX-8492-MK belongs to the cobalt pressure valve. Its inspection interval is 17 weeks.',
      },
    ],
  },
  {
    title: 'Orion Field Manual',
    pages: [{
      pageNumber: 1,
      text: [
        'The Orion beacon requires a violet calibration token before activation.',
        ...Array.from({ length: 16 }, (_, index) => `Field procedure ${index + 1}: Record the local conditions and verify that the equipment is stable before continuing with routine operations.`),
        'After activation, the Orion beacon must remain in standby for 43 minutes before transmission.',
        ...Array.from({ length: 32 }, (_, index) => `Orion beacon dispatch checklist ${index + 1}: Verify the beacon settings and record the dispatch preparation status before proceeding.`),
      ].join('\n\n'),
    }],
  },
  {
    title: 'Orion Dispatch Rules',
    pages: [
      {
        pageNumber: 1,
        text: 'Orion beacon dispatch requires approval from the harbor coordinator.',
      },
    ],
  },
  {
    title: 'Aurora Deployment Guide',
    pages: [
      {
        pageNumber: 1,
        text: 'Aurora is released on Tuesdays and Thursdays. A release moves through staging for at least 24 hours before it reaches production. A code freeze runs from the last Friday of each quarter until the following Monday.',
      },
      {
        pageNumber: 2,
        text: 'A production release can be rolled back to the previous release within 15 minutes without approval. The on-call incident commander authorizes a rollback. Every rollback is recorded in the release log.',
      },
      {
        pageNumber: 3,
        text: 'Database migrations follow expand-and-contract. A destructive migration must ship at least one release after the expand step. Migrations never run automatically during a rollback.',
      },
    ],
  },
  {
    title: 'Aurora On-Call Handbook',
    pages: [
      {
        pageNumber: 1,
        text: 'Severity 1 incidents page the primary on-call engineer immediately. Severity 2 incidents are answered during business hours. Severity 3 incidents are tracked in the backlog.',
      },
      {
        pageNumber: 2,
        text: 'The primary on-call acknowledges a page within 5 minutes. If the primary does not acknowledge within 15 minutes, the page escalates to the secondary on-call engineer.',
      },
      {
        pageNumber: 3,
        text: 'A post-incident review is due within 3 business days of resolution. Reviews are blameless and focus on system causes rather than individual blame.',
      },
    ],
  },
  {
    title: 'Helios Billing Policy',
    pages: [
      {
        pageNumber: 1,
        text: 'Helios invoices are issued on the first business day of each month. Payment terms are net-30 from the invoice date. Late payments accrue 1 percent interest per month.',
      },
      {
        pageNumber: 2,
        text: 'Customers may request a refund within 14 days of a charge. Refunds are prorated for unused service. Refunds are returned to the original payment method.',
      },
    ],
  },
  {
    title: 'Helios Support SLA',
    pages: [
      {
        pageNumber: 1,
        text: 'Priority 1 support tickets receive a first response within 1 hour. Priority 2 tickets receive a first response within 4 business hours. Priority 3 tickets receive a first response within 2 business days.',
      },
      {
        pageNumber: 2,
        text: 'Support operates from 08:00 to 18:00 Eastern on business days. Support is closed on public holidays. Uptime credits begin when monthly availability falls below 99.9 percent.',
      },
    ],
  },
  {
    title: 'Nimbus Data Retention Notice',
    pages: [
      {
        pageNumber: 1,
        text: 'Nimbus application logs are retained for 30 days. Database backups are retained for 35 days. Audit records are retained for 7 years.',
      },
      {
        pageNumber: 2,
        text: 'A verified deletion request is completed within 30 days. Deletion removes primary data and lets backups expire on their normal schedule.',
      },
    ],
  },
];

export function allCorpusPages(
  corpus: CorpusDocument[] = EVAL_CORPUS,
): Array<{ documentTitle: string; pageNumber: number; text: string }> {
  return corpus.flatMap((document) =>
    document.pages.map((page) => ({
      documentTitle: document.title,
      pageNumber: page.pageNumber,
      text: page.text,
    })),
  );
}
