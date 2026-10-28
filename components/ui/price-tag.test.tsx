import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceTag } from "./price-tag";

describe("PriceTag", () => {
  it("renders ₹1,000 with GST included for 100000 paise", () => {
    const html = renderToStaticMarkup(<PriceTag paise={100000} />);
    expect(html).toContain("₹1,000");
    expect(html).toContain("incl. GST");
  });
});
