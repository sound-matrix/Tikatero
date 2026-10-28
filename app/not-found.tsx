import { Button } from "@/components/ui/button";
import { FOOTER_CREDIT } from "@/lib/legal";

export default function NotFound() {
  return (
    <main
      id="content"
      className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center"
    >
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Page not found</h1>
      <p className="mt-3 text-muted">That link does not go anywhere on Tikatero.</p>
      <div className="mt-6">
        <Button href="/" variant="primary">
          Back to events
        </Button>
      </div>
      <p className="mt-10 text-sm text-muted">{FOOTER_CREDIT}</p>
    </main>
  );
}
