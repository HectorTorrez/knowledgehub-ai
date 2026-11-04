import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Cookie,
  FileCheck2,
  FileLock2,
  FileText,
  Fingerprint,
  Gauge,
  KeyRound,
  Link2,
  Lock,
  MessageSquareLock,
  Minus,
  ScanSearch,
  ServerCog,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from '~/components/landing/section-heading';
import { RequestCheckpoints } from '~/components/security/request-checkpoints';
import { Button } from '~/components/ui/button';
import { CONTACT_EMAIL_HREF } from '~/lib/contact';
import { useT } from '~/lib/i18n/hooks';

const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
type Role = (typeof ROLES)[number];

const roleRows: readonly {
  key:
    'view' | 'conversations' | 'write' | 'members' | 'organization' | 'owners';
  roles: readonly Role[];
}[] = [
  { key: 'view', roles: ROLES },
  { key: 'conversations', roles: ROLES },
  { key: 'write', roles: ['OWNER', 'ADMIN', 'MEMBER'] },
  { key: 'members', roles: ['OWNER', 'ADMIN'] },
  { key: 'organization', roles: ['OWNER', 'ADMIN'] },
  { key: 'owners', roles: ['OWNER'] },
];

const fileSteps = [
  { key: 'request', icon: Link2 },
  { key: 'verify', icon: ScanSearch },
  { key: 'process', icon: FileCheck2 },
  { key: 'download', icon: Timer },
] as const;

const accountPoints = [
  { key: 'passwords', icon: Fingerprint },
  { key: 'cookies', icon: Cookie },
  { key: 'csrf', icon: KeyRound },
  { key: 'tokens', icon: Timer },
  { key: 'rateLimits', icon: Gauge },
  { key: 'headers', icon: ServerCog },
] as const;

const auditEvents = [
  { key: 'roleChanged', actor: 'MR' },
  { key: 'uploaded', actor: 'DO' },
  { key: 'invited', actor: 'MR' },
  { key: 'deleted', actor: 'JL' },
] as const;

const SAMPLE_FILES = ['onboarding', 'contract', 'handbook'] as const;

const aiPoints = [
  { key: 'scoped', icon: Lock },
  { key: 'cited', icon: BadgeCheck },
  { key: 'private', icon: MessageSquareLock },
] as const;

function SecuritySection({
  id,
  title,
  text,
  muted = false,
  children,
}: Readonly<{
  id: string;
  title: string;
  text: string;
  muted?: boolean;
  children: ReactNode;
}>) {
  return (
    <section
      id={id}
      className={muted ? 'scroll-mt-20 border-y bg-muted/30' : 'scroll-mt-20'}
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-24">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading align="start" title={title} description={text} />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function SecurityHero() {
  const t = useT();
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-gradient-to-b from-brand/10 via-brand/[0.03] to-transparent"
      />
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pt-16 pb-20 lg:grid-cols-[1fr_1fr] lg:pt-24 lg:pb-28">
        <div className="landing-rise space-y-8">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-lg shadow-brand/25">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {t('security.title')}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            {t('security.description')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/register">
                {t('security.primaryAction')}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={CONTACT_EMAIL_HREF}>{t('security.reportAction')}</a>
            </Button>
          </div>
        </div>
        <div className="landing-rise [animation-delay:150ms]">
          <RequestCheckpoints animated />
        </div>
      </div>
    </section>
  );
}

