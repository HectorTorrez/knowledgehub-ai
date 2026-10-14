import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold tracking-tight">KnowledgeHub AI</h1>
      <p className="mt-2 text-muted-foreground">
        The TanStack Start frontend is running.
      </p>
    </main>
  );
}
