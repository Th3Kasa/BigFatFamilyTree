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
          id: string
          is_placeholder: boolean
          mother_id: string | null
          notes_ar: string | null
          notes_en: string | null
          photo_url: string | null
          pos_x: number | null
          pos_y: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
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
          updated_at?: string
        }
        Update: {
          created_at?: string
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
          canvas_viewport: Json | null
          created_at: string
          display_name: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          canvas_viewport?: Json | null
          created_at?: string
          display_name?: string | null
          id: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          canvas_viewport?: Json | null
          created_at?: string
          display_name?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          uploaded_by: string
        }
        Insert: {
          audio_url: string
          created_at?: string
          id?: string
          raw_text_ar?: string | null
          recorded_at?: string | null
          recorded_with?: string | null
          segments?: Json | null
          uploaded_by: string
        }
        Update: {
          audio_url?: string
          created_at?: string
          id?: string
          raw_text_ar?: string | null
          recorded_at?: string | null
          recorded_with?: string | null
          segments?: Json | null
          uploaded_by?: string
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
      proposal_status_type: "pending" | "approved" | "rejected"
      relationship_status_type: "current" | "divorced" | "widowed"
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
      proposal_status_type: ["pending", "approved", "rejected"],
      relationship_status_type: ["current", "divorced", "widowed"],
      relationship_type: ["spouse", "adopted_by", "raised_by", "godparent"],
      user_role: ["admin", "editor", "viewer"],
    },
  },
} as const
