import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  FileSearch,
  FileText,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from '~/components/landing/section-heading';
import { useT } from '~/lib/i18n/hooks';

const FILE_FORMATS = ['PDF', 'DOCX', 'Markdown'] as const;
const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;

function FeatureCard({
  icon: Icon,
  title,
  text,
  children,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  text: string;
  children: ReactNode;
}>) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-card">
      <div className="flex-1 border-b bg-muted/30 p-5">{children}</div>
      <div className="p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Icon className="size-5" />
          </span>
          <h3 className="font-semibold">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      </div>
    </article>
  );
}

function AnswersVisual() {
  const t = useT();
  return (
    <div aria-hidden="true" className="space-y-3 text-sm">
      <div className="space-y-2">
        <div className="h-2.5 w-11/12 rounded-full bg-foreground/10" />
        <div className="h-2.5 w-4/5 rounded-full bg-foreground/10" />
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-1/2 rounded-full bg-foreground/10" />
          <span className="rounded-md bg-brand px-1.5 text-[0.7rem] font-semibold text-brand-foreground">
            1
          </span>
        </div>
      </div>
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <p className="text-xs font-semibold text-brand">
          {t('landing.features.answers.source')}
        </p>
        <p className="mt-1 text-sm">
          <mark className="rounded bg-brand/15 px-0.5 text-foreground">
            {t('landing.features.answers.quote')}
          </mark>
        </p>
      </div>
    </div>
  );
}

function SearchVisual() {
  const t = useT();
  const results = [
    {
      name: t('landing.features.search.resultPolicy'),
      semantic: 92,
      keyword: 78,
    },
    { name: t('landing.features.search.resultFaq'), semantic: 74, keyword: 41 },
  ];
  return (
    <div aria-hidden="true" className="space-y-3 text-xs">
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-xs">
        <Search className="size-3.5 text-muted-foreground" />
        <span>{t('landing.features.search.query')}</span>
      </div>
      {results.map((result) => (
        <div key={result.name} className="rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 font-medium">
            <FileText className="size-3.5 text-brand" />
            {result.name}
          </p>
          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span>{t('landing.features.search.semantic')}</span>
            <span className="h-1.5 rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${result.semantic}%` }}
              />
            </span>
            <span>{t('landing.features.search.keyword')}</span>
            <span className="h-1.5 rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-brand/50"
                style={{ width: `${result.keyword}%` }}
              />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightsVisual() {
  const t = useT();
  const facts = [
    { label: t('landing.features.insights.factDate'), value: '2027-03-01' },
    { label: t('landing.features.insights.factOwner'), value: 'Dana Ortiz' },
    { label: t('landing.features.insights.factValue'), value: '$48,000' },
  ];
  return (
    <dl
      aria-hidden="true"
      className="divide-y rounded-lg border bg-card text-xs"
    >
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="flex items-center justify-between gap-3 px-3 py-2.5"
        >
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="font-semibold tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function WorkspacesVisual() {
  const t = useT();
  return (
    <ul aria-hidden="true" className="space-y-2 text-xs">
      {ROLES.map((role, index) => (
        <li
          key={role}
          className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
        >
          <span
            className="flex size-6 items-center justify-center rounded-full bg-brand text-[0.65rem] font-semibold text-brand-foreground"
            style={{ opacity: 1 - index * 0.2 }}
          >
            {t(`roles.${role}`).charAt(0)}
          </span>
          <span className="h-2 flex-1 rounded-full bg-foreground/10" />
          <span className="rounded-full border px-2 py-0.5 font-medium">
            {t(`roles.${role}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LandingFormats() {
  const t = useT();
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-8 sm:flex-row sm:justify-center sm:gap-8">
        <p className="text-sm text-muted-foreground">
          {t('landing.formats.title')}
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-3">
          {FILE_FORMATS.map((format) => (
            <li
              key={format}
              className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm font-medium"
            >
              <FileText className="size-4 text-brand" />
              {format}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LandingFeatures() {
  const t = useT();
  return (
    <section id="features" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5 py-24">
        <SectionHeading
          title={t('landing.features.title')}
          description={t('landing.features.description')}
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <FeatureCard
            icon={Sparkles}
            title={t('landing.features.answers.title')}
            text={t('landing.features.answers.text')}
          >
            <AnswersVisual />
          </FeatureCard>
          <FeatureCard
            icon={FileSearch}
            title={t('landing.features.search.title')}
            text={t('landing.features.search.text')}
          >
            <SearchVisual />
          </FeatureCard>
          <FeatureCard
            icon={BookOpen}
            title={t('landing.features.insights.title')}
            text={t('landing.features.insights.text')}
          >
            <InsightsVisual />
          </FeatureCard>
          <FeatureCard
            icon={Users}
            title={t('landing.features.workspaces.title')}
            text={t('landing.features.workspaces.text')}
          >
            <WorkspacesVisual />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}
