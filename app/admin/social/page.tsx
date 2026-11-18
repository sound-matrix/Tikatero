import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/admin/access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatIst } from "@/lib/format";
import { isoOffset } from "@/lib/social/window";
import { metaConfigured, missingMetaEnv } from "@/lib/social/meta";
import { platformLabel, postFilters, postKindLabel, postStatusLabel } from "@/lib/social/labels";
import { socialImageUrl } from "@/lib/social/store";
import {
  checkMetaConnection,
  queueSocialEvent,
  retrySocialPost,
  saveSocialSettings,
  skipSocialPost,
  updateSocialCaption,
} from "./actions";

export const metadata: Metadata = { title: "Social posts" };

const statuses = new Set(postFilters.map((item) => item.status));

type Search = {
  status?: string;
  page?: string;
  settings?: string;
  meta?: string;
  action?: string;
  page_name?: string;
  ig?: string;
  expires?: string;
  data_expires?: string;
  pageName?: string;
};

export default async function SocialAdminPage({
  searchParams,
}: {
  searchParams: Promise<Search & { page?: string }>;
}) {
  const query = await searchParams;
  const { account, client } = await requireStaff();
  const admin = account.profile.role === "admin";
  const status = statuses.has(query.status as (typeof postFilters)[number]["status"])
    ? (query.status as (typeof postFilters)[number]["status"])
    : "queued";
  const page = Math.min(100, Math.max(1, Number(query.page) || 1));
  const since = isoOffset(-24);
  const soon = isoOffset(3);
  const [settingsResult, postsResult, countResult, liveResult] = await Promise.all([
    client.from("platform_social_settings").select("*").eq("id", true).single(),
    client
      .from("social_posts")
      .select(
        "id,event_id,platform,kind,status,caption,image_path,error,skipped_reason,attempts,next_attempt_at,permalink",
        { count: "exact" },
      )
      .eq("status", status)
      .order("next_attempt_at", { ascending: true })
      .range((page - 1) * 25, page * 25 - 1),
    client
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("platform", "instagram")
      .eq("status", "posted")
      .gt("posted_at", since),
    client
      .from("discovery_events")
      .select("id,title,slug,starts_at,published_at")
      .gt("starts_at", soon)
      .order("starts_at", { ascending: true })
      .limit(40),
  ]);
  if (
    settingsResult.error ||
    !settingsResult.data ||
    postsResult.error ||
    countResult.error ||
    liveResult.error
  ) {
    throw new Error("Social posts could not be loaded.");
  }
  const settings = settingsResult.data;
  const posts = postsResult.data ?? [];
  const eventIds = [...new Set(posts.map((post) => post.event_id))];
  const liveIds = (liveResult.data ?? []).map((event) => event.id);
  const [eventsResult, discoveryResult, postedResult] = await Promise.all([
    eventIds.length
      ? client
          .from("events")
          .select("id,title,slug,status,hidden_at,is_unlisted")
          .in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? client.from("discovery_events").select("id").in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    liveIds.length
      ? client.from("social_posts").select("event_id").in("event_id", liveIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsResult.error || discoveryResult.error || postedResult.error) {
    throw new Error("Social posts could not be loaded.");
  }
  const events = new Map((eventsResult.data ?? []).map((event) => [event.id, event]));
  const stillLive = new Set((discoveryResult.data ?? []).map((event) => event.id));
  const alreadyPosted = new Set((postedResult.data ?? []).map((post) => post.event_id));
  const unposted = (liveResult.data ?? []).filter((event) => !alreadyPosted.has(event.id));
  const pages = Math.max(1, Math.ceil((postsResult.count ?? 0) / 25));
  const missing = missingMetaEnv();
  const connected = metaConfigured();
  const shownPage = query.page_name ?? "";
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">Social posts</h1>
      <Card className="space-y-3">
        <h2 id="social-setup" className="text-xl font-bold">
          {connected ? "Connected" : "Not set up yet"}
        </h2>
        {missing.length ? (
          <p>
            Missing: <span className="font-semibold">{missing.join(", ")}</span>
          </p>
        ) : (
          <p>The names Tikatero needs are set. Nothing here shows the secret values.</p>
        )}
        <p>
          Instagram posts in the last 24 hours: {countResult.count ?? 0} of {settings.ig_daily_cap}
        </p>
        {query.meta === "ok" && (
          <p role="status">
            Working. Page: {shownPage || "Tikatero"}. Instagram: @{query.ig || "tikatero_official"}.
            Token expiry: {query.expires || "Not checked"}.
            {query.data_expires ? ` Data access: ${query.data_expires}.` : ""}
          </p>
        )}
        {query.meta === "error" && (
          <p role="alert" className="font-semibold text-danger">
            Meta login needs fixing. Check the token on this page.
          </p>
        )}
        {query.meta === "missing" && <p role="status">Not set up yet.</p>}
        {query.meta === "rate" && <p role="status">Please wait and try the check again later.</p>}
        <form action={checkMetaConnection}>
          <Button type="submit" variant="trust">
            Check Meta login
          </Button>
        </form>
      </Card>
      <Card className="space-y-3">
        <h2 id="social-switch" className="text-xl font-bold">
          Auto-posting is {settings.autopost_paused ? "paused" : "on"}
        </h2>
        <p className="text-sm text-muted">
          Posts go out between {settings.post_window_start.slice(0, 5)} and{" "}
          {settings.post_window_end.slice(0, 5)} IST. Older events stay off this list until someone
          posts them by hand.
        </p>
        {query.settings === "saved" && <p role="status">Social settings saved.</p>}
        {query.settings === "error" && (
          <p role="alert" className="font-semibold text-danger">
            Those settings could not be saved. Check the times, the daily limit and the reason.
          </p>
        )}
        {admin ? (
          <form action={saveSocialSettings} className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 font-semibold">
              Auto-posting
              <select
                name="paused"
                defaultValue={settings.autopost_paused ? "yes" : "no"}
                className="min-h-12 rounded-xl border-[1.5px] border-line px-3"
              >
                <option value="yes">Paused</option>
                <option value="no">On</option>
              </select>
            </label>
            <label className="grid gap-1 font-semibold">
              Daily Instagram limit
              <input
                name="cap"
                type="number"
                min={1}
                max={50}
                required
                defaultValue={settings.ig_daily_cap}
                className="min-h-12 rounded-xl border-[1.5px] border-line px-3"
              />
            </label>
            <label className="grid gap-1 font-semibold">
              First post time (IST)
              <input
                name="window_start"
                type="time"
                required
                defaultValue={settings.post_window_start.slice(0, 5)}
                className="min-h-12 rounded-xl border-[1.5px] border-line px-3"
              />
            </label>
            <label className="grid gap-1 font-semibold">
              Last post time (IST)
              <input
                name="window_end"
                type="time"
                required
                defaultValue={settings.post_window_end.slice(0, 5)}
                className="min-h-12 rounded-xl border-[1.5px] border-line px-3"
              />
            </label>
            <label className="grid gap-1 font-semibold md:col-span-2">
              Reason
              <input
                name="reason"
                required
                maxLength={300}
                className="min-h-12 rounded-xl border-[1.5px] border-line px-3"
              />
            </label>
            <Button type="submit" variant="primary">
              Save auto-posting
            </Button>
          </form>
        ) : (
          <p>Only an admin can change these settings.</p>
        )}
      </Card>
      {query.action === "saved" && <p role="status">Updated.</p>}
      {query.action === "error" && (
        <p role="alert" className="font-semibold text-danger">
          That change could not be saved.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {postFilters.map((filter) => (
          <Link
            key={filter.status}
            href={`/admin/social?status=${filter.status}`}
            className={`rounded-full border px-4 py-2 font-semibold ${status === filter.status ? "border-transparent bg-ink text-white" : "border-line"}`}
            aria-current={status === filter.status ? "page" : undefined}
          >
            {filter.label}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-soft">
            <tr>
              <th className="px-3 py-3">Event</th>
              <th className="px-3 py-3">Where</th>
              <th className="px-3 py-3">Kind</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Next try</th>
              <th className="px-3 py-3">Tries</th>
              <th className="px-3 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const event = events.get(post.event_id);
              const preview = socialImageUrl(post.image_path);
              const offline = post.status === "posted" && !stillLive.has(post.event_id);
              return (
                <tr key={post.id} className="border-t border-line align-top">
                  <td className="px-3 py-3">
                    <Link
                      className="font-semibold text-teal underline"
                      href={`/admin/events/${post.event_id}`}
                    >
                      {event?.title ?? "Event"}
                    </Link>
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview}
                        alt=""
                        className="mt-2 h-16 w-16 rounded-lg object-cover"
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{platformLabel[post.platform]}</td>
                  <td className="px-3 py-3">{postKindLabel[post.kind]}</td>
                  <td className="px-3 py-3 font-semibold">{postStatusLabel[post.status]}</td>
                  <td className="px-3 py-3">
                    {post.next_attempt_at ? formatIst(post.next_attempt_at) : ""}
                  </td>
                  <td className="px-3 py-3">{post.attempts}/5</td>
                  <td className="px-3 py-3">
                    <p>{post.error || post.skipped_reason || ""}</p>
                    {post.permalink ? (
                      <a className="font-semibold text-teal underline" href={post.permalink}>
                        View post
                      </a>
                    ) : null}
                    {offline && (
                      <p className="mt-2 font-semibold">
                        This event is no longer live. Remove the post by hand in Instagram/Facebook.
                      </p>
                    )}
                    {(post.status === "failed" || post.status === "skipped") && (
                      <form action={retrySocialPost} className="mt-2">
                        <input type="hidden" name="id" value={post.id} />
                        <Button type="submit">Retry</Button>
                      </form>
                    )}
                    {(post.status === "queued" || post.status === "failed") && (
                      <form action={skipSocialPost} className="mt-2 grid gap-2">
                        <input type="hidden" name="id" value={post.id} />
                        <input
                          name="reason"
                          required
                          maxLength={300}
                          placeholder="Reason"
                          aria-label="Reason to skip"
                          className="min-h-12 rounded-xl border border-line px-3"
                        />
                        <Button type="submit">Skip</Button>
                      </form>
                    )}
                    {post.status === "queued" && (
                      <form action={updateSocialCaption} className="mt-2 grid gap-2">
                        <input type="hidden" name="id" value={post.id} />
                        <textarea
                          name="caption"
                          required
                          maxLength={2200}
                          defaultValue={post.caption ?? ""}
                          aria-label="Caption"
                          className="min-h-24 rounded-xl border border-line p-3"
                        />
                        <Button type="submit">Edit caption</Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!posts.length && (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={7}>
                  Nothing in this list.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex gap-4" aria-label="Social post pages">
          {page > 1 && (
            <Link
              href={`/admin/social?status=${status}&page=${page - 1}`}
              className="font-semibold underline"
            >
              Previous
            </Link>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={`/admin/social?status=${status}&page=${page + 1}`}
              className="font-semibold underline"
            >
              Next
            </Link>
          )}
        </nav>
      )}
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Live events not posted yet</h2>
        {unposted.length ? (
          <ul className="space-y-3">
            {unposted.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
              >
                <span>
                  <span className="font-semibold">{event.title}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {formatIst(event.starts_at)}
                  </span>
                </span>
                <form action={queueSocialEvent}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <Button type="submit" variant="primary" disabled={settings.autopost_paused}>
                    Post this event
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">
            Every live event already has a social post, or none are coming up.
          </p>
        )}
      </Card>
    </main>
  );
}
