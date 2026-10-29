// Explicit local/CI test fixture. Never imported by application code or production seeding.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Discovery fixtures require local Supabase.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function check(result) {
  if (result.error) throw new Error(`Local discovery fixture: ${result.error.message}`);
  return result.data;
}
const owner = "d9000000-0000-4000-8000-000000000001",
  paused = "d9000000-0000-4000-8000-000000000002";
for (const id of [owner, paused]) {
  const found = await client.auth.admin.getUserById(id);
  if (!found.data.user)
    check(
      await client.auth.admin.createUser({
        id,
        email: `discovery-${id}@example.test`,
        email_confirm: true,
        user_metadata: { full_name: "Discovery Test Organiser" },
      }),
    );
  check(
    await client.from("organisers").upsert({
      id,
      owner_id: id,
      slug: `discovery-${id}`,
      display_name: "Riverfront Events",
      kyc_status: "approved",
      approved_at: new Date().toISOString(),
      sales_paused: false,
    }),
  );
}
const start = new Date(Date.now() + 45 * 86400000);
start.setUTCHours(13, 30, 0, 0);
const common = {
  organiser_id: owner,
  title: "Sample Music Night",
  description:
    "An evening of live acoustic music, special guests and good company. Join us by the river for a memorable night.",
  category: "Concert",
  starts_at: start.toISOString(),
  ends_at: new Date(+start + 3 * 3600000).toISOString(),
  gates_open_at: new Date(+start - 3600000).toISOString(),
  venue_name: "Riverfront Hall",
  address: "12 Music Street, near the main entrance",
  city: "Hyderabad",
  country: "IN",
  lat: 17.385,
  lng: 78.4867,
  theme: "new_year",
  refund_policy: "72h",
  is_free: false,
  status: "published",
  published_at: new Date().toISOString(),
};
const events = [
  { ...common, id: "d9000000-0000-4000-8000-000000000010", slug: "sample-music-night" },
  {
    ...common,
    id: "d9000000-0000-4000-8000-000000000011",
    slug: "discovery-draft",
    title: "Private Discovery Draft",
    status: "draft",
    published_at: null,
  },
  {
    ...common,
    id: "d9000000-0000-4000-8000-000000000012",
    slug: "discovery-paused",
    title: "Paused Discovery Event",
    organiser_id: paused,
  },
  {
    ...common,
    id: "d9000000-0000-4000-8000-000000000013",
    slug: "community-rsvp",
    title: "Community RSVP",
    is_free: true,
    category: "Workshop",
    city: "Pune",
  },
];
check(await client.from("events").upsert(events));
check(await client.from("organisers").update({ sales_paused: true }).eq("id", paused));
const eventId = events[0].id;
check(
  await client.from("ticket_types").upsert([
    {
      is_vip: false,
      id: "d9000000-0000-4000-8000-000000000020",
      event_id: eventId,
      name: "General admission",
      price_paise: 100000,
      qty_total: 100,
      qty_sold: 25,
      sort: 0,
    },
    {
      id: "d9000000-0000-4000-8000-000000000021",
      event_id: eventId,
      name: "VIP admission",
      price_paise: 150050,
      qty_total: 10,
      qty_sold: 10,
      is_vip: true,
      sort: 1,
    },
    {
      is_vip: false,
      id: "d9000000-0000-4000-8000-000000000022",
      event_id: eventId,
      name: "Late release",
      price_paise: 120000,
      qty_total: 50,
      qty_sold: 0,
      sales_start: new Date(+start - 86400000).toISOString(),
      sort: 2,
    },
    {
      is_vip: false,
      sort: 0,
      id: "d9000000-0000-4000-8000-000000000023",
      event_id: events[3].id,
      name: "RSVP",
      price_paise: 0,
      qty_total: 50,
      qty_sold: 0,
    },
  ]),
);
check(
  await client.from("event_guests").upsert({
    id: "d9000000-0000-4000-8000-000000000030",
    event_id: eventId,
    name: "Alex Rao",
    title: "Chief guest & musician",
    is_vip: true,
  }),
);
console.log("Local attendee discovery fixtures ready.");
