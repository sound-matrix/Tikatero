import { expect, it } from "vitest";
import { previewPricing } from ".";
it("uses integer paise for both sides of the illustrative ₹1,000 fee preview", () => {
  const absorbed = previewPricing({ ticketPaise: 100000, feePayer: "organiser" });
  expect(absorbed).toMatchObject({
    platformFeePaise: 2000,
    feeGstPaise: 360,
    buyerTotalPaise: 100000,
    organiserPayoutPaise: 97640,
    illustrative: true,
  });
  expect(previewPricing({ ticketPaise: 100000, feePayer: "buyer" })).toMatchObject({
    buyerTotalPaise: 102360,
    organiserPayoutPaise: 100000,
  });
  expect(previewPricing({ ticketPaise: 100000, feePayer: "buyer", free: true })).toMatchObject({
    buyerTotalPaise: 0,
    organiserPayoutPaise: 0,
  });
  expect(() => previewPricing({ ticketPaise: 1.5, feePayer: "buyer" })).toThrow();
});
