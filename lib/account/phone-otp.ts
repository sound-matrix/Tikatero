import "server-only";

export function phoneOtpConfig() {
  const {
    PROFILE_PHONE_OTP_ENABLED,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_VERIFY_SERVICE_SID,
  } = process.env;
  if (
    PROFILE_PHONE_OTP_ENABLED !== "true" ||
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_AUTH_TOKEN ||
    !TWILIO_VERIFY_SERVICE_SID ||
    !/^VA[a-f0-9]{32}$/i.test(TWILIO_VERIFY_SERVICE_SID)
  )
    return null;
  return {
    service: TWILIO_VERIFY_SERVICE_SID,
    auth: Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
  };
}

export async function profilePhoneOtp(phone: string, code?: string) {
  const config = phoneOtpConfig();
  if (!config) return false;
  const endpoint = code ? "VerificationCheck" : "Verifications";
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${config.service}/${endpoint}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${config.auth}` },
      body: new URLSearchParams(code ? { To: phone, Code: code } : { To: phone, Channel: "sms" }),
      signal: AbortSignal.timeout(7000),
    },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as { status?: string };
  return result.status === (code ? "approved" : "pending");
}
