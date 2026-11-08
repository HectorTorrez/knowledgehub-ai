import type { ReactNode } from 'react';
import { Check, FileText, Folder, Search } from 'lucide-react';
import { FrameSection } from '~/components/landing/frame';
import { SectionHeading } from '~/components/landing/section-heading';
import { useInView } from '~/hooks/use-in-view';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

const FILE_FORMATS = [
  { label: 'PDF', extension: '.pdf' },
  { label: 'Word', extension: '.docx' },
  { label: 'PowerPoint', extension: '.pptx' },
  { label: 'Excel', extension: '.xlsx' },
  { label: 'HTML', extension: '.html' },
  { label: 'Markdown', extension: '.md' },
  { label: 'Text', extension: '.txt' },
] as const;

const UPLOAD_STEPS = ['uploaded', 'extracting', 'indexing', 'ready'] as const;

const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;

const AUDIT_EVENTS = ['roleChanged', 'uploaded', 'invited'] as const;

function FeatureCard({
  title,
  text,
  className,
  children,
}: Readonly<{
  title: string;
  text: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <article
      className={cn(
        'group flex flex-col border-r border-b transition-colors duration-300 hover:bg-card',
        className,
      )}
    >
      <div className="px-5 pt-7 sm:px-8 lg:px-10 lg:pt-9">
        <h3 className="text-xl font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 max-w-md text-[0.95rem] leading-relaxed text-muted-foreground">
          {text}
        </p>
      </div>
      <div
        className="mt-8 flex-1 px-5 pb-7 sm:px-8 lg:px-10 lg:pb-9"
        aria-hidden="true"
      >
        {children}
      </div>
    </article>
  );
}

