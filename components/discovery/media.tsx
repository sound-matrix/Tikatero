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
  compact = false,
}: {
  title: string;
  posterKey: string | null;
  theme: string | null;
  priority?: boolean;
  compact?: boolean;
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
          sizes={
            compact
              ? "(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 360px"
              : "(max-width: 768px) 100vw, 760px"
          }
          className="object-cover"
          priority={priority}
        />
      ) : (
        <div
          className={`flex max-w-lg flex-col items-center text-center text-ink ${compact ? "gap-2 p-4" : "gap-3 p-6"}`}
        >
          <span
            aria-hidden="true"
            className={`rounded-full bg-white/95 px-4 text-xs font-bold tracking-[.22em] ${compact ? "py-1" : "py-2"}`}
          >
            TIKATERO · LIVE
          </span>
          <span
            className={`rounded-xl bg-white/95 font-extrabold ${compact ? "line-clamp-2 px-3 py-2 text-xl" : "px-5 py-3 text-2xl md:text-4xl"}`}
          >
            {title}
          </span>
          {!compact && (
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold">
              An experience to look forward to
            </span>
          )}
        </div>
      )}
    </div>
  );
}
