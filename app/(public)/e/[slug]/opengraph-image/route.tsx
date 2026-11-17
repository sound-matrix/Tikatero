import { ImageResponse } from "next/og";
import { publicEvent } from "@/lib/discovery/data";
import { formatIst } from "@/lib/format";
import { themes } from "@/lib/events/model";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const e = await publicEvent((await params).slug);
  if (!e) return new Response("Event not found", { status: 404 });
  const format = new URL(request.url).searchParams.get("format");
  const story = format === "story";
  const post = format === "post";
  const colors = themes[(e.theme ?? "none") as keyof typeof themes] ?? themes.none;
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "white",
        padding: story ? "220px 96px" : post ? "100px 80px" : 64,
        color: "#2D3142",
        flexDirection: "column",
        borderTop: `24px solid ${colors.color}`,
      }}
    >
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#087570" }}>
        TIKATERO {e.verified ? "· Verified organiser" : ""}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: story ? 100 : post ? 94 : 70,
          fontWeight: 700,
          marginTop: story ? 150 : post ? 115 : 40,
          lineHeight: 1.1,
        }}
      >
        {e.title.slice(0, 100)}
      </div>
      <div style={{ display: "flex", fontSize: 30, marginTop: 30 }}>{formatIst(e.starts_at)}</div>
      <div style={{ display: "flex", fontSize: 28, marginTop: 16 }}>
        {[e.venue_name, e.city].filter(Boolean).join(" · ")}
      </div>
      <div style={{ display: "flex", fontSize: 25, marginTop: "auto" }}>
        {e.is_free ? "Free entry" : e.organiser_name}
      </div>
    </div>,
    {
      width: story || post ? 1080 : 1200,
      height: story ? 1920 : post ? 1080 : 630,
      headers: {
        "Cache-Control": "no-store",
        ...(story || post ? { "Content-Disposition": `attachment; filename="${e.slug}-${story ? "story" : "post"}.png"` } : {}),
      },
    },
  );
}
