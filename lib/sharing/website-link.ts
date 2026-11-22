/** A small text link for organisers to place voluntarily on their own websites.
 * Do not embed tracking pixels, JavaScript, hidden links or unlisted events.
 */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

export function organiserWebsiteLink(slug: string, title: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160)
    throw new Error("Invalid public event slug.");
  const url = `https://tikatero.com/e/${slug}`;
  return `<a href="${url}">Tickets for ${escapeHtml(title)} on Tikatero</a>`;
}
