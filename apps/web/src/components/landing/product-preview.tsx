import {
  ArrowUp,
  BadgeCheck,
  FileText,
  FileType2,
  Hash,
  Search,
  Sparkles,
} from 'lucide-react';
import { useT } from '~/lib/i18n/hooks';

function Citation({ number }: Readonly<{ number: number }>) {
  return (
    <span className="mx-0.5 inline-flex size-5 items-center justify-center rounded-md bg-brand/10 align-text-top text-[0.7rem] font-semibold text-brand">
      {number}
    </span>
  );
}

export function ProductPreview() {
  const t = useT();
  const documents = [
    {
      icon: FileText,
      name: t('landing.sample.documentOnboarding'),
      active: true,
    },
    {
      icon: FileType2,
      name: t('landing.sample.documentHandbook'),
      active: false,
    },
    { icon: Hash, name: t('landing.sample.documentNotes'), active: false },
  ];
  return (
    <figure aria-label={t('landing.sample.label')} className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand/25 via-brand/5 to-transparent blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-brand/10">
        <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
          <div aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {t('landing.sample.workspace')}
            <span className="mx-1.5 opacity-50">/</span>
            <span className="font-medium text-foreground">
              {t('landing.sample.page')}
            </span>
          </p>
        </div>
        <div className="grid sm:grid-cols-[11rem_1fr]">
          <aside className="hidden border-r bg-muted/20 p-3 sm:block">
            <p className="px-2 pb-2 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {t('landing.sample.documents')}
            </p>
            <ul className="space-y-1">
              {documents.map(({ icon: Icon, name, active }) => (
                <li
                  key={name}
                  className={
                    active
                      ? 'flex items-center gap-2 rounded-md bg-background px-2 py-1.5 text-xs font-medium shadow-xs'
                      : 'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground'
                  }
                >
                  <Icon className="size-3.5 shrink-0 text-brand" />
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ul>
          </aside>
          <div className="space-y-4 p-4 text-sm sm:p-5">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">
              {t('landing.sample.question')}
            </p>
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <span className="flex size-6 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Sparkles className="size-3.5" />
                </span>
                {t('landing.sample.answer')}
              </p>
              <p className="leading-relaxed">
                {t('landing.sample.textLead')}
                <Citation number={1} />. {t('landing.sample.textTail')}
                <Citation number={2} />.
              </p>
              <div className="space-y-2">
                <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('landing.sample.sources')}
                </p>
                <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold">
                    <Citation number={1} />
                    {t('landing.sample.sourceOnboarding')}
                  </p>
                  <p className="mt-1.5 border-l-2 border-brand/40 pl-2 text-xs text-muted-foreground">
                    {t('landing.sample.quote')}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold">
                    <Citation number={2} />
                    {t('landing.sample.sourceHandbook')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border bg-background py-1.5 pr-1.5 pl-4 text-muted-foreground">
              <span className="flex-1 truncate">
                {t('landing.sample.placeholder')}
              </span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ArrowUp className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="absolute -top-4 -right-2 hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-lg sm:flex lg:-right-6">
        <BadgeCheck className="size-4 text-success" />
        {t('landing.sample.grounded')}
      </p>
      <p className="absolute -bottom-4 -left-2 hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-lg sm:flex lg:-left-6">
        <Search className="size-4 text-brand" />
        {t('landing.sample.searched')}
      </p>
    </figure>
  );
}