export function SecurityIsolation() {
  const t = useT();
  return (
    <SecuritySection
      id="isolation"
      muted
      title={t('security.isolation.title')}
      text={t('security.isolation.text')}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-brand/40 bg-card p-5 shadow-sm ring-1 ring-brand/15">
          <p className="flex items-center justify-between gap-2 text-sm font-semibold">
            {t('security.isolation.ownWorkspace')}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[0.7rem] font-medium text-success">
              {t('security.checkpoints.passed')}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('security.isolation.ownDocuments')}
          </p>
          <ul className="mt-4 space-y-2">
            {SAMPLE_FILES.map((file) => (
              <li
                key={file}
                className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs"
              >
                <FileText className="size-3.5 shrink-0 text-brand" />
                <span className="truncate">
                  {t(`landing.sample.files.${file}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative rounded-2xl border border-dashed bg-card/60 p-5">
          <p className="flex items-center justify-between gap-2 text-sm font-semibold text-muted-foreground">
            {t('security.isolation.otherWorkspace')}
            <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium text-foreground">
              <span className="size-1.5 rounded-full bg-destructive" />
              {t('security.checkpoints.blocked')}
            </span>
          </p>
          <ul
            aria-hidden="true"
            className="mt-9 space-y-2 opacity-40 blur-[2px]"
          >
            {[0.84, 0.7, 0.58].map((width) => (
              <li
                key={width}
                className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
              >
                <FileLock2 className="size-3.5 shrink-0" />
                <span
                  className="h-2 rounded-full bg-foreground/15"
                  style={{ width: `${width * 100}%` }}
                />
              </li>
            ))}
          </ul>
          <p className="absolute inset-x-5 top-1/2 mt-4 flex -translate-y-1/2 items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium shadow-md">
            <Lock className="size-3.5 text-destructive" />
            {t('security.isolation.denied')}
          </p>
        </div>
      </div>
    </SecuritySection>
  );
}

export function SecurityRoles() {
  const t = useT();
  return (
    <SecuritySection
      id="roles"
      title={t('security.roles.title')}
      text={t('security.roles.text')}
    >
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('security.roles.caption')}</caption>
          <thead>
            <tr className="border-b bg-muted/40">
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-muted-foreground sm:px-5"
              >
                {t('security.roles.capability')}
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="w-14 px-1 py-3 text-center text-xs font-semibold sm:w-20 sm:px-2 sm:text-sm"
                >
                  {t(`roles.${role}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {roleRows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="px-4 py-3.5 text-left font-normal sm:px-5"
                >
                  {t(`security.roles.rows.${row.key}`)}
                </th>
                {ROLES.map((role) => (
                  <td key={role} className="px-1 py-3.5 text-center sm:px-2">
                    {row.roles.includes(role) ? (
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand/10 text-brand">
                        <Check className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">
                          {t('security.roles.allowed')}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex size-6 items-center justify-center text-muted-foreground/60">
                        <Minus className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">
                          {t('security.roles.notAllowed')}
                        </span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SecuritySection>
  );
}

export function SecurityFiles() {
  const t = useT();
  return (
    <SecuritySection
      id="files"
      muted
      title={t('security.files.title')}
      text={t('security.files.text')}
    >
      <ol className="relative grid gap-6 sm:grid-cols-2">
        {fileSteps.map(({ key, icon: Icon }, index) => (
          <li key={key} className="flex gap-4">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl border bg-card text-brand shadow-sm">
              <Icon className="size-5" aria-hidden="true" />
              <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-brand text-[0.65rem] font-semibold text-brand-foreground">
                {index + 1}
              </span>
            </span>
            <div>
              <h3 className="font-semibold">
                {t(`security.files.steps.${key}.title`)}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-pretty text-muted-foreground">
                {t(`security.files.steps.${key}.text`)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <ul className="mt-10 flex flex-wrap gap-2">
        {['PDF', 'DOCX', 'Markdown', 'TXT', '≤ 25 MB', '15 min'].map(
          (label) => (
            <li
              key={label}
              className="rounded-full border bg-card px-3 py-1 text-xs font-medium tabular-nums"
            >
              {label}
            </li>
          ),
        )}
      </ul>
    </SecuritySection>
  );
}

export function SecurityAccounts() {
  const t = useT();
  return (
    <SecuritySection
      id="accounts"
      title={t('security.accounts.title')}
      text={t('security.accounts.text')}
    >
      <ul className="grid border-t sm:grid-cols-2">
        {accountPoints.map(({ key, icon: Icon }) => (
          <li
            key={key}
            className="flex gap-4 border-b py-6 sm:odd:pr-6 sm:even:border-l sm:even:pl-6"
          >
            <Icon
              className="mt-0.5 size-5 shrink-0 text-brand"
              aria-hidden="true"
            />
            <div>
              <h3 className="font-semibold">
                {t(`security.accounts.points.${key}.title`)}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t(`security.accounts.points.${key}.text`)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </SecuritySection>
  );
}

export function SecurityAudit() {
  const t = useT();
  return (
    <SecuritySection
      id="audit"
      muted
      title={t('security.audit.title')}
      text={t('security.audit.text')}
    >
      <figure
        aria-label={t('security.audit.label')}
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <ol className="divide-y">
          {auditEvents.map(({ key, actor }) => (
            <li key={key} className="flex items-center gap-3 px-5 py-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[0.7rem] font-semibold text-brand">
                {actor}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {t(`security.audit.events.${key}`)}
              </span>
              <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {t(`security.audit.times.${key}`)}
              </time>
            </li>
          ))}
        </ol>
      </figure>
    </SecuritySection>
  );
}

export function SecurityAi() {
  const t = useT();
  return (
    <SecuritySection
      id="ai"
      title={t('security.ai.title')}
      text={t('security.ai.text')}
    >
      <ul className="space-y-3">
        {aiPoints.map(({ key, icon: Icon }) => (
          <li
            key={key}
            className="flex items-center gap-4 rounded-2xl border bg-card p-5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="font-medium">
              {t(`security.ai.points.${key}`)}
            </span>
          </li>
        ))}
      </ul>
    </SecuritySection>
  );
}

export function SecurityReport() {
  const t = useT();
  return (
    <section className="mx-auto max-w-7xl px-5 pb-24">
      <div className="flex flex-col items-start gap-6 rounded-3xl bg-primary px-6 py-12 text-primary-foreground sm:px-12 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {t('security.report.title')}
          </h2>
          <p className="mt-3 opacity-85">{t('security.report.text')}</p>
        </div>
        <Button asChild size="lg" variant="secondary" className="shrink-0">
          <a href={CONTACT_EMAIL_HREF}>
            {t('security.reportAction')} <ArrowRight />
          </a>
        </Button>
      </div>
    </section>
  );
}
