import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import type { CheckoutMethod, SocialPlatform } from "@/lib/db/account-schema";

export const platforms = {
  instagram: ["Instagram", "instagram.com", ""],
  facebook: ["Facebook", "facebook.com", ""],
  x: ["X", "x.com", ""],
  youtube: ["YouTube", "youtube.com", "@"],
  linkedin: ["LinkedIn", "linkedin.com", "in/"],
  threads: ["Threads", "threads.com", "@"],
  spotify: ["Spotify", "open.spotify.com", "user/"],
  website: ["Website", "", ""],
} as const satisfies Record<SocialPlatform, readonly [string, string, string]>;

const hostAliases: Partial<Record<SocialPlatform, string[]>> = {
  x: ["twitter.com"],
  youtube: ["youtu.be", "m.youtube.com"],
  threads: ["threads.net"],
};

export function cleanSocialLink(platform: SocialPlatform, input: string) {
  const value = input.trim();
  if (!value || value.length > 300 || /[\\\s\u0000-\u001f\u007f]/u.test(value)) return null;
  const [, domain, prefix] = platforms[platform];
  if (domain && /^@?[\w.-]+$/.test(value) && !value.startsWith("www.") && !value.includes(".")) {
    const handle = value.replace(/^@/, "");
    return { handle, url: `https://${domain}/${prefix}${handle}` };
  }
  const isUrl = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z0-9-]+(?:[/?#]|$)/i.test(value);
  if (domain && !isUrl && /^@?[\w.-]+$/.test(value)) {
    const handle = value.replace(/^@/, "");
    return { handle, url: `https://${domain}/${prefix}${handle}` };
  }
  // Instagram and Threads commonly use handles containing dots. An explicit @ disambiguates.
  try {
    if (!isUrl) return null;
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.username || url.password || url.port || !url.hostname.includes(".")) return null;
    const host = url.hostname.replace(/^www\./, "");
    if (domain && host !== domain && !hostAliases[platform]?.includes(host)) return null;
    if (domain && url.pathname === "/") return null;
    url.protocol = "https:";
    url.hash = "";
    if (domain) url.search = "";
    return { handle: null, url: url.href };
  } catch {
    return null;
  }
}

export function phoneE164(input: string, region: CountryCode = "IN") {
  const parsed = parsePhoneNumberFromString(input.trim(), {
    defaultCountry: region,
    extract: false,
  });
  return parsed?.isValid() ? parsed.number : null;
}

export function indianCheckoutPhone(input: string | null | undefined) {
  const clean = input?.replace(/[\s().-]/g, "") ?? "";
  const digits = clean.replace(/^\+91/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : "";
}

export const paymentMethods: Record<CheckoutMethod, string> = {
  ask: "Ask me each time",
  upi: "UPI",
  card: "Card",
  netbanking: "Net banking",
};

export function validUpi(value: string) {
  return value.length <= 100 && /^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*$/i.test(value);
}

export function maskedUpi(value: string | null | undefined) {
  if (!value) return "";
  const [name, bank] = value.split("@");
  return bank ? `${name.slice(0, Math.min(2, name.length - 1))}•••@${bank}` : "";
}