function UploadVisual() {
  const t = useT();
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-8 shrink-0 items-end justify-center border bg-muted pb-1 font-geist-mono text-[0.55rem] font-semibold">
          PDF
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {t('landing.sample.files.contract')}
          </p>
          <p className="text-xs text-muted-foreground">1.1 MB</p>
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-2">
        {UPLOAD_STEPS.map((step, index) => (
          <li key={step}>
            <span className="block h-0.5 overflow-hidden bg-border">
              {index < 3 && (
                <span
                  className={cn('block h-full bg-brand', inView && 'kh-grow')}
                  style={{ animationDelay: `${index * 450}ms` }}
                />
              )}
            </span>
            <span
              style={{ animationDelay: `${index * 450 + 250}ms` }}
              className={cn(
                'mt-2 flex items-center gap-1 text-[0.7rem] leading-tight',
                inView && 'kh-fade',
                index < 3 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {index < 2 && <Check className="size-3 shrink-0 text-brand" />}
              {index === 2 && (
                <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand" />
              )}
              {t(`landing.features.upload.steps.${step}`)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SearchVisual() {
  const t = useT();
  const results = [
    {
      text: t('landing.features.search.result1'),
      file: t('landing.sample.files.contract'),
      page: 4,
    },
    {
      text: t('landing.features.search.result2'),
      file: t('landing.sample.files.handbook'),
      page: 18,
    },
  ];
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
        <Search className="size-4 text-muted-foreground" />
        <span className={cn(inView && 'kh-type')}>
          {t('landing.features.search.query')}
        </span>
        <span className="kh-caret -ml-1.5 h-4 w-px bg-foreground" />
      </div>
      {results.map((result, index) => (
        <div
          key={result.file}
          style={{ animationDelay: `${1000 + index * 140}ms` }}
          className={cn(
            'rounded-lg border bg-background px-3 py-2.5',
            inView && 'kh-rise',
          )}
        >
          <p className="text-[0.8rem] leading-snug">{result.text}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <FileText className="size-3" />
            <span className="truncate">{result.file}</span>
            <span aria-hidden="true">·</span>
            {t('landing.sample.pageOf', { page: result.page })}
          </p>
        </div>
      ))}
    </div>
  );
}

function CollectionsVisual() {
  const t = useT();
  const collections = [
    { key: 'sales', count: 12 },
    { key: 'support', count: 31 },
    { key: 'legal', count: 7 },
  ] as const;
  return (
    <ul className="divide-y rounded-lg border bg-background text-sm">
      {collections.map(({ key, count }) => (
        <li key={key} className="flex items-center gap-2.5 px-3 py-2.5">
          <Folder className="size-4 text-brand" />
          <span className="flex-1 font-medium">
            {t(`landing.features.collections.${key}`)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('landing.features.collections.documents', { count })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InsightsVisual() {
  const t = useT();
  const stats = [
    { key: 'asked', value: '248', width: 100 },
    { key: 'helpful', value: '191', width: 77 },
    { key: 'unanswered', value: '9', width: 4 },
  ] as const;
  const [ref, inView] = useInView<HTMLDListElement>();
  return (
    <dl
      ref={ref}
      className="space-y-3 rounded-lg border bg-background p-4 text-sm"
    >
      {stats.map((stat, index) => (
        <div key={stat.key}>
          <div className="flex items-baseline justify-between">
            <dt className="text-muted-foreground">
              {t(`landing.features.insights.${stat.key}`)}
            </dt>
            <dd className="font-semibold tabular-nums">{stat.value}</dd>
          </div>
          <span className="mt-1.5 block h-0.5 bg-border">
            <span
              className={cn('block h-full bg-brand', inView && 'kh-grow')}
              style={{
                width: `${stat.width}%`,
                animationDelay: `${index * 140}ms`,
              }}
            />
          </span>
        </div>
      ))}
    </dl>
  );
}

function RolesVisual() {
  const t = useT();
  const people = ['DO', 'MR', 'JL', 'SK'];
  return (
    <ul className="divide-y rounded-lg border bg-background text-sm">
      {ROLES.map((role, index) => (
        <li key={role} className="flex items-center gap-2.5 px-3 py-2">
          <span className="flex size-6 items-center justify-center border bg-muted text-[0.62rem] font-semibold">
            {people[index]}
          </span>
          <span className="flex-1 text-muted-foreground">
            {people[index].toLowerCase()}@northwind.dev
          </span>
          <span className="rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium">
            {t(`roles.${role}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AuditVisual() {
  const t = useT();
  const [ref, inView] = useInView<HTMLOListElement>();
  return (
    <ol ref={ref} className="divide-y rounded-lg border bg-background text-sm">
      {AUDIT_EVENTS.map((event, index) => (
        <li
          key={event}
          style={{ animationDelay: `${index * 160}ms` }}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5',
            inView && 'kh-rise',
          )}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-brand" />
          <span className="min-w-0 flex-1 truncate">
            {t(`security.audit.events.${event}`)}
          </span>
          <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {t(`security.audit.times.${event}`)}
          </time>
        </li>
      ))}
    </ol>
  );
}

export function LandingFormats() {
  const t = useT();
  return (
    <FrameSection>
      <div className="overflow-hidden">
        <div className="-mr-px -mb-px grid grid-cols-2 md:grid-cols-6">
          <div className="col-span-2 flex flex-col justify-between gap-3 border-r border-b px-5 py-6 sm:px-8 lg:px-10">
            <p className="text-sm font-medium">{t('landing.formats.title')}</p>
            <p className="text-sm text-muted-foreground">
              {t('landing.formats.limit')}
            </p>
          </div>
          {FILE_FORMATS.map((format) => (
            <div
              key={format.label}
              className="flex items-end justify-between gap-2 border-r border-b px-5 py-6 sm:px-6"
            >
              <span className="text-2xl font-semibold tracking-[-0.03em]">
                {format.label}
              </span>
              <span className="font-geist-mono text-xs text-muted-foreground">
                {format.extension}
              </span>
            </div>
          ))}
        </div>
      </div>
    </FrameSection>
  );
}

export function LandingFeatures() {
  const t = useT();
  return (
    <FrameSection id="features">
      <div className="px-5 pt-20 pb-14 sm:px-8 lg:px-10 lg:pt-28 lg:pb-16">
        <SectionHeading
          align="start"
          title={t('landing.features.title')}
          description={t('landing.features.description')}
        />
      </div>
      <div className="overflow-hidden border-t">
        <div className="-mr-px -mb-px grid md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            className="md:col-span-2"
            title={t('landing.features.upload.title')}
            text={t('landing.features.upload.text')}
          >
            <UploadVisual />
          </FeatureCard>
          <FeatureCard
            className="lg:row-span-2"
            title={t('landing.features.search.title')}
            text={t('landing.features.search.text')}
          >
            <SearchVisual />
          </FeatureCard>
          <FeatureCard
            title={t('landing.features.collections.title')}
            text={t('landing.features.collections.text')}
          >
            <CollectionsVisual />
          </FeatureCard>
          <FeatureCard
            title={t('landing.features.insights.title')}
            text={t('landing.features.insights.text')}
          >
            <InsightsVisual />
          </FeatureCard>
          <FeatureCard
            title={t('landing.features.roles.title')}
            text={t('landing.features.roles.text')}
          >
            <RolesVisual />
          </FeatureCard>
          <FeatureCard
            className="md:col-span-2"
            title={t('landing.features.audit.title')}
            text={t('landing.features.audit.text')}
          >
            <AuditVisual />
          </FeatureCard>
        </div>
      </div>
    </FrameSection>
  );
}
