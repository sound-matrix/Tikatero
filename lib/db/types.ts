export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          reason: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          reason?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcasts: {
        Row: {
          body: string | null;
          channel: string;
          created_at: string;
          created_by: string | null;
          id: string;
          segment: NonNullable<Json>;
          sent_count: number;
          subject: string | null;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          channel: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          segment?: NonNullable<Json>;
          sent_count?: number;
          subject?: string | null;
        };
        Update: {
          body?: string | null;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          segment?: NonNullable<Json>;
          sent_count?: number;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "broadcasts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      coupons: {
        Row: {
          amount_paise: number | null;
          code: string;
          created_at: string;
          event_id: string;
          id: string;
          max_uses: number | null;
          pct: number | null;
          used: number;
        };
        ComputedFields: never;
        Insert: {
          amount_paise?: number | null;
          code: string;
          created_at?: string;
          event_id: string;
          id?: string;
          max_uses?: number | null;
          pct?: number | null;
          used?: number;
        };
        Update: {
          amount_paise?: number | null;
          code?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          max_uses?: number | null;
          pct?: number | null;
          used?: number;
        };
        Relationships: [
          {
            foreignKeyName: "coupons_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      email_log: {
        Row: {
          created_at: string;
          entity_ref: string | null;
          id: string;
          resend_id: string | null;
          status: string;
          template: string;
          to_email: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          entity_ref?: string | null;
          id?: string;
          resend_id?: string | null;
          status: string;
          template: string;
          to_email: string;
        };
        Update: {
          created_at?: string;
          entity_ref?: string | null;
          id?: string;
          resend_id?: string | null;
          status?: string;
          template?: string;
          to_email?: string;
        };
        Relationships: [];
      };
      event_guests: {
        Row: {
          event_id: string;
          id: string;
          is_vip: boolean;
          name: string;
          photo_key: string | null;
          sort: number;
          title: string | null;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          id?: string;
          is_vip?: boolean;
          name: string;
          photo_key?: string | null;
          sort?: number;
          title?: string | null;
        };
        Update: {
          event_id?: string;
          id?: string;
          is_vip?: boolean;
          name?: string;
          photo_key?: string | null;
          sort?: number;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_guests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_team: {
        Row: {
          created_at: string;
          email: string | null;
          event_id: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["team_role"];
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          event_id: string;
          id?: string;
          invited_by?: string | null;
          role: Database["public"]["Enums"]["team_role"];
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          event_id?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["team_role"];
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_team_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_team_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_team_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          address: string | null;
          capacity: number | null;
          category: string | null;
          city: string | null;
          country: string;
          created_at: string;
          description: string | null;
          ends_at: string | null;
          fee_payer: Database["public"]["Enums"]["fee_payer"];
          gates_open_at: string | null;
          id: string;
          is_free: boolean;
          lat: number | null;
          lng: number | null;
          maps_url: string | null;
          organiser_id: string;
          poster_key: string | null;
          published_at: string | null;
          refund_policy: string;
          slug: string;
          starts_at: string;
          status: Database["public"]["Enums"]["event_status"];
          theme: string | null;
          timezone: string;
          title: string;
          updated_at: string;
          venue_name: string | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          capacity?: number | null;
          category?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          fee_payer?: Database["public"]["Enums"]["fee_payer"];
          gates_open_at?: string | null;
          id?: string;
          is_free?: boolean;
          lat?: number | null;
          lng?: number | null;
          maps_url?: string | null;
          organiser_id: string;
          poster_key?: string | null;
          published_at?: string | null;
          refund_policy?: string;
          slug: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["event_status"];
          theme?: string | null;
          timezone?: string;
          title: string;
          updated_at?: string;
          venue_name?: string | null;
        };
        Update: {
          address?: string | null;
          capacity?: number | null;
          category?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          fee_payer?: Database["public"]["Enums"]["fee_payer"];
          gates_open_at?: string | null;
          id?: string;
          is_free?: boolean;
          lat?: number | null;
          lng?: number | null;
          maps_url?: string | null;
          organiser_id?: string;
          poster_key?: string | null;
          published_at?: string | null;
          refund_policy?: string;
          slug?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["event_status"];
          theme?: string | null;
          timezone?: string;
          title?: string;
          updated_at?: string;
          venue_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_organiser_id_fkey";
            columns: ["organiser_id"];
            isOneToOne: false;
            referencedRelation: "organisers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_organiser_id_fkey";
            columns: ["organiser_id"];
            isOneToOne: false;
            referencedRelation: "organisers_public";
            referencedColumns: ["id"];
          },
        ];
      };
      kyc_applications: {
        Row: {
          aadhaar_last4: string | null;
          bank_acct_last4: string | null;
          bank_holder_name: string | null;
          bank_ifsc: string | null;
          created_at: string;
          decided_at: string | null;
          doc_keys: string[];
          face_match_score: number | null;
          gstin: string | null;
          id: string;
          liveness_score: number | null;
          organiser_id: string;
          pan_last4: string | null;
          pan_name: string | null;
          pan_name_match: boolean | null;
          provider_refs: NonNullable<Json>;
          region: Database["public"]["Enums"]["kyc_region"];
          reviewer_id: string | null;
          reviewer_note: string | null;
          status: Database["public"]["Enums"]["kyc_status"];
          submitted_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          aadhaar_last4?: string | null;
          bank_acct_last4?: string | null;
          bank_holder_name?: string | null;
          bank_ifsc?: string | null;
          created_at?: string;
          decided_at?: string | null;
          doc_keys?: string[];
          face_match_score?: number | null;
          gstin?: string | null;
          id?: string;
          liveness_score?: number | null;
          organiser_id: string;
          pan_last4?: string | null;
          pan_name?: string | null;
          pan_name_match?: boolean | null;
          provider_refs?: NonNullable<Json>;
          region: Database["public"]["Enums"]["kyc_region"];
          reviewer_id?: string | null;
          reviewer_note?: string | null;
          status?: Database["public"]["Enums"]["kyc_status"];
          submitted_at?: string | null;
        };
        Update: {
          aadhaar_last4?: string | null;
          bank_acct_last4?: string | null;
          bank_holder_name?: string | null;
          bank_ifsc?: string | null;
          created_at?: string;
          decided_at?: string | null;
          doc_keys?: string[];
          face_match_score?: number | null;
          gstin?: string | null;
          id?: string;
          liveness_score?: number | null;
          organiser_id?: string;
          pan_last4?: string | null;
          pan_name?: string | null;
          pan_name_match?: boolean | null;
          provider_refs?: NonNullable<Json>;
          region?: Database["public"]["Enums"]["kyc_region"];
          reviewer_id?: string | null;
          reviewer_note?: string | null;
          status?: Database["public"]["Enums"]["kyc_status"];
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "kyc_applications_organiser_id_fkey";
            columns: ["organiser_id"];
            isOneToOne: false;
            referencedRelation: "organisers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kyc_applications_organiser_id_fkey";
            columns: ["organiser_id"];
            isOneToOne: false;
            referencedRelation: "organisers_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kyc_applications_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          qty: number;
          ticket_type_id: string;
          unit_price_paise: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          order_id: string;
          qty: number;
          ticket_type_id: string;
          unit_price_paise: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          qty?: number;
          ticket_type_id?: string;
          unit_price_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_ticket_type_id_fkey";
            columns: ["ticket_type_id"];
            isOneToOne: false;
            referencedRelation: "ticket_types";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          buyer_email: string;
          buyer_id: string | null;
          buyer_name: string;
          buyer_phone: string | null;
          cf_order_id: string | null;
          cf_payment_id: string | null;
          created_at: string;
          event_id: string;
          fee_payer: Database["public"]["Enums"]["fee_payer"];
          gateway_fee_paise: number;
          id: string;
          paid_at: string | null;
          platform_fee_gst_paise: number;
          platform_fee_paise: number;
          pricing_version_id: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal_paise: number;
          total_paise: number;
        };
        ComputedFields: never;
        Insert: {
          buyer_email: string;
          buyer_id?: string | null;
          buyer_name: string;
          buyer_phone?: string | null;
          cf_order_id?: string | null;
          cf_payment_id?: string | null;
          created_at?: string;
          event_id: string;
          fee_payer: Database["public"]["Enums"]["fee_payer"];
          gateway_fee_paise?: number;
          id?: string;
          paid_at?: string | null;
          platform_fee_gst_paise?: number;
          platform_fee_paise?: number;
          pricing_version_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_paise: number;
          total_paise: number;
        };
        Update: {
          buyer_email?: string;
          buyer_id?: string | null;
          buyer_name?: string;
          buyer_phone?: string | null;
          cf_order_id?: string | null;
          cf_payment_id?: string | null;
          created_at?: string;
          event_id?: string;
          fee_payer?: Database["public"]["Enums"]["fee_payer"];
          gateway_fee_paise?: number;
          id?: string;
          paid_at?: string | null;
          platform_fee_gst_paise?: number;
          platform_fee_paise?: number;
          pricing_version_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_paise?: number;
          total_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_pricing_version_id_fkey";
            columns: ["pricing_version_id"];
            isOneToOne: false;
            referencedRelation: "pricing_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      organiser_members: {
        Row: {
          created_at: string;
          id: string;
          invited_email: string | null;
          organiser_id: string;
          role: Database["public"]["Enums"]["team_role"];
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          invited_email?: string | null;
          organiser_id: string;
          role: Database["public"]["Enums"]["team_role"];
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_email?: string | null;
          organiser_id?: string;
          role?: Database["public"]["Enums"]["team_role"];
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organiser_members_organiser_id_fkey";
            columns: ["organiser_id"];
            isOneToOne: false;
            referencedRelation: "organisers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organiser_members_organiser_id_fkey";
            columns: ["organiser_id"];
            isOneToOne: false;
            referencedRelation: "organisers_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organiser_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organisers: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          cashfree_vendor_id: string | null;
          country: string;
          created_at: string;
          display_name: string;
          id: string;
          kyc_status: Database["public"]["Enums"]["kyc_status"];
          legal_name: string | null;
          owner_id: string;
          payouts_on_hold: boolean;
          sales_paused: boolean;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          cashfree_vendor_id?: string | null;
          country?: string;
          created_at?: string;
          display_name: string;
          id?: string;
          kyc_status?: Database["public"]["Enums"]["kyc_status"];
          legal_name?: string | null;
          owner_id: string;
          payouts_on_hold?: boolean;
          sales_paused?: boolean;
          slug: string;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          cashfree_vendor_id?: string | null;
          country?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          kyc_status?: Database["public"]["Enums"]["kyc_status"];
          legal_name?: string | null;
          owner_id?: string;
          payouts_on_hold?: boolean;
          sales_paused?: boolean;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organisers_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organisers_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payouts: {
        Row: {
          amount_paise: number;
          cf_split_ref: string | null;
          created_at: string;
          event_id: string | null;
          expected_at: string | null;
          id: string;
          order_id: string | null;
          organiser_id: string;
          settled_at: string | null;
          status: Database["public"]["Enums"]["payout_status"];
        };
        ComputedFields: never;
        Insert: {
          amount_paise: number;
          cf_split_ref?: string | null;
          created_at?: string;
          event_id?: string | null;
          expected_at?: string | null;
          id?: string;
          order_id?: string | null;
          organiser_id: string;
          settled_at?: string | null;
          status?: Database["public"]["Enums"]["payout_status"];
        };
        Update: {
          amount_paise?: number;
          cf_split_ref?: string | null;
          created_at?: string;
          event_id?: string | null;
          expected_at?: string | null;
          id?: string;
          order_id?: string | null;
          organiser_id?: string;
          settled_at?: string | null;
          status?: Database["public"]["Enums"]["payout_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payouts_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_organiser_id_fkey";
            columns: ["organiser_id"];
            isOneToOne: false;
            referencedRelation: "organisers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_organiser_id_fkey";
            columns: ["organiser_id"];
            isOneToOne: false;
            referencedRelation: "organisers_public";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          effective_from: string;
          fixed_fee_paise: number;
          gateway_bps: number;
          gateway_mode: Database["public"]["Enums"]["gateway_mode"];
          gst_bps: number;
          id: string;
          payout_days: number;
          platform_pct: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          fixed_fee_paise: number;
          gateway_bps: number;
          gateway_mode: Database["public"]["Enums"]["gateway_mode"];
          gst_bps: number;
          id?: string;
          payout_days: number;
          platform_pct: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          fixed_fee_paise?: number;
          gateway_bps?: number;
          gateway_mode?: Database["public"]["Enums"]["gateway_mode"];
          gst_bps?: number;
          id?: string;
          payout_days?: number;
          platform_pct?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pricing_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          block_reason: string | null;
          blocked_at: string | null;
          country: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          role: Database["public"]["Enums"]["user_role"];
        };
        ComputedFields: never;
        Insert: {
          block_reason?: string | null;
          blocked_at?: string | null;
          country?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Update: {
          block_reason?: string | null;
          blocked_at?: string | null;
          country?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Relationships: [];
      };
      refunds: {
        Row: {
          amount_paise: number;
          approved_by: string | null;
          cf_refund_id: string | null;
          created_at: string;
          id: string;
          order_id: string;
          reason: string | null;
          requested_by: string | null;
          status: Database["public"]["Enums"]["refund_status"];
        };
        ComputedFields: never;
        Insert: {
          amount_paise: number;
          approved_by?: string | null;
          cf_refund_id?: string | null;
          created_at?: string;
          id?: string;
          order_id: string;
          reason?: string | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["refund_status"];
        };
        Update: {
          amount_paise?: number;
          approved_by?: string | null;
          cf_refund_id?: string | null;
          created_at?: string;
          id?: string;
          order_id?: string;
          reason?: string | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["refund_status"];
        };
        Relationships: [
          {
            foreignKeyName: "refunds_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scans: {
        Row: {
          device_id: string | null;
          event_id: string | null;
          gate: string | null;
          id: string;
          result: Database["public"]["Enums"]["scan_result"];
          scanned_at: string;
          scanner_user_id: string | null;
          synced_at: string | null;
          ticket_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          device_id?: string | null;
          event_id?: string | null;
          gate?: string | null;
          id?: string;
          result: Database["public"]["Enums"]["scan_result"];
          scanned_at?: string;
          scanner_user_id?: string | null;
          synced_at?: string | null;
          ticket_id?: string | null;
        };
        Update: {
          device_id?: string | null;
          event_id?: string | null;
          gate?: string | null;
          id?: string;
          result?: Database["public"]["Enums"]["scan_result"];
          scanned_at?: string;
          scanner_user_id?: string | null;
          synced_at?: string | null;
          ticket_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "scans_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scans_scanner_user_id_fkey";
            columns: ["scanner_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scans_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "event_attendees_v";
            referencedColumns: ["ticket_id"];
          },
          {
            foreignKeyName: "scans_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_types: {
        Row: {
          design: NonNullable<Json>;
          event_id: string;
          id: string;
          is_vip: boolean;
          name: string;
          per_order_max: number | null;
          price_paise: number;
          qty_sold: number;
          qty_total: number;
          sales_end: string | null;
          sales_start: string | null;
          sort: number;
        };
        ComputedFields: never;
        Insert: {
          design?: NonNullable<Json>;
          event_id: string;
          id?: string;
          is_vip?: boolean;
          name: string;
          per_order_max?: number | null;
          price_paise: number;
          qty_sold?: number;
          qty_total: number;
          sales_end?: string | null;
          sales_start?: string | null;
          sort?: number;
        };
        Update: {
          design?: NonNullable<Json>;
          event_id?: string;
          id?: string;
          is_vip?: boolean;
          name?: string;
          per_order_max?: number | null;
          price_paise?: number;
          qty_sold?: number;
          qty_total?: number;
          sales_end?: string | null;
          sales_start?: string | null;
          sort?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      tickets: {
        Row: {
          code: string;
          created_at: string;
          event_id: string;
          gate: string | null;
          holder_email: string | null;
          holder_name: string | null;
          id: string;
          order_id: string;
          qr_secret: string;
          status: Database["public"]["Enums"]["ticket_status"];
          ticket_type_id: string;
          transferred_to: string | null;
          used_at: string | null;
          used_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          event_id: string;
          gate?: string | null;
          holder_email?: string | null;
          holder_name?: string | null;
          id?: string;
          order_id: string;
          qr_secret: string;
          status?: Database["public"]["Enums"]["ticket_status"];
          ticket_type_id: string;
          transferred_to?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          event_id?: string;
          gate?: string | null;
          holder_email?: string | null;
          holder_name?: string | null;
          id?: string;
          order_id?: string;
          qr_secret?: string;
          status?: Database["public"]["Enums"]["ticket_status"];
          ticket_type_id?: string;
          transferred_to?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_ticket_type_id_fkey";
            columns: ["ticket_type_id"];
            isOneToOne: false;
            referencedRelation: "ticket_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_transferred_to_fkey";
            columns: ["transferred_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_used_by_fkey";
            columns: ["used_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      waitlist: {
        Row: {
          created_at: string;
          email: string;
          event_id: string;
          id: string;
          ticket_type_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          event_id: string;
          id?: string;
          ticket_type_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          event_id?: string;
          id?: string;
          ticket_type_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_ticket_type_id_fkey";
            columns: ["ticket_type_id"];
            isOneToOne: false;
            referencedRelation: "ticket_types";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          source: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          source: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          source?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      event_attendees_v: {
        Row: {
          event_id: string;
          gate: string | null;
          holder_name: string | null;
          status: Database["public"]["Enums"]["ticket_status"];
          ticket_id: string;
          ticket_name: string;
          used_at: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      organisers_public: {
        Row: {
          country: string;
          display_name: string;
          id: string;
          slug: string;
          verified: boolean | null;
        };
        ComputedFields: never;
        Insert: {
          country?: string | null;
          display_name?: string | null;
          id?: string | null;
          slug?: string | null;
          verified?: never;
        };
        Update: {
          country?: string | null;
          display_name?: string | null;
          id?: string | null;
          slug?: string | null;
          verified?: never;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_event_team: {
        Args: { event_id: string; roles: Database["public"]["Enums"]["team_role"][] };
        Returns: boolean;
      };
      is_org_member: { Args: { org_id: string }; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      redeem_ticket: {
        Args: { code: string; gate: string; sig: string };
        Returns: Database["public"]["Enums"]["scan_result"];
      };
    };
    Enums: {
      event_status: "draft" | "pending" | "published" | "unpublished" | "ended" | "cancelled";
      fee_payer: "organiser" | "buyer";
      gateway_mode: "pass_at_cost" | "absorb";
      kyc_region: "IN" | "INTL";
      kyc_status: "draft" | "submitted" | "auto_passed" | "needs_docs" | "approved" | "rejected";
      order_status:
        "created" | "pending" | "paid" | "failed" | "refunded" | "partially_refunded" | "expired";
      payout_status: "scheduled" | "settled" | "failed" | "on_hold";
      refund_status: "requested" | "approved" | "rejected" | "processed" | "failed";
      scan_result: "ok" | "duplicate" | "invalid" | "wrong_event";
      team_role: "owner" | "manager" | "door";
      ticket_status: "valid" | "used" | "void" | "transferred" | "refunded";
      user_role: "attendee" | "organiser" | "staff" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      event_status: ["draft", "pending", "published", "unpublished", "ended", "cancelled"],
      fee_payer: ["organiser", "buyer"],
      gateway_mode: ["pass_at_cost", "absorb"],
      kyc_region: ["IN", "INTL"],
      kyc_status: ["draft", "submitted", "auto_passed", "needs_docs", "approved", "rejected"],
      order_status: [
        "created",
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
        "expired",
      ],
      payout_status: ["scheduled", "settled", "failed", "on_hold"],
      refund_status: ["requested", "approved", "rejected", "processed", "failed"],
      scan_result: ["ok", "duplicate", "invalid", "wrong_event"],
      team_role: ["owner", "manager", "door"],
      ticket_status: ["valid", "used", "void", "transferred", "refunded"],
      user_role: ["attendee", "organiser", "staff", "admin"],
    },
  },
} as const;
