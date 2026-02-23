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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bank_connections: {
        Row: {
          account_id: string | null
          bank_name: string
          created_at: string
          id: string
          last_synced_at: string | null
          provider: string
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          bank_name: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider: string
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          bank_name?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_categories: {
        Row: {
          budget_id: string
          category: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          limit_amount: number
          updated_at: string
        }
        Insert: {
          budget_id: string
          category: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          limit_amount?: number
          updated_at?: string
        }
        Update: {
          budget_id?: string
          category?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          limit_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_categories_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_invitations: {
        Row: {
          budget_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_user_id: string | null
          role: string
          status: string
          token: string
          used_at: string | null
        }
        Insert: {
          budget_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_user_id?: string | null
          role?: string
          status?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          budget_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          role?: string
          status?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_invitations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_members: {
        Row: {
          budget_id: string
          created_at: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_members_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_plans: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          end_date: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_recurring: boolean
          name: string
          period_type: string
          project_id: string | null
          start_date: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean
          name: string
          period_type?: string
          project_id?: string | null
          start_date?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean
          name?: string
          period_type?: string
          project_id?: string | null
          start_date?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          created_at: string
          description: string
          device_info: Json | null
          id: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          device_info?: Json | null
          id?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          device_info?: Json | null
          id?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_payment_sources: {
        Row: {
          balance: number
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          name: string
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          ai_extracted: boolean | null
          amount: number
          budget_id: string | null
          category: string
          created_at: string
          date: string
          description: string
          expense_nature: string | null
          id: string
          import_batch_id: string | null
          income_source_id: string | null
          merchant_name: string | null
          milestone_id: string | null
          note: string | null
          payment_source: string | null
          payment_source_card_id: string | null
          project_id: string | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          submitted_by: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_extracted?: boolean | null
          amount: number
          budget_id?: string | null
          category?: string
          created_at?: string
          date?: string
          description: string
          expense_nature?: string | null
          id?: string
          import_batch_id?: string | null
          income_source_id?: string | null
          merchant_name?: string | null
          milestone_id?: string | null
          note?: string | null
          payment_source?: string | null
          payment_source_card_id?: string | null
          project_id?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          submitted_by?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_extracted?: boolean | null
          amount?: number
          budget_id?: string | null
          category?: string
          created_at?: string
          date?: string
          description?: string
          expense_nature?: string | null
          id?: string
          import_batch_id?: string | null
          income_source_id?: string | null
          merchant_name?: string | null
          milestone_id?: string | null
          note?: string | null
          payment_source?: string | null
          payment_source_card_id?: string | null
          project_id?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          submitted_by?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payment_source_card_id_fkey"
            columns: ["payment_source_card_id"]
            isOneToOne: false
            referencedRelation: "payment_source_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      family_activity_log: {
        Row: {
          action_description: string
          action_type: string
          created_at: string
          group_id: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action_description: string
          action_type: string
          created_at?: string
          group_id: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action_description?: string
          action_type?: string
          created_at?: string
          group_id?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_activity_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      family_groups: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      family_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          group_id: string
          id: string
          invited_by: string
          invited_user_id: string | null
          role: string
          status: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string
          expires_at?: string
          group_id: string
          id?: string
          invited_by: string
          invited_user_id?: string | null
          role?: string
          status?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          group_id?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          role?: string
          status?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      family_messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      family_shared_budgets: {
        Row: {
          added_by: string
          budget_id: string
          created_at: string
          group_id: string
          id: string
        }
        Insert: {
          added_by: string
          budget_id: string
          created_at?: string
          group_id: string
          id?: string
        }
        Update: {
          added_by?: string
          budget_id?: string
          created_at?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_shared_budgets_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_shared_budgets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      family_shared_projects: {
        Row: {
          added_by: string
          created_at: string
          group_id: string
          id: string
          project_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          group_id: string
          id?: string
          project_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          group_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_shared_projects_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_shared_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      family_shared_savings: {
        Row: {
          added_by: string
          created_at: string
          group_id: string
          id: string
          savings_goal_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          group_id: string
          id?: string
          savings_goal_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          group_id?: string
          id?: string
          savings_goal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_shared_savings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_shared_savings_savings_goal_id_fkey"
            columns: ["savings_goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      family_shared_sources: {
        Row: {
          added_by: string
          created_at: string
          group_id: string
          id: string
          payment_source_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          group_id: string
          id?: string
          payment_source_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          group_id?: string
          id?: string
          payment_source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_shared_sources_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_shared_sources_payment_source_id_fkey"
            columns: ["payment_source_id"]
            isOneToOne: false
            referencedRelation: "custom_payment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      income_source_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          income_source_id: string
          invited_by: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          income_source_id: string
          invited_by: string
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          income_source_id?: string
          invited_by?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_source_invitations_income_source_id_fkey"
            columns: ["income_source_id"]
            isOneToOne: false
            referencedRelation: "income_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      income_source_members: {
        Row: {
          created_at: string
          id: string
          income_source_id: string
          joined_at: string
          role: Database["public"]["Enums"]["income_source_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          income_source_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["income_source_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          income_source_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["income_source_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_source_members_income_source_id_fkey"
            columns: ["income_source_id"]
            isOneToOne: false
            referencedRelation: "income_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      income_sources: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      installment_plans: {
        Row: {
          category: string
          created_at: string
          description: string
          first_payment_date: string
          id: string
          installment_count: number
          payment_source: string | null
          payment_source_card_id: string | null
          total_amount: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          first_payment_date: string
          id?: string
          installment_count: number
          payment_source?: string | null
          payment_source_card_id?: string | null
          total_amount: number
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          first_payment_date?: string
          id?: string
          installment_count?: number
          payment_source?: string | null
          payment_source_card_id?: string | null
          total_amount?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_payment_source_card_id_fkey"
            columns: ["payment_source_card_id"]
            isOneToOne: false
            referencedRelation: "payment_source_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          expense_id: string | null
          id: string
          installment_number: number
          paid_at: string | null
          plan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          expense_id?: string | null
          id?: string
          installment_number: number
          paid_at?: string | null
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          expense_id?: string | null
          id?: string
          installment_number?: number
          paid_at?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "installment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_source_cards: {
        Row: {
          card_name: string
          card_type: string | null
          created_at: string
          id: string
          last_four_digits: string
          payment_source_id: string
          user_id: string
        }
        Insert: {
          card_name?: string
          card_type?: string | null
          created_at?: string
          id?: string
          last_four_digits: string
          payment_source_id: string
          user_id: string
        }
        Update: {
          card_name?: string
          card_type?: string | null
          created_at?: string
          id?: string
          last_four_digits?: string
          payment_source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_source_cards_payment_source_id_fkey"
            columns: ["payment_source_id"]
            isOneToOne: false
            referencedRelation: "custom_payment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_source_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_user_id: string | null
          payment_source_id: string
          role: string
          status: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_user_id?: string | null
          payment_source_id: string
          role?: string
          status?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          payment_source_id?: string
          role?: string
          status?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_source_invitations_payment_source_id_fkey"
            columns: ["payment_source_id"]
            isOneToOne: false
            referencedRelation: "custom_payment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_source_members: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          payment_source_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          payment_source_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          payment_source_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_source_members_payment_source_id_fkey"
            columns: ["payment_source_id"]
            isOneToOne: false
            referencedRelation: "custom_payment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          currency: string | null
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_funding: {
        Row: {
          allocated_amount: number
          created_at: string
          id: string
          income_source_id: string
          percentage: number | null
          project_id: string
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          created_at?: string
          id?: string
          income_source_id: string
          percentage?: number | null
          project_id: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          id?: string
          income_source_id?: string
          percentage?: number | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_funding_income_source_id_fkey"
            columns: ["income_source_id"]
            isOneToOne: false
            referencedRelation: "income_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_funding_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_user_id: string | null
          project_id: string
          role: string
          status: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_user_id?: string | null
          project_id: string
          role?: string
          status?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          project_id?: string
          role?: string
          status?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          joined_at: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          joined_at?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          joined_at?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          budget: number
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          project_id: string
          sort_order: number
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          project_id: string
          sort_order?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          project_id?: string
          sort_order?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_work_entries: {
        Row: {
          actual_hours: number
          created_at: string
          id: string
          milestone_ids: string[] | null
          note: string | null
          project_id: string
          scheduled_hours: number
          updated_at: string
          work_date: string
          worker_id: string
        }
        Insert: {
          actual_hours?: number
          created_at?: string
          id?: string
          milestone_ids?: string[] | null
          note?: string | null
          project_id: string
          scheduled_hours?: number
          updated_at?: string
          work_date: string
          worker_id: string
        }
        Update: {
          actual_hours?: number
          created_at?: string
          id?: string
          milestone_ids?: string[] | null
          note?: string | null
          project_id?: string
          scheduled_hours?: number
          updated_at?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_work_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_work_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "project_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_workers: {
        Row: {
          created_at: string
          first_name: string
          hourly_rate: number
          id: string
          last_name: string
          position: string
          project_id: string
          updated_at: string
          work_end_time: string | null
          work_hours: number
          work_start_time: string | null
        }
        Insert: {
          created_at?: string
          first_name: string
          hourly_rate?: number
          id?: string
          last_name: string
          position: string
          project_id: string
          updated_at?: string
          work_end_time?: string | null
          work_hours?: number
          work_start_time?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          hourly_rate?: number
          id?: string
          last_name?: string
          position?: string
          project_id?: string
          updated_at?: string
          work_end_time?: string | null
          work_hours?: number
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_workers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          end_date: string | null
          icon: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          total_budget: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          total_budget?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          total_budget?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          name: string
          quantity: number | null
          total_price: number
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          name: string
          quantity?: number | null
          total_price: number
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          name?: string
          quantity?: number | null
          total_price?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          description: string
          frequency: string
          id: string
          income_source_id: string | null
          is_active: boolean
          last_generated_date: string | null
          merchant_name: string | null
          next_due_date: string
          note: string | null
          payment_source: string | null
          payment_source_card_id: string | null
          transfer_to_source: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description: string
          frequency?: string
          id?: string
          income_source_id?: string | null
          is_active?: boolean
          last_generated_date?: string | null
          merchant_name?: string | null
          next_due_date: string
          note?: string | null
          payment_source?: string | null
          payment_source_card_id?: string | null
          transfer_to_source?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string
          frequency?: string
          id?: string
          income_source_id?: string | null
          is_active?: boolean
          last_generated_date?: string | null
          merchant_name?: string | null
          next_due_date?: string
          note?: string | null
          payment_source?: string | null
          payment_source_card_id?: string | null
          transfer_to_source?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_income_source_id_fkey"
            columns: ["income_source_id"]
            isOneToOne: false
            referencedRelation: "income_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_payment_source_card_id_fkey"
            columns: ["payment_source_card_id"]
            isOneToOne: false
            referencedRelation: "payment_source_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          budget_id: string | null
          color: string | null
          completed_at: string | null
          created_at: string
          current_amount: number
          description: string | null
          icon: string | null
          id: string
          is_completed: boolean | null
          name: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          budget_id?: string | null
          color?: string | null
          completed_at?: string | null
          created_at?: string
          current_amount?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_completed?: boolean | null
          name: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          budget_id?: string | null
          color?: string | null
          completed_at?: string | null
          created_at?: string
          current_amount?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_completed?: boolean | null
          name?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_notes: {
        Row: {
          content: string
          created_at: string
          expense_id: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          expense_id: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          expense_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_notes_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_invitation_token: {
        Args: { _invitation_type: string; _token: string }
        Returns: {
          invitation_id: string
          invited_by: string
          role: string
          target_id: string
          target_name: string
        }[]
      }
      has_full_payment_source_access: {
        Args: { _source_id: string; _user_id: string }
        Returns: boolean
      }
      is_budget_member: {
        Args: { _budget_id: string; _user_id: string }
        Returns: boolean
      }
      is_budget_owner: {
        Args: { _budget_id: string; _user_id: string }
        Returns: boolean
      }
      is_family_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_family_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_income_source_member: {
        Args: { _source_id: string; _user_id: string }
        Returns: boolean
      }
      is_income_source_owner: {
        Args: { _source_id: string; _user_id: string }
        Returns: boolean
      }
      is_payment_source_member: {
        Args: { _source_id: string; _user_id: string }
        Returns: boolean
      }
      is_payment_source_owner: {
        Args: { _source_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_owner: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      income_source_role: "owner" | "member"
      milestone_status: "pending" | "in_progress" | "completed" | "overdue"
      project_role: "manager" | "member" | "viewer"
      project_status: "draft" | "active" | "paused" | "completed" | "cancelled"
      transaction_status: "pending" | "approved" | "rejected"
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
      income_source_role: ["owner", "member"],
      milestone_status: ["pending", "in_progress", "completed", "overdue"],
      project_role: ["manager", "member", "viewer"],
      project_status: ["draft", "active", "paused", "completed", "cancelled"],
      transaction_status: ["pending", "approved", "rejected"],
    },
  },
} as const
