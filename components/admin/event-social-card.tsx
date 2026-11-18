import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveEventSocial } from "@/app/admin/social/actions";
import { platformLabel, postKindLabel, postStatusLabel } from "@/lib/social/labels";

type Post = {
  id: string;
  platform: "instagram" | "facebook";
  kind: "feed" | "story" | "last_seats";
  status: keyof typeof postStatusLabel;
  permalink: string | null;
};

export function EventSocialCard({
  eventId,
  autopost,
  isTest,
  collaborator,
  posts,
  notice,
  error,
}: {
  eventId: string;
  autopost: boolean;
  isTest: boolean | null;
  collaborator: string | null;
  posts: Post[];
  notice?: string;
  error?: string;
}) {
  return (
    <section id="tikatero-social">
      <Card className="space-y-4">
        <h2 className="text-xl font-extrabold">Tikatero social</h2>
        <p className="text-sm text-muted">
          When this event is live, Tikatero can post it once to Instagram and Facebook.
        </p>
        {notice === "saved" && <p role="status">Social settings saved.</p>}
        {error === "error" && (
          <p role="alert" className="font-semibold text-danger">
            Those social settings could not be saved. Check the Instagram name and the reason.
          </p>
        )}
        <form action={saveEventSocial} className="space-y-4">
          <input type="hidden" name="event_id" value={eventId} />
          <label className="flex min-h-12 items-center gap-3 font-semibold">
            <input
              type="checkbox"
              name="autopost"
              value="yes"
              defaultChecked={autopost}
              className="size-5 shrink-0 accent-teal"
            />
            Post to Tikatero social
          </label>
          <label className="grid gap-1 font-semibold">
            This is a test event
            <select
              name="is_test"
              defaultValue={isTest === null ? "auto" : isTest ? "yes" : "no"}
              className="min-h-12 rounded-xl border-[1.5px] border-line bg-white px-3"
            >
              <option value="auto">Auto</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <Input
            label="Host Instagram name for a collab invite"
            name="ig_collaborator"
            defaultValue={collaborator ?? ""}
            maxLength={30}
            hint="Optional. Letters, numbers, dots and underscores. Leave this blank if you are not sure."
            autoComplete="off"
          />
          <Input label="Reason" name="reason" required maxLength={300} />
          <Button type="submit" variant="primary">
            Save social settings
          </Button>
        </form>
        {posts.length ? (
          <ul className="space-y-2 text-sm">
            {posts.map((post) => (
              <li
                key={post.id}
                className="flex flex-wrap justify-between gap-2 border-t border-line pt-2"
              >
                <span>
                  {platformLabel[post.platform]} · {postKindLabel[post.kind]}
                </span>
                <span className="font-semibold">{postStatusLabel[post.status]}</span>
                {post.permalink ? (
                  <a className="font-semibold text-teal underline" href={post.permalink}>
                    View post
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No social posts for this event yet.</p>
        )}
      </Card>
    </section>
  );
}
