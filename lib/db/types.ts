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
        Relationships: []
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
        Relationships: []
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
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
    Functions: Record<string, never>
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
    CompositeTypes: Record<string, never>
  }
}
