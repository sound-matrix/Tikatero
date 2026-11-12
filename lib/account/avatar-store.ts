import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export async function sweepAvatarCleanup(userId?: string) {
  const client = createServiceClient();
  const bucket = client.storage.from("avatars");
  const query = client.from("avatar_cleanup").select("user_id,path").order("created_at").limit(25);
  const { data, error } = await (userId ? query.eq("user_id", userId) : query);
  if (error) throw new Error("Avatar cleanup could not start.");
  let failures = 0;
  for (const item of data) {
    let paths = [item.path];
    if (!item.path) {
      const folder = await bucket.list(item.user_id, { limit: 100 });
      if (folder.error) {
        failures++;
        continue;
      }
      paths = folder.data.map(({ name }) => `${item.user_id}/${name}`);
    }
    if (paths.length && (await bucket.remove(paths)).error) {
      failures++;
      continue;
    }
    if (!item.path && paths.length === 100) continue;
    const removed = await client
      .from("avatar_cleanup")
      .delete()
      .eq("user_id", item.user_id)
      .eq("path", item.path);
    if (removed.error) failures++;
  }
  return failures;
}
