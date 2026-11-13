import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CategoryDetailsView } from "./category-details-view";

it("renders filled event answers and escapes host text", () => {
  const html = renderToStaticMarkup(
    <CategoryDetailsView
      category="Conference"
      details={{
        agenda: [{ time: "10:30", title: "<script>Talk</script>", speaker: "Nina" }],
        speakers: [{ name: "  ", about: " " }],
        who_for: "   ",
        certificate: true,
        extra: [{ label: "Ignore me", value: "Bad" }],
      }}
    />,
  );
  expect(html).toContain("Schedule");
  expect(html).toContain('<time dateTime="10:30"');
  expect(html).toContain("10:30 IST");
  expect(html).toContain("&lt;script&gt;Talk&lt;/script&gt;");
  expect(html).toContain("Certificate given");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("Speakers");
  expect(html).not.toContain("Who should come");
  expect(html).not.toContain("Ignore me");
  expect(
    renderToStaticMarkup(<CategoryDetailsView category="Concert" details={{ genre: "" }} />),
  ).toBe("");
});

it("shows custom labels and explicit no answers without turning text into links", () => {
  expect(
    renderToStaticMarkup(
      <CategoryDetailsView category="Workshop" details={{ certificate: false }} />,
    ),
  ).toContain(">No</dd>");
  const html = renderToStaticMarkup(
    <CategoryDetailsView
      category="Other"
      details={{ extra: [{ label: "Meet at", value: "https://example.com" }] }}
    />,
  );
  expect(html).toContain("Meet at");
  expect(html).toContain("https://example.com");
  expect(html).not.toContain("<a ");
});
