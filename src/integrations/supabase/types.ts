export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      content_partners: {
        Row: {
          company_details: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_details?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_details?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_partners_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_owners: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_owners_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_owners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_owners_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          content_partner_id: string
          created_at: string
          end_date: string
          id: string
          notes: string | null
          plan_type: Database["public"]["Enums"]["contract_plan_type"]
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          total_article_banners: number
          total_articles: number
          total_homepage_banners: number
          total_newsletters: number
          total_social_posts: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_partner_id: string
          created_at?: string
          end_date: string
          id?: string
          notes?: string | null
          plan_type?: Database["public"]["Enums"]["contract_plan_type"]
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          total_article_banners?: number
          total_articles?: number
          total_homepage_banners?: number
          total_newsletters?: number
          total_social_posts?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_partner_id?: string
          created_at?: string
          end_date?: string
          id?: string
          notes?: string | null
          plan_type?: Database["public"]["Enums"]["contract_plan_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          total_article_banners?: number
          total_articles?: number
          total_homepage_banners?: number
          total_newsletters?: number
          total_social_posts?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_content_partner_id_fkey"
            columns: ["content_partner_id"]
            isOneToOne: false
            referencedRelation: "content_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_snapshot_edits: {
        Row: {
          edited_at: string
          edited_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          snapshot_id: string
        }
        Insert: {
          edited_at?: string
          edited_by: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          snapshot_id: string
        }
        Update: {
          edited_at?: string
          edited_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_snapshot_edits_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshot_edits_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "kpi_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_snapshots: {
        Row: {
          clicks: number
          created_at: string
          engagement_rate: number | null
          entered_by: string
          id: string
          impressions: number
          notes: string | null
          qc_approved_at: string | null
          qc_approved_by: string | null
          qc_comments: string | null
          recorded_date: string
          status: Database["public"]["Enums"]["kpi_status"]
          submission_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          clicks?: number
          created_at?: string
          engagement_rate?: number | null
          entered_by: string
          id?: string
          impressions?: number
          notes?: string | null
          qc_approved_at?: string | null
          qc_approved_by?: string | null
          qc_comments?: string | null
          recorded_date: string
          status?: Database["public"]["Enums"]["kpi_status"]
          submission_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          clicks?: number
          created_at?: string
          engagement_rate?: number | null
          entered_by?: string
          id?: string
          impressions?: number
          notes?: string | null
          qc_approved_at?: string | null
          qc_approved_by?: string | null
          qc_comments?: string | null
          recorded_date?: string
          status?: Database["public"]["Enums"]["kpi_status"]
          submission_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_snapshots_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_qc_approved_by_fkey"
            columns: ["qc_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          recipient_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          recipient_id: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          recipient_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_users: {
        Row: {
          content_partner_id: string
          created_at: string
          id: string
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_partner_id: string
          created_at?: string
          id?: string
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_partner_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_users_content_partner_id_fkey"
            columns: ["content_partner_id"]
            isOneToOne: false
            referencedRelation: "content_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_users_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          metadata: Json | null
          notes: string | null
          review_comments: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewing_by: string | null
          reviewing_since: string | null
          screenshot_url: string | null
          status: Database["public"]["Enums"]["submission_status"]
          submission_type: Database["public"]["Enums"]["submission_type"]
          submitted_at: string | null
          text_content: string | null
          submitted_by: string
          task_id: string
          updated_at: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewing_by?: string | null
          reviewing_since?: string | null
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submission_type: Database["public"]["Enums"]["submission_type"]
          submitted_at?: string | null
          text_content?: string | null
          submitted_by: string
          task_id: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewing_by?: string | null
          reviewing_since?: string | null
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submission_type?: Database["public"]["Enums"]["submission_type"]
          submitted_at?: string | null
          text_content?: string | null
          submitted_by?: string
          task_id?: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_reviewing_by_fkey"
            columns: ["reviewing_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          brief: string | null
          contract_id: string | null
          copied_from_task_id: string | null
          created_at: string
          deliverable_type: Database["public"]["Enums"]["deliverable_type"]
          due_date: string
          featured_image_url: string | null
          id: string
          is_extra: boolean
          priority: Database["public"]["Enums"]["task_priority"]
          priority_bucket: string | null
          sort_order: number
          status: Database["public"]["Enums"]["task_status"]
          task_origin: Database["public"]["Enums"]["task_origin"]
          title: string
          updated_at: string
          updated_by: string | null
          week_label: string | null
          week_start: string | null
        }
        Insert: {
          assigned_to?: string | null
          brief?: string | null
          contract_id?: string | null
          copied_from_task_id?: string | null
          created_at?: string
          deliverable_type: Database["public"]["Enums"]["deliverable_type"]
          due_date: string
          featured_image_url?: string | null
          id?: string
          is_extra?: boolean
          priority?: Database["public"]["Enums"]["task_priority"]
          priority_bucket?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          task_origin?: Database["public"]["Enums"]["task_origin"]
          title: string
          updated_at?: string
          updated_by?: string | null
          week_label?: string | null
          week_start?: string | null
        }
        Update: {
          assigned_to?: string | null
          brief?: string | null
          contract_id?: string | null
          copied_from_task_id?: string | null
          created_at?: string
          deliverable_type?: Database["public"]["Enums"]["deliverable_type"]
          due_date?: string
          featured_image_url?: string | null
          id?: string
          is_extra?: boolean
          priority?: Database["public"]["Enums"]["task_priority"]
          priority_bucket?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          task_origin?: Database["public"]["Enums"]["task_origin"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          week_label?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_copied_from_task_id_fkey"
            columns: ["copied_from_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          id: string
          key: string
          profile_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          id?: string
          key: string
          profile_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          id?: string
          key?: string
          profile_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      contract_deliverable_summary: {
        Args: { _contract_id: string }
        Returns: {
          deliverable_type: string
          delivered_count: number
          extras_delivered_count: number
          extras_scheduled_count: number
          scheduled_count: number
          total_promised: number
          unscheduled_count: number
        }[]
      }
      current_partner_id: { Args: { _user_id: string }; Returns: string }
      editor_can_see_contract: {
        Args: { _contract_id: string; _user_id: string }
        Returns: boolean
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
      recompute_task_priority_buckets: { Args: never; Returns: number }
      task_priority_bucket: {
        Args: {
          _due: string
          _status: Database["public"]["Enums"]["task_status"]
        }
        Returns: string
      }
      task_week_label: { Args: { _d: string }; Returns: string }
      task_week_start: { Args: { _d: string }; Returns: string }
      universal_search: {
        Args: { _limit?: number; _q: string }
        Returns: {
          extra: Json
          id: string
          kind: string
          link_id: string
          status: string
          subtitle: string
          title: string
        }[]
      }
    }
    Enums: {
      contract_plan_type:
        | "monthly"
        | "quarterly"
        | "six_month"
        | "annual"
        | "custom"
      contract_status:
        | "draft"
        | "active"
        | "completed"
        | "expired"
        | "cancelled"
      deliverable_type:
        | "article"
        | "newsletter"
        | "homepage_banner"
        | "article_banner"
        | "social_post"
      kpi_status: "pending_qc" | "qc_approved" | "qc_rejected"
      submission_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "rework_requested"
      submission_type: "url" | "file" | "screenshot" | "social_link" | "text"
      task_origin: "contract" | "editorial"
      task_priority: "low" | "normal" | "high"
      task_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "under_review"
        | "rework_requested"
        | "approved"
        | "completed"
        | "cancelled"
      user_role:
        | "super_admin"
        | "manager"
        | "editor"
        | "ops_support"
        | "content_partner"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      contract_plan_type: [
        "monthly",
        "quarterly",
        "six_month",
        "annual",
        "custom",
      ],
      contract_status: ["draft", "active", "completed", "expired", "cancelled"],
      deliverable_type: [
        "article",
        "newsletter",
        "homepage_banner",
        "article_banner",
        "social_post",
      ],
      kpi_status: ["pending_qc", "qc_approved", "qc_rejected"],
      submission_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "rework_requested",
      ],
      submission_type: ["url", "file", "screenshot", "social_link", "text"],
      task_origin: ["contract", "editorial"],
      task_priority: ["low", "normal", "high"],
      task_status: [
        "not_started",
        "in_progress",
        "submitted",
        "under_review",
        "rework_requested",
        "approved",
        "completed",
        "cancelled",
      ],
      user_role: [
        "super_admin",
        "manager",
        "editor",
        "ops_support",
        "content_partner",
      ],
    },
  },
} as const
