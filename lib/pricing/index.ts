/** PR 08 preview contract. PR 10 replaces this illustrative implementation. */
export type FeePreviewInput = {
  ticketPaise: number;
  feePayer: "organiser" | "buyer";
  free?: boolean;
};
export type FeePreview = {
  ticketPaise: number;
  platformFeePaise: number;
  feeGstPaise: number;
  buyerTotalPaise: number;
  organiserPayoutPaise: number;
  illustrative: true;
};
export function previewPricing({
  ticketPaise,
  feePayer,
  free = false,
}: FeePreviewInput): FeePreview {
  if (!Number.isSafeInteger(ticketPaise) || ticketPaise < 0)
    throw new Error("Use an integer price in paise.");
  const price = free ? 0 : ticketPaise;
  // Illustrative only: 2% platform fee plus 18% GST on that fee; no gateway charges.
  const platformFeePaise = Math.round((price * 200) / 10000),
    feeGstPaise = Math.round((platformFeePaise * 1800) / 10000),
    fee = platformFeePaise + feeGstPaise;
  return {
    ticketPaise: price,
    platformFeePaise,
    feeGstPaise,
    buyerTotalPaise: price + (feePayer === "buyer" ? fee : 0),
    organiserPayoutPaise: Math.max(0, price - (feePayer === "organiser" ? fee : 0)),
    illustrative: true,
  };
}
