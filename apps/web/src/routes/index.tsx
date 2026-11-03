import { FREE_PLAN } from '~/lib/plans';
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router';
import { ArrowRight, BookOpen, FileSearch, Files, LockKeyhole, Sparkles, Users } from 'lucide-react';
import { Brand } from '~/components/brand';
import { Button } from '~/components/ui/button';
import { useLogin } from '~/hooks/use-auth';
import { useReportError } from '~/hooks/use-error-toast';
import { organizationsApi } from '~/lib/api/organizations';
import { sessionQuery } from '~/lib/auth/session';
import { DEMO_ACCOUNT } from '~/lib/demo-account';
import { DEFAULT_TITLE, pageHead } from '~/lib/seo';

export const Route = createFileRoute('/')({
  ssr: false,
  head: () => pageHead({ title: DEFAULT_TITLE, path: '/' }),
  beforeLoad: async ({ context, location }) => {
    if (location.hash === 'pricing') return;
    const state = await context.queryClient.fetchQuery(sessionQuery).catch(() => null);
    if (state?.status === 'authenticated') throw redirect({ to: '/organizations' });
  },
  component: LandingPage,
});

const features = [
  { icon: Sparkles, title: 'Answers you can trace', text: 'Get grounded answers with citations that point back to your sources.' },
  { icon: FileSearch, title: 'Search beyond keywords', text: 'Hybrid search brings semantic understanding and keyword precision together.' },
  { icon: BookOpen, title: 'See the bigger picture', text: 'Explore insights and facts extracted from your documents.' },
  { icon: Users, title: 'A workspace for every team', text: 'Keep organizations separate and manage access with member roles.' },
  { icon: Files, title: 'Bring your documents', text: 'Work with PDF, Word, and Markdown files in one place.' },
];

function LandingPage() {
  const login = useLogin();
  const router = useRouter();
  const reportError = useReportError();
  async function openDemo() {
    try {
      await login.mutateAsync(DEMO_ACCOUNT);
      const { organizations } = await organizationsApi.list();
      const organization = organizations.find((item) => item.name === 'Northwind Labs');
      if (organization) {
        await router.navigate({ to: '/organizations/$organizationId', params: { organizationId: organization.id } });
      } else {
        await router.navigate({ to: '/organizations' });
      }
    } catch (error) { reportError(error); }
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <nav aria-label="Main navigation" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5">
          <Brand />
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"><a className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" href="#features">Features</a><a className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" href="#how-it-works">How it works</a><a className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" href="#pricing">Pricing</a></div>
          <div className="flex items-center gap-2"><Button asChild variant="ghost"><Link to="/login">Log in</Link></Button><Button asChild><Link to="/register">Get started</Link></Button></div>
        </nav>
      </header>
      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-2 lg:py-32">
          <div className="space-y-7"><p className="text-sm font-semibold uppercase tracking-widest text-brand">Your knowledge, connected</p><h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Your documents have answers. Find them faster.</h1><p className="max-w-xl text-lg leading-relaxed text-muted-foreground">Turn your team's documents into a searchable workspace. Ask questions, discover insights, and follow every answer back to its source.</p><div className="flex flex-wrap gap-3">{import.meta.env.VITE_DEMO_ENABLED === 'true' && <Button size="lg" onClick={() => void openDemo()} disabled={login.isPending}>{login.isPending ? 'Opening demo…' : 'Try the live demo'} <ArrowRight /></Button>}<Button asChild size="lg" variant="outline"><Link to="/register">Create free account</Link></Button></div></div>
          <div className="rounded-2xl border bg-card p-4 shadow-xl sm:p-6" aria-label="Example of a cited answer"><div className="flex items-center gap-2 border-b pb-4 text-sm font-semibold"><Sparkles className="size-4 text-brand" /> Ask your workspace</div><div className="mt-6 space-y-5 text-sm"><div className="ml-auto max-w-[85%] rounded-xl bg-muted p-4">What is our approach to customer onboarding?</div><div className="space-y-3 rounded-xl border p-4 leading-relaxed"><p className="font-semibold">Answer</p><p>Our onboarding process helps customers reach their first milestone with a guided setup, a kickoff session, and a dedicated success contact. <span className="text-brand">[1]</span></p><div className="rounded-md bg-muted p-3 text-xs"><span className="font-semibold">[1] Customer onboarding guide</span><p className="mt-1 text-muted-foreground">“Each customer begins with a guided setup and kickoff…”</p></div></div><div className="rounded-lg border px-4 py-3 text-muted-foreground">Ask a question about your documents…</div></div></div>
        </section>
        <section id="features" className="border-y bg-muted/30"><div className="mx-auto max-w-7xl px-5 py-20"><h2 className="text-3xl font-semibold tracking-tight">Knowledge that works for your team</h2><p className="mt-3 text-muted-foreground">Everything you need to find and use the information you already have.</p><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-xl border bg-card p-6"><Icon className="size-6 text-brand" /><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></article>)}</div></div></section>
        <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-20"><h2 className="text-3xl font-semibold tracking-tight">How it works</h2><div className="mt-10 grid gap-8 md:grid-cols-3">{[['01', 'Create a workspace', 'Give your team a dedicated place for its knowledge.'], ['02', 'Upload documents', 'Add your files and let KnowledgeHub prepare them for search.'], ['03', 'Ask and discover', 'Get cited answers and explore insights from your sources.']].map(([number, title, text]) => <div key={number}><p className="text-sm font-semibold text-brand">{number}</p><h3 className="mt-3 text-xl font-semibold">{title}</h3><p className="mt-2 text-muted-foreground">{text}</p></div>)}</div></section>
        <section className="border-y bg-muted/30"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-16 sm:flex-row sm:gap-8"><LockKeyhole className="size-8 shrink-0 text-brand" /><div><h2 className="text-2xl font-semibold">Your workspace, your data</h2><p className="mt-3 max-w-2xl text-muted-foreground">Organizations are isolated from one another. Your documents and answers stay in your workspace, accessible to its members.</p></div></div></section>
        <section id="pricing" className="mx-auto max-w-7xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { ...FREE_PLAN, price: 'Free', href: '/register', cta: 'Get started' },
              { name: 'Team', price: 'Coming soon', features: ['Team collaboration', 'Shared knowledge'], href: '/register?plan=team', cta: 'Talk to us' },
              { name: 'Enterprise', price: 'Coming soon', features: ['Organization workspaces', 'Knowledge discovery'], href: '/register', cta: 'Talk to us' },
            ].map((plan) => (
              <article key={plan.name} className="rounded-xl border bg-card p-6">
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-3 text-muted-foreground">{plan.price}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Button asChild className="mt-6">
                  <a href={plan.href}>{plan.cta}</a>
                </Button>
              </article>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-20"><div className="rounded-2xl bg-primary p-8 text-primary-foreground sm:p-12"><h2 className="text-3xl font-semibold">Put your knowledge to work</h2><p className="mt-3 opacity-80">Create a workspace and start asking better questions.</p><Button asChild variant="secondary" className="mt-6"><Link to="/register">Get started <ArrowRight /></Link></Button></div></section>
      </main><footer className="border-t"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8"><Brand /><p className="text-sm text-muted-foreground">KnowledgeHub AI · Your team's knowledge, in one place.</p></div></footer>
    </div>
  );
}
