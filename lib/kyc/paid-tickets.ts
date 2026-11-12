export const INTERNATIONAL_PAID_TICKETS =
  "Paid tickets need an Indian bank account for now. Contact support to set this up.";

export function internationalPaidTicketError(
  international: boolean,
  isFree: boolean,
  prices: number[] = [],
) {
  return international && (!isFree || prices.some((price) => price > 0))
    ? INTERNATIONAL_PAID_TICKETS
    : undefined;
}
