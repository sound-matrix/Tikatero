import type { Json } from "./types";

export type SocialPlatform =
  "instagram" | "facebook" | "x" | "youtube" | "linkedin" | "threads" | "spotify" | "website";
export type CheckoutMethod = "upi" | "card" | "netbanking" | "ask";
export type ConsentKind = "email_marketing" | "whatsapp_sms_marketing";
export type ShareChannel =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "x"
  | "linkedin"
  | "telegram"
  | "email"
  | "copy"
  | "native";

type Timestamps = { created_at: string; updated_at: string };
type UserRow = Timestamps & { user_id: string; id: string };
type RowShape<T, Required extends keyof T> = {
  Row: T;
  Insert: Pick<T, Required> & Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export type AccountTables = {
  user_phones: RowShape<
    UserRow & { phone_e164: string; is_primary: boolean; verified_at: string | null },
    "user_id" | "phone_e164"
  >;
  user_emails: RowShape<
    UserRow & {
      email: string;
      is_primary: boolean;
      is_login: boolean;
      verified_at: string | null;
      verify_token_hash: string | null;
      verify_sent_at: string | null;
    },
    "user_id" | "email"
  >;
  user_social_links: RowShape<
    UserRow & { platform: SocialPlatform; handle: string | null; url: string; is_public: boolean },
    "user_id" | "platform" | "url"
  >;
  user_checkout_preferences: RowShape<
    Timestamps & {
      user_id: string;
      ticket_name: string | null;
      ticket_email: string | null;
      ticket_phone_e164: string | null;
      preferred_method: CheckoutMethod;
      upi_id: string | null;
    },
    "user_id"
  >;
  user_consents: RowShape<
    UserRow & { kind: ConsentKind; granted: boolean; changed_at: string; source: string },
    "user_id" | "kind" | "granted" | "source"
  >;
  event_shares: RowShape<
    {
      id: string;
      event_id: string;
      user_id: string | null;
      channel: ShareChannel;
      created_at: string;
    },
    "event_id" | "channel"
  >;
  event_ref_visits: RowShape<
    {
      id: string;
      event_id: string;
      channel: ShareChannel;
      visitor_hash: string;
      created_at: string;
    },
    "event_id" | "channel" | "visitor_hash"
  >;
  avatar_cleanup: RowShape<
    { user_id: string; path: string; created_at: string },
    "user_id" | "path"
  >;
};

export type AccountViews = {
  admin_user_overview: {
    Row: {
      id: string;
      full_name: string | null;
      primary_email: string | null;
      primary_phone: string | null;
      city: string | null;
      order_count: number;
      total_spent_paise: number;
      signup_intent: string | null;
      created_at: string;
      consents: Json;
    };
    Relationships: [];
  };
};

export type AccountFunctions = {
  change_profile_phone: { Args: { p_action: string; p_value: string }; Returns: undefined };
  remove_backup_email: { Args: { p_id: string }; Returns: undefined };
  claim_backup_email: {
    Args: { p_user_id: string; p_email: string; p_hash: string };
    Returns: boolean;
  };
  release_backup_email: { Args: { p_user_id: string; p_hash: string }; Returns: undefined };
  verify_backup_email: { Args: { p_hash: string }; Returns: boolean };
  save_profile_consents: { Args: { p_email: boolean; p_phone: boolean }; Returns: undefined };
  mark_profile_phone_verified: {
    Args: { p_user_id: string; p_id: string; p_phone: string };
    Returns: boolean;
  };
  event_share_stats: {
    Args: { p_event_id: string };
    Returns: { channel: ShareChannel; shares: number; visits: number; bookings: number }[];
  };
  public_host_profile: { Args: { p_slug: string }; Returns: Json };
  event_host_slug: { Args: { p_event_id: string }; Returns: string | null };
};
