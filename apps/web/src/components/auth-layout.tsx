import { MessageSquareText, ShieldCheck, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from '~/components/brand';
import { useT } from '~/lib/i18n/provider';

export function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  const t = useT();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12 pb-[max(3rem,env(safe-area-inset-bottom))] lg:grid lg:grid-cols-2 lg:items-stretch lg:p-0">
      <div className="hidden flex-col justify-between bg-brand p-10 text-brand-foreground lg:flex lg:min-h-dvh">
        <Brand inverted />
        <div className="space-y-8">
          <h1 className="max-w-md text-4xl font-semibold tracking-tight">
            {t('auth.layout.title')}
          </h1>
          <ul className="space-y-4">
            <li className="flex items-center gap-3">
              <Upload className="size-5" />
              {t('auth.layout.upload')}
            </li>
            <li className="flex items-center gap-3">
              <MessageSquareText className="size-5" />
              {t('auth.layout.ask')}
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-5" />
              {t('auth.layout.isolation')}
            </li>
          </ul>
        </div>
        <p className="text-sm text-brand-foreground/70">KnowledgeHub AI</p>
      </div>
      <div className="flex w-full items-center justify-center lg:px-4 lg:py-12">
        <div className="w-full max-w-sm space-y-6">{children}</div>
      </div>
    </main>
  );
}
