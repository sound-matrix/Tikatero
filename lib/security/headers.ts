export type SecurityHeaderInput = {
  supabaseUrl?: string;
};

const cashfree = [
  "https://sdk.cashfree.com",
  "https://payments.cashfree.com",
  "https://payments-test.cashfree.com",
  "https://sandbox.cashfree.com",
  "https://api.cashfree.com",
];

function originOf(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Strict baseline for HTML responses. No unsafe-eval. */
export function contentSecurityPolicy(input: SecurityHeaderInput = {}) {
  const supabase = originOf(input.supabaseUrl);
  const connect = [
    "'self'",
    "https://www.google.com/recaptcha/",
    ...cashfree,
    "https://maps.googleapis.com",
    "https://places.googleapis.com",
    "https://*.supabase.co",
    "wss://*.supabase.co",
  ];
  if (supabase) {
    connect.push(supabase.origin);
    const ws = supabase.protocol === "https:" ? "wss:" : "ws:";
    connect.push(`${ws}//${supabase.host}`);
  }
  const images = [
    "'self'",
    "data:",
    "blob:",
    "https://maps.gstatic.com",
    "https://*.googleapis.com",
    "https://*.ggpht.com",
  ];
  if (supabase) images.push(supabase.origin);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://maps.googleapis.com https://sdk.cashfree.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images.join(" ")}`,
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    `frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ ${cashfree.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}

export function securityHeaders(input: SecurityHeaderInput = {}) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(input) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ];
}
