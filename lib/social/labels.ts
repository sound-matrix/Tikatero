export const postStatusLabel = {
  queued: "Waiting",
  processing: "Posting",
  posted: "Posted",
  failed: "Didn't post",
  skipped: "Skipped",
} as const;

export const postKindLabel = {
  feed: "Post",
  story: "Story",
  last_seats: "Last seats",
} as const;

export const platformLabel = {
  instagram: "Instagram",
  facebook: "Facebook",
} as const;

export const postFilters = [
  { status: "queued", label: "Waiting" },
  { status: "processing", label: "Posting" },
  { status: "posted", label: "Posted" },
  { status: "failed", label: "Didn't post" },
  { status: "skipped", label: "Skipped" },
] as const;
