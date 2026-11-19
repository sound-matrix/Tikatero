import "server-only";
import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { mediaUrl } from "@/components/discovery/media";
import { themes } from "@/lib/events/model";
import { formatIst } from "@/lib/format";
import { socialPriceLabel, stripControls, type CaptionEvent } from "@/lib/social/caption";

export type SocialImageFormat = "square" | "story" | "last_seats";

type Assets = { regular: Buffer; bold: Buffer; logo: string };

let assets: Promise<Assets> | null = null;

function loadAssets() {
  assets ??= (async () => {
    const [regular, bold, logoFile] = await Promise.all([
      readFile(new URL("./assets/NotoSans-Regular.ttf", import.meta.url)),
      readFile(new URL("./assets/NotoSans-Bold.ttf", import.meta.url)),
      readFile(new URL("./assets/tikatero-logo-horizontal.jpg", import.meta.url)),
    ]);
    const trimmed = await sharp(logoFile).trim({ threshold: 12 }).jpeg({ quality: 90 }).toBuffer();
    return {
      regular,
      bold,
      logo: `data:image/jpeg;base64,${trimmed.toString("base64")}`,
    };
  })();
  return assets;
}

function fitTitle(title: string, max: number) {
  const clean = stripControls(title).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

async function posterSrc(posterKey: string | null) {
  const url = mediaUrl(posterKey);
  if (!url?.startsWith("https:")) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 5_000_000) return null;
    const mime = type.split(";")[0];
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderSocialImage(event: CaptionEvent, format: SocialImageFormat) {
  const story = format !== "square";
  const width = 1080;
  const height = story ? 1920 : 1080;
  const { regular, bold, logo } = await loadAssets();
  const poster = await posterSrc(event.poster_key ?? null);
  const colors = themes[(event.theme ?? "none") as keyof typeof themes] ?? themes.none;
  const place = [event.venue_name, event.city]
    .map((part) =>
      stripControls(part ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join(", ");
  const category =
    stripControls(event.category ?? "Event")
      .replace(/\s+/g, " ")
      .trim() || "Event";
  const png = new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "white",
        color: "#2D3142",
        fontFamily: "Noto Sans",
        padding: story ? 72 : 56,
      }}
    >
      {/* Satori renders plain img elements. next/image is not available here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt=""
        width={story ? 460 : 380}
        height={story ? 120 : 100}
        style={{ objectFit: "contain" }}
      />
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          width={story ? 936 : 968}
          height={story ? 860 : 430}
          style={{ objectFit: "cover", borderRadius: 28, marginTop: 36 }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: story ? 936 : 968,
            height: story ? 860 : 430,
            marginTop: 36,
            borderRadius: 28,
            background: colors.color,
            color: "white",
            fontSize: story ? 64 : 48,
            fontWeight: 700,
          }}
        >
          {category.slice(0, 40)}
        </div>
      )}
      {format === "last_seats" ? (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            marginTop: 28,
            background: "#C9A227",
            color: "#2D3142",
            fontWeight: 700,
            fontSize: story ? 36 : 30,
            padding: "10px 22px",
            borderRadius: 999,
          }}
        >
          Last few seats
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontSize: story ? 64 : 52,
          fontWeight: 700,
          lineHeight: 1.15,
          maxHeight: story ? 230 : 190,
          overflow: "hidden",
        }}
      >
        {fitTitle(event.title, story ? 90 : 72)}
      </div>
      <div style={{ display: "flex", marginTop: 18, fontSize: story ? 36 : 30 }}>
        {formatIst(event.starts_at)}
      </div>
      {place ? (
        <div
          style={{ display: "flex", marginTop: 10, fontSize: story ? 32 : 28, color: "#3d4458" }}
        >
          {place.slice(0, 120)}
        </div>
      ) : null}
      <div style={{ display: "flex", marginTop: 16, fontSize: story ? 36 : 32, fontWeight: 700 }}>
        {socialPriceLabel(event)}
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: story ? 120 : 96,
          borderRadius: 24,
          backgroundImage: "linear-gradient(90deg, #F25C54 0%, #FF9F43 100%)",
          color: "white",
          fontSize: story ? 40 : 34,
          fontWeight: 700,
        }}
      >
        Book on tikatero.com
      </div>
    </div>,
    {
      width,
      height,
      fonts: [
        { name: "Noto Sans", data: regular, weight: 400, style: "normal" },
        { name: "Noto Sans", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
  const bytes = Buffer.from(await png.arrayBuffer());
  return sharp(bytes)
    .toColorspace("srgb")
    .jpeg({ quality: 88, progressive: false, force: true })
    .toBuffer();
}
