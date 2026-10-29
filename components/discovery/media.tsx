import Image from "next/image";
import { publicMediaBase } from "@/lib/events/store";
import { themes } from "@/lib/events/model";
export function mediaUrl(key: string | null) {
  const base = publicMediaBase();
  if (
    !base ||
    !key ||
    !/^(poster|guest_photo)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key) ||
    key.includes("..")
  )
    return null;
  return `${base}${key.split("/").map(encodeURIComponent).join("/")}`;
}
export function EventMedia({
  title,
  posterKey,
  theme,
  priority = false,
}: {
  title: string;
  posterKey: string | null;
  theme: string | null;
  priority?: boolean;
}) {
  const src = mediaUrl(posterKey),
    colors = themes[(theme ?? "none") as keyof typeof themes] ?? themes.none;
  return (
    <div
      className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl"
      style={{ background: `linear-gradient(135deg,${colors.color},${colors.accent})` }}
    >
      {src ? (
        <Image
          src={src}
          alt={`${title} poster`}
          fill
          sizes="(max-width: 768px) 100vw, 760px"
          className="object-cover"
          priority={priority}
        />
      ) : (
        <div className="flex max-w-lg flex-col items-center gap-3 p-6 text-center text-ink">
          <span
            aria-hidden="true"
            className="rounded-full bg-white/95 px-4 py-2 text-xs font-bold tracking-[.22em]"
          >
            TIKATERO · LIVE
          </span>
          <span className="rounded-xl bg-white/95 px-5 py-3 text-2xl font-extrabold md:text-4xl">
            {title}
          </span>
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold">
            An experience to look forward to
          </span>
        </div>
      )}
    </div>
  );
}
