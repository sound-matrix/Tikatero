import { EmptyState } from "@/components/ui/empty-state";

export function ShellPage({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
      <div className="mt-6">
        <EmptyState title="Nothing here yet" description={description} />
      </div>
    </main>
  );
}
