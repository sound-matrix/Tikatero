import { CopyCaption } from "@/components/console/copy-caption";

export function ShareKit({
  eventId,
  slug,
  caption,
}: {
  eventId: string;
  slug: string;
  caption: string;
}) {
  const text = `${caption}\n\nPost this as a collab with @tikatero_official so it reaches both audiences.`;
  return (
    <section id="share-kit" className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <h2 className="text-xl font-extrabold">Share kit</h2>
      <p>
        Use the same picture and words on your Instagram, and invite Tikatero as a collaborator.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["square", "story"] as const).map((format) => (
          <figure key={format} className="space-y-3">
            {/* The preview route is same-origin and private to this host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/console/events/${eventId}/share-kit/${format}?preview=1`}
              alt={format === "square" ? "Square post preview" : "Story preview"}
              className={`w-full rounded-2xl border border-line bg-white object-cover ${format === "story" ? "max-h-[28rem]" : "max-h-80"}`}
            />
            <a
              className="inline-flex min-h-12 items-center font-semibold text-teal underline"
              href={`/console/events/${eventId}/share-kit/${format}`}
            >
              {format === "square" ? "Download square post" : "Download story"}
            </a>
          </figure>
        ))}
      </div>
      <pre className="whitespace-pre-wrap rounded-2xl bg-soft p-4 text-sm">{text}</pre>
      <CopyCaption text={text} />
      <p>On Instagram, tap Tag people → Invite collaborator → @tikatero_official.</p>
      <p className="text-sm text-muted">File name: {slug}</p>
    </section>
  );
}
