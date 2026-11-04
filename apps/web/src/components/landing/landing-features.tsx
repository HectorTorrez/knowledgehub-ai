import type { LucideIcon } from 'lucide-react';
import { BookOpen, FileSearch, Files, Sparkles, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from '~/components/landing/section-heading';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

const FILE_FORMATS = ['PDF', 'DOCX', 'Markdown'] as const;

const featureShots = {
  answers: { src: '/landing/answers.png', width: 1400, height: 840 },
  search: { src: '/landing/search.png', width: 2272, height: 1316 },
  documents: { src: '/landing/documents.png', width: 2272, height: 794 },
  members: { src: '/landing/members.png', width: 2272, height: 734 },
  usage: { src: '/landing/usage.png', width: 2272, height: 856 },
} as const;

function FeatureShot({
  shot,
}: Readonly<{ shot: (typeof featureShots)[keyof typeof featureShots] }>) {
  return (
    <img
      src={shot.src}
      alt=""
      width={shot.width}
      height={shot.height}
      loading="lazy"
      decoding="async"
      className="w-full rounded-lg border bg-background shadow-sm"
    />
  );
}

function FeatureCard({
  icon: Icon,
  title,
  text,
  className,
  children,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  text: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg hover:shadow-brand/5',
        className,
      )}
    >
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
              <Files className="size-4 text-brand" />
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
          eyebrow={t('landing.features.eyebrow')}
          title={t('landing.features.title')}
          description={t('landing.features.description')}
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <FeatureCard
            icon={Sparkles}
            title={t('landing.features.answers.title')}
            text={t('landing.features.answers.text')}
            className="lg:col-span-3"
          >
            <FeatureShot shot={featureShots.answers} />
          </FeatureCard>
          <FeatureCard
            icon={FileSearch}
            title={t('landing.features.search.title')}
            text={t('landing.features.search.text')}
            className="lg:col-span-3"
          >
            <FeatureShot shot={featureShots.search} />
          </FeatureCard>
          <FeatureCard
            icon={BookOpen}
            title={t('landing.features.insights.title')}
            text={t('landing.features.insights.text')}
            className="lg:col-span-2"
          >
            <FeatureShot shot={featureShots.usage} />
          </FeatureCard>
          <FeatureCard
            icon={Users}
            title={t('landing.features.workspaces.title')}
            text={t('landing.features.workspaces.text')}
            className="lg:col-span-2"
          >
            <FeatureShot shot={featureShots.members} />
          </FeatureCard>
          <FeatureCard
            icon={Files}
            title={t('landing.features.documents.title')}
            text={t('landing.features.documents.text')}
            className="md:col-span-2 lg:col-span-2"
          >
            <FeatureShot shot={featureShots.documents} />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}
