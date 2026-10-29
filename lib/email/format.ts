import { formatInr, formatIst } from "@/lib/format";

export function formatINR(paise: number) {
  if (!Number.isSafeInteger(paise))
    throw new RangeError("Price must be a safe integer number of paise");
  return `${formatInr(paise)} incl. GST`;
}

export const formatIST = formatIst;
