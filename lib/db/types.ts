export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          operation: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          operation: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          operation?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          audio_url: string | null
          contributed_by: string | null
          created_at: string
          custom_label: string | null
          date_precision: Database["public"]["Enums"]["date_precision_type"]
          date_value: string | null
          id: string
          location: string | null
          person_id: string
          photo_paths: string[]
          source_transcript_id: string | null
          source_type: Database["public"]["Enums"]["event_source_type"]
          story_ar: string | null
          story_en: string | null
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          contributed_by?: string | null
          created_at?: string
          custom_label?: string | null
          date_precision?: Database["public"]["Enums"]["date_precision_type"]
          date_value?: string | null
          id?: string
          location?: string | null
          person_id: string
          photo_paths?: string[]
          source_transcript_id?: string | null
          source_type?: Database["public"]["Enums"]["event_source_type"]
          story_ar?: string | null
          story_en?: string | null
          type: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          contributed_by?: string | null
          created_at?: string
          custom_label?: string | null
          date_precision?: Database["public"]["Enums"]["date_precision_type"]
          date_value?: string | null
          id?: string
          location?: string | null
          person_id?: string
          photo_paths?: string[]
          source_transcript_id?: string | null
          source_type?: Database["public"]["Enums"]["event_source_type"]
          story_ar?: string | null
          story_en?: string | null
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_contributed_by_fkey"
            columns: ["contributed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_source_transcript_id_fkey"
            columns: ["source_transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_proposals: {
        Row: {
          confidence_notes: Json
          created_at: string
          id: string
          proposed_changes: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["proposal_status_type"]
          transcript_id: string
        }
        Insert: {
          confidence_notes?: Json
          created_at?: string
          id?: string
          proposed_changes?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["proposal_status_type"]
          transcript_id: string
        }
        Update: {
          confidence_notes?: Json
          created_at?: string
          id?: string
          proposed_changes?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["proposal_status_type"]
          transcript_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_proposals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_proposals_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      link_requests: {
        Row: {
          created_at: string
          id: string
          parents_note: string | null
          person_id: string | null
          profile_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["link_request_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          parents_note?: string | null
          person_id?: string | null
          profile_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["link_request_status"]
        }
        Update: {
          created_at?: string
          id?: string
          parents_note?: string | null
          person_id?: string | null
          profile_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["link_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "link_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          deleted_at: string | null
          family_name_ar: string | null
          family_name_en: string | null
          father_id: string | null
          father_name_ar: string | null
          father_name_en: string | null
          gender: Database["public"]["Enums"]["gender_type"]
          given_ar: string | null
          given_en: string | null
          grandfather_name_ar: string | null
          grandfather_name_en: string | null
          great_grandfather_name_ar: string | null
          great_grandfather_name_en: string | null
          birth_date: string | null
          birth_order: number | null
          created_by: string | null
          death_date: string | null
          id: string
          is_placeholder: boolean
          mother_id: string | null
          notes_ar: string | null
          notes_en: string | null
          photo_url: string | null
          pos_x: number | null
          pos_y: number | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          birth_order?: number | null
          created_by?: string | null
          created_at?: string
          death_date?: string | null
          deleted_at?: string | null
          family_name_ar?: string | null
          family_name_en?: string | null
          father_id?: string | null
          father_name_ar?: string | null
          father_name_en?: string | null
          gender?: Database["public"]["Enums"]["gender_type"]
          given_ar?: string | null
          given_en?: string | null
          grandfather_name_ar?: string | null
          grandfather_name_en?: string | null
          great_grandfather_name_ar?: string | null
          great_grandfather_name_en?: string | null
          id?: string
          is_placeholder?: boolean
          mother_id?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          photo_url?: string | null
          pos_x?: number | null
          pos_y?: number | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          birth_order?: number | null
          created_by?: string | null
          created_at?: string
          death_date?: string | null
          deleted_at?: string | null
          family_name_ar?: string | null
          family_name_en?: string | null
          father_id?: string | null
          father_name_ar?: string | null
          father_name_en?: string | null
          gender?: Database["public"]["Enums"]["gender_type"]
          given_ar?: string | null
          given_en?: string | null
          grandfather_name_ar?: string | null
          grandfather_name_en?: string | null
          great_grandfather_name_ar?: string | null
          great_grandfather_name_en?: string | null
          id?: string
          is_placeholder?: boolean
          mother_id?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          photo_url?: string | null
          pos_x?: number | null
          pos_y?: number | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_father_id_fkey"
            columns: ["father_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_father_id_fkey"
            columns: ["father_id"]
            isOneToOne: false
            referencedRelation: "person_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "person_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          canvas_viewport: Json | null
          checklist_dismissed_at: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          invited_by: string | null
          is_super_admin: boolean
          login_method: string
          name_key: string | null
          pin_must_change: boolean
          first_name: string | null
          last_name: string | null
          onboarded_at: string | null
          person_id: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          canvas_viewport?: Json | null
          checklist_dismissed_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          invited_by?: string | null
          is_super_admin?: boolean
          login_method?: string
          name_key?: string | null
          pin_must_change?: boolean
          first_name?: string | null
          last_name?: string | null
          onboarded_at?: string | null
          person_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          canvas_viewport?: Json | null
          checklist_dismissed_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          is_super_admin?: boolean
          login_method?: string
          name_key?: string | null
          pin_must_change?: boolean
          first_name?: string | null
          last_name?: string | null
          onboarded_at?: string | null
          person_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          order_index: number
          person_a_id: string
          person_b_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["relationship_status_type"]
          type: Database["public"]["Enums"]["relationship_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          order_index?: number
          person_a_id: string
          person_b_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["relationship_status_type"]
          type: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          order_index?: number
          person_a_id?: string
          person_b_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["relationship_status_type"]
          type?: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "person_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "person_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      relative_suggestions: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          name: string
          note: string | null
          person_id: string | null
          relation: string
          status: Database["public"]["Enums"]["relative_suggestion_status"]
          suggested_by: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          name: string
          note?: string | null
          person_id?: string | null
          relation: string
          status?: Database["public"]["Enums"]["relative_suggestion_status"]
          suggested_by: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          name?: string
          note?: string | null
          person_id?: string | null
          relation?: string
          status?: Database["public"]["Enums"]["relative_suggestion_status"]
          suggested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "relative_suggestions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relative_suggestions_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relative_suggestions_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          focal_person_id: string | null
          id: number
          updated_at: string
        }
        Insert: {
          focal_person_id?: string | null
          id: number
          updated_at?: string
        }
        Update: {
          focal_person_id?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          audio_url: string
          created_at: string
          id: string
          raw_text_ar: string | null
          recorded_at: string | null
          recorded_with: string | null
          segments: Json | null
          uploaded_by: string | null
        }
        Insert: {
          audio_url: string
          created_at?: string
          id?: string
          raw_text_ar?: string | null
          recorded_at?: string | null
          recorded_with?: string | null
          segments?: Json | null
          uploaded_by: string | null
        }
        Update: {
          audio_url?: string
          created_at?: string
          id?: string
          raw_text_ar?: string | null
          recorded_at?: string | null
          recorded_with?: string | null
          segments?: Json | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_recorded_with_fkey"
            columns: ["recorded_with"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_recorded_with_fkey"
            columns: ["recorded_with"]
            isOneToOne: false
            referencedRelation: "person_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      person_groups: {
        Row: {
          id: string | null
          major_group_ar: string | null
          major_group_en: string | null
          minor_group_ar: string | null
          minor_group_en: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_member_auth_status: {
        Args: never
        Returns: {
          id: string
          email: string | null
          email_confirmed_at: string | null
          last_sign_in_at: string | null
        }[]
      }
      can_edit_person: { Args: { p_target: string }; Returns: boolean }
      claimed_person_ids: { Args: never; Returns: string[] }
      delete_person: { Args: { p_id: string }; Returns: undefined }
      dismiss_checklist: { Args: never; Returns: undefined }
      first_admin_name: { Args: never; Returns: string | null }
      is_approved: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      mark_onboarded: { Args: never; Returns: undefined }
      my_editable_person_ids: { Args: never; Returns: string[] | null }
      my_pending_claim_person: {
        Args: never
        Returns: {
          id: string
          given_en: string | null
          given_ar: string | null
          family_name_en: string | null
          family_name_ar: string | null
          birth_year: number | null
          father_name_en: string | null
          father_name_ar: string | null
          mother_name_en: string | null
          mother_name_ar: string | null
        }[]
      }
      set_children_order: {
        Args: { p_parent: string; p_children: string[] }
        Returns: undefined
      }
      search_people_for_claim: {
        Args: { q: string; dob?: string | null }
        Returns: {
          id: string
          given_en: string | null
          given_ar: string | null
          family_name_en: string | null
          family_name_ar: string | null
          birth_year: number | null
          father_name_en: string | null
          father_name_ar: string | null
          mother_name_en: string | null
          mother_name_ar: string | null
          dob_match: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      date_precision_type:
        | "exact"
        | "year"
        | "decade"
        | "before"
        | "after"
        | "around"
      event_source_type:
        | "grandma_transcript"
        | "family_contribution"
        | "document"
        | "admin"
      event_type:
        | "birth"
        | "death"
        | "marriage"
        | "divorce"
        | "engagement"
        | "migration"
        | "education"
        | "notable_story"
        | "custom"
      gender_type: "m" | "f" | "unknown"
      link_request_status: "pending" | "approved" | "declined" | "cancelled"
      proposal_status_type: "pending" | "approved" | "rejected"
      relationship_status_type: "current" | "divorced" | "widowed"
      relative_suggestion_status: "pending" | "added" | "already_in_tree" | "dismissed"
      relationship_type: "spouse" | "adopted_by" | "raised_by" | "godparent"
      user_role: "admin" | "editor" | "viewer"
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
      date_precision_type: [
        "exact",
        "year",
        "decade",
        "before",
        "after",
        "around",
      ],
      event_source_type: [
        "grandma_transcript",
        "family_contribution",
        "document",
        "admin",
      ],
      event_type: [
        "birth",
        "death",
        "marriage",
        "divorce",
        "engagement",
        "migration",
        "education",
        "notable_story",
        "custom",
      ],
      gender_type: ["m", "f", "unknown"],
      link_request_status: ["pending", "approved", "declined", "cancelled"],
      proposal_status_type: ["pending", "approved", "rejected"],
      relationship_status_type: ["current", "divorced", "widowed"],
      relative_suggestion_status: ["pending", "added", "already_in_tree", "dismissed"],
      relationship_type: ["spouse", "adopted_by", "raised_by", "godparent"],
      user_role: ["admin", "editor", "viewer"],
    },
  },
} as const
