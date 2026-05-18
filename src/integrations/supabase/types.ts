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
      account_deletion_log: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          reason: string | null
          requested_at: string
          scheduled_for: string
          status: string
          stripe_subscription_cancelled: boolean | null
          tables_purged: Json | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          scheduled_for: string
          status?: string
          stripe_subscription_cancelled?: boolean | null
          tables_purged?: Json | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: string
          stripe_subscription_cancelled?: boolean | null
          tables_purged?: Json | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      activation_nudge_log: {
        Row: {
          day_number: number
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          day_number: number
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          day_number?: number
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_insights_cache: {
        Row: {
          created_at: string
          expense_count_at_generation: number
          generated_on: string
          insights: Json
          language: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expense_count_at_generation?: number
          generated_on?: string
          insights?: Json
          language?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expense_count_at_generation?: number
          generated_on?: string
          insights?: Json
          language?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_diagnostics_logs: {
        Row: {
          app_version: string | null
          created_at: string
          details: Json | null
          device_info: Json | null
          event: string
          id: string
          route: string | null
          session_id: string
          severity: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          details?: Json | null
          device_info?: Json | null
          event: string
          id?: string
          route?: string | null
          session_id: string
          severity?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          details?: Json | null
          device_info?: Json | null
          event?: string
          id?: string
          route?: string | null
          session_id?: string
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_uid: string
          balance: number | null
          balance_updated_at: string | null
          business_profile_id: string | null
          connection_id: string
          created_at: string
          currency: string
          iban: string | null
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          linked_payment_source_id: string | null
          name: string | null
          product: string | null
          raw_payload: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_uid: string
          balance?: number | null
          balance_updated_at?: string | null
          business_profile_id?: string | null
          connection_id: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          linked_payment_source_id?: string | null
          name?: string | null
          product?: string | null
          raw_payload?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_uid?: string
          balance?: number | null
          balance_updated_at?: string | null
          business_profile_id?: string | null
          connection_id?: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          linked_payment_source_id?: string | null
          name?: string | null
          product?: string | null
          raw_payload?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_linked_payment_source_id_fkey"
            columns: ["linked_payment_source_id"]
            isOneToOne: false
            referencedRelation: "custom_payment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          account_id: string | null
          aspsp_country: string | null
          aspsp_name: string | null
          bank_name: string
          business_profile_id: string | null
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: string
          session_id: string | null
          state_token: string | null
          status: string | null
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          account_id?: string | null
          aspsp_country?: string | null
          aspsp_name?: string | null
          bank_name: string
          business_profile_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: string
          session_id?: string | null
          state_token?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          account_id?: string | null
          aspsp_country?: string | null
          aspsp_name?: string | null
          bank_name?: string
          business_profile_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string
          session_id?: string | null
          state_token?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
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
      business_debts: {
        Row: {
          amount: number
          business_profile_id: string
          contact_name: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          paid_amount: number
          source_expense_id: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          business_profile_id: string
          contact_name: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          paid_amount?: number
          source_expense_id?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          business_profile_id?: string
          contact_name?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          paid_amount?: number
          source_expense_id?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_debts_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_debts_source_expense_id_fkey"
            columns: ["source_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_premises: {
        Row: {
          address: string | null
          business_profile_id: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean | null
          label: string | null
          name: string
          postal_code: string | null
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          business_profile_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          label?: string | null
          name?: string
          postal_code?: string | null
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          business_profile_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          label?: string | null
          name?: string
          postal_code?: string | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_premises_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          activity_code: string | null
          activity_description: string | null
          address: string | null
          bank_name: string | null
          city: string | null
          company_name: string
          country: string | null
          court_registry: string | null
          created_at: string
          email: string | null
          enabled_modules: string[] | null
          iban: string | null
          id: string
          industry_type: string | null
          invoice_footer: string | null
          invoice_header: string | null
          invoice_payment_days: number | null
          is_active: boolean
          is_vat_payer: boolean | null
          legal_form: string | null
          logo_url: string | null
          mbs: string | null
          oib: string | null
          owner_name: string | null
          phone: string | null
          postal_code: string | null
          theme_color: string | null
          updated_at: string
          user_id: string
          vat_exemption_note: string | null
          vat_id: string | null
          vat_obligation_type: string | null
          website: string | null
        }
        Insert: {
          activity_code?: string | null
          activity_description?: string | null
          address?: string | null
          bank_name?: string | null
          city?: string | null
          company_name: string
          country?: string | null
          court_registry?: string | null
          created_at?: string
          email?: string | null
          enabled_modules?: string[] | null
          iban?: string | null
          id?: string
          industry_type?: string | null
          invoice_footer?: string | null
          invoice_header?: string | null
          invoice_payment_days?: number | null
          is_active?: boolean
          is_vat_payer?: boolean | null
          legal_form?: string | null
          logo_url?: string | null
          mbs?: string | null
          oib?: string | null
          owner_name?: string | null
          phone?: string | null
          postal_code?: string | null
          theme_color?: string | null
          updated_at?: string
          user_id: string
          vat_exemption_note?: string | null
          vat_id?: string | null
          vat_obligation_type?: string | null
          website?: string | null
        }
        Update: {
          activity_code?: string | null
          activity_description?: string | null
          address?: string | null
          bank_name?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          court_registry?: string | null
          created_at?: string
          email?: string | null
          enabled_modules?: string[] | null
          iban?: string | null
          id?: string
          industry_type?: string | null
          invoice_footer?: string | null
          invoice_header?: string | null
          invoice_payment_days?: number | null
          is_active?: boolean
          is_vat_payer?: boolean | null
          legal_form?: string | null
          logo_url?: string | null
          mbs?: string | null
          oib?: string | null
          owner_name?: string | null
          phone?: string | null
          postal_code?: string | null
          theme_color?: string | null
          updated_at?: string
          user_id?: string
          vat_exemption_note?: string | null
          vat_id?: string | null
          vat_obligation_type?: string | null
          website?: string | null
        }
        Relationships: []
      }
      cash_registers: {
        Row: {
          balance: number
          business_profile_id: string
          created_at: string
          device_type: string | null
          id: string
          is_active: boolean | null
          label: string | null
          name: string
          premise_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          business_profile_id: string
          created_at?: string
          device_type?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          name?: string
          premise_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          business_profile_id?: string
          created_at?: string
          device_type?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          name?: string
          premise_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_premise_id_fkey"
            columns: ["premise_id"]
            isOneToOne: false
            referencedRelation: "business_premises"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          business_profile_id: string | null
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          business_profile_id?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          business_profile_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          business_profile_id: string
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          oib: string | null
          phone: string | null
          postal_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          business_profile_id: string
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          oib?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          business_profile_id?: string
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          oib?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
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
          business_profile_id: string | null
          color: string
          created_at: string
          currency: string | null
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
          business_profile_id?: string | null
          color?: string
          created_at?: string
          currency?: string | null
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
          business_profile_id?: string | null
          color?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          icon?: string
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_payment_sources_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_hidden_sources: {
        Row: {
          created_at: string
          source_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          source_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          source_id?: string
          user_id?: string
        }
        Relationships: []
      }
      dpa_requests: {
        Row: {
          company_address: string | null
          company_name: string
          company_oib: string | null
          contact_email: string | null
          document_type: string
          download_count: number
          generated_at: string
          id: string
          language: string
          user_id: string
        }
        Insert: {
          company_address?: string | null
          company_name: string
          company_oib?: string | null
          contact_email?: string | null
          document_type?: string
          download_count?: number
          generated_at?: string
          id?: string
          language?: string
          user_id: string
        }
        Update: {
          company_address?: string | null
          company_name?: string
          company_oib?: string | null
          contact_email?: string | null
          document_type?: string
          download_count?: number
          generated_at?: string
          id?: string
          language?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          ai_extracted: boolean | null
          amount: number
          bank_account_id: string | null
          bank_transaction_id: string | null
          budget_id: string | null
          business_profile_id: string | null
          cash_register_id: string | null
          category: string
          collaborator_id: string | null
          created_at: string
          currency: string | null
          date: string
          description: string
          expense_nature: string | null
          id: string
          import_batch_id: string | null
          income_source_id: string | null
          invoice_id: string | null
          is_advance: boolean
          linked_advance_ids: string[]
          location_coords: string | null
          location_name: string | null
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
          vat_amount: number | null
          vat_rate: number | null
          work_type: Database["public"]["Enums"]["expense_work_type"] | null
        }
        Insert: {
          ai_extracted?: boolean | null
          amount: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          budget_id?: string | null
          business_profile_id?: string | null
          cash_register_id?: string | null
          category?: string
          collaborator_id?: string | null
          created_at?: string
          currency?: string | null
          date?: string
          description: string
          expense_nature?: string | null
          id?: string
          import_batch_id?: string | null
          income_source_id?: string | null
          invoice_id?: string | null
          is_advance?: boolean
          linked_advance_ids?: string[]
          location_coords?: string | null
          location_name?: string | null
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
          vat_amount?: number | null
          vat_rate?: number | null
          work_type?: Database["public"]["Enums"]["expense_work_type"] | null
        }
        Update: {
          ai_extracted?: boolean | null
          amount?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          budget_id?: string | null
          business_profile_id?: string | null
          cash_register_id?: string | null
          category?: string
          collaborator_id?: string | null
          created_at?: string
          currency?: string | null
          date?: string
          description?: string
          expense_nature?: string | null
          id?: string
          import_batch_id?: string | null
          income_source_id?: string | null
          invoice_id?: string | null
          is_advance?: boolean
          linked_advance_ids?: string[]
          location_coords?: string | null
          location_name?: string | null
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
          vat_amount?: number | null
          vat_rate?: number | null
          work_type?: Database["public"]["Enums"]["expense_work_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "project_collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "project_invoices"
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
      feedback_submissions: {
        Row: {
          app_version: string | null
          console_tail: Json | null
          created_at: string
          diagnostics: Json | null
          email: string | null
          id: string
          language: string | null
          message: string
          platform: string | null
          rating: number | null
          route: string | null
          status: string
          type: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
          viewport: string | null
        }
        Insert: {
          app_version?: string | null
          console_tail?: Json | null
          created_at?: string
          diagnostics?: Json | null
          email?: string | null
          id?: string
          language?: string | null
          message: string
          platform?: string | null
          rating?: number | null
          route?: string | null
          status?: string
          type: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Update: {
          app_version?: string | null
          console_tail?: Json | null
          created_at?: string
          diagnostics?: Json | null
          email?: string | null
          id?: string
          language?: string | null
          message?: string
          platform?: string | null
          rating?: number | null
          route?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Relationships: []
      }
      funnel_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json | null
          occurred_at: string
          platform: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          platform?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          platform?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      health_summaries: {
        Row: {
          created_at: string
          generated_by: string | null
          id: string
          language: string
          metrics_json: Json | null
          summary_date: string
          summary_text: string
        }
        Insert: {
          created_at?: string
          generated_by?: string | null
          id?: string
          language?: string
          metrics_json?: Json | null
          summary_date?: string
          summary_text: string
        }
        Update: {
          created_at?: string
          generated_by?: string | null
          id?: string
          language?: string
          metrics_json?: Json | null
          summary_date?: string
          summary_text?: string
        }
        Relationships: []
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
      inventory_items: {
        Row: {
          business_profile_id: string
          category: string | null
          created_at: string
          current_quantity: number | null
          id: string
          min_quantity: number | null
          name: string
          purchase_price: number | null
          selling_price: number | null
          sku: string | null
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_profile_id: string
          category?: string | null
          created_at?: string
          current_quantity?: number | null
          id?: string
          min_quantity?: number | null
          name: string
          purchase_price?: number | null
          selling_price?: number | null
          sku?: string | null
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_profile_id?: string
          category?: string | null
          created_at?: string
          current_quantity?: number | null
          id?: string
          min_quantity?: number | null
          name?: string
          purchase_price?: number | null
          selling_price?: number | null
          sku?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          expense_id: string | null
          id: string
          item_id: string
          note: string | null
          price: number | null
          quantity: number
          type: string
        }
        Insert: {
          created_at?: string
          expense_id?: string | null
          id?: string
          item_id: string
          note?: string | null
          price?: number | null
          quantity: number
          type: string
        }
        Update: {
          created_at?: string
          expense_id?: string | null
          id?: string
          item_id?: string
          note?: string | null
          price?: number | null
          quantity?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          discount: number | null
          id: string
          invoice_id: string
          quantity: number | null
          total: number | null
          unit: string | null
          unit_price: number | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          description: string
          discount?: number | null
          id?: string
          invoice_id: string
          quantity?: number | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          discount?: number | null
          id?: string
          invoice_id?: string
          quantity?: number | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          id: string
          invoice_id: string
          message_id: string | null
          recipient_email: string
          sent_at: string
          stage: number
          trigger: string
        }
        Insert: {
          id?: string
          invoice_id: string
          message_id?: string | null
          recipient_email: string
          sent_at?: string
          stage: number
          trigger: string
        }
        Update: {
          id?: string
          invoice_id?: string
          message_id?: string | null
          recipient_email?: string
          sent_at?: string
          stage?: number
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "project_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          business_profile_id: string
          client_id: string | null
          created_at: string
          due_date: string | null
          eracun_sent: boolean | null
          eracun_sent_at: string | null
          fiscalization_jir: string | null
          fiscalization_zki: string | null
          fiscalized_at: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_at: string | null
          status: string | null
          total_amount: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
        }
        Insert: {
          business_profile_id: string
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          eracun_sent?: boolean | null
          eracun_sent_at?: string | null
          fiscalization_jir?: string | null
          fiscalization_zki?: string | null
          fiscalized_at?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
        }
        Update: {
          business_profile_id?: string
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          eracun_sent?: boolean | null
          eracun_sent_at?: string | null
          fiscalization_jir?: string | null
          fiscalization_zki?: string | null
          fiscalized_at?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lifetime_purchases: {
        Row: {
          amount_paid: number
          created_at: string
          currency: string
          founding_member_number: number
          id: string
          purchased_at: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          created_at?: string
          currency?: string
          founding_member_number: number
          id?: string
          purchased_at?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          currency?: string
          founding_member_number?: number
          id?: string
          purchased_at?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string
          user_id?: string
        }
        Relationships: []
      }
      milestone_budget_alerts: {
        Row: {
          id: string
          milestone_id: string
          project_id: string
          sent_at: string
          threshold: number
          usage_pct: number
          user_id: string
        }
        Insert: {
          id?: string
          milestone_id: string
          project_id: string
          sent_at?: string
          threshold: number
          usage_pct: number
          user_id: string
        }
        Update: {
          id?: string
          milestone_id?: string
          project_id?: string
          sent_at?: string
          threshold?: number
          usage_pct?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_budget_alerts_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_budget_alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_budget_revisions: {
        Row: {
          change_type:
            | Database["public"]["Enums"]["milestone_revision_type"]
            | null
          coverage: Database["public"]["Enums"]["milestone_revision_coverage"]
          created_at: string
          delta: number | null
          id: string
          linked_milestone_id: string | null
          linked_revision_id: string | null
          milestone_id: string
          new_amount: number
          previous_amount: number
          project_id: string
          reason: string
          user_id: string
        }
        Insert: {
          change_type?:
            | Database["public"]["Enums"]["milestone_revision_type"]
            | null
          coverage?: Database["public"]["Enums"]["milestone_revision_coverage"]
          created_at?: string
          delta?: number | null
          id?: string
          linked_milestone_id?: string | null
          linked_revision_id?: string | null
          milestone_id: string
          new_amount?: number
          previous_amount?: number
          project_id: string
          reason: string
          user_id: string
        }
        Update: {
          change_type?:
            | Database["public"]["Enums"]["milestone_revision_type"]
            | null
          coverage?: Database["public"]["Enums"]["milestone_revision_coverage"]
          created_at?: string
          delta?: number | null
          id?: string
          linked_milestone_id?: string | null
          linked_revision_id?: string | null
          milestone_id?: string
          new_amount?: number
          previous_amount?: number
          project_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_budget_revisions_linked_milestone_id_fkey"
            columns: ["linked_milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_budget_revisions_linked_revision_id_fkey"
            columns: ["linked_revision_id"]
            isOneToOne: false
            referencedRelation: "milestone_budget_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_budget_revisions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_budget_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_checklist_items: {
        Row: {
          created_at: string
          done_at: string | null
          done_by: string | null
          id: string
          is_done: boolean
          milestone_id: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_done?: boolean
          milestone_id: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_done?: boolean
          milestone_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_checklist_items_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_alerts_log: {
        Row: {
          affected_users: number
          alert_signature: string
          created_at: string
          details: Json | null
          error_count: number
          id: string
          notified: boolean
          notified_email: boolean
          sample_message: string | null
          sample_route: string | null
          source: string
          triggered_at: string
        }
        Insert: {
          affected_users?: number
          alert_signature: string
          created_at?: string
          details?: Json | null
          error_count?: number
          id?: string
          notified?: boolean
          notified_email?: boolean
          sample_message?: string | null
          sample_route?: string | null
          source?: string
          triggered_at?: string
        }
        Update: {
          affected_users?: number
          alert_signature?: string
          created_at?: string
          details?: Json | null
          error_count?: number
          id?: string
          notified?: boolean
          notified_email?: boolean
          sample_message?: string | null
          sample_route?: string | null
          source?: string
          triggered_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          broadcast_enabled: boolean
          budgets_enabled: boolean
          chat_enabled: boolean
          created_at: string
          daily_summary_enabled: boolean
          daily_summary_last_sent_on: string | null
          daily_summary_paused_until: string | null
          daily_summary_unopened_streak: number
          daily_summary_weekend_enabled: boolean
          id: string
          pending_enabled: boolean
          projects_enabled: boolean
          reminders_enabled: boolean
          transactions_enabled: boolean
          trial_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          broadcast_enabled?: boolean
          budgets_enabled?: boolean
          chat_enabled?: boolean
          created_at?: string
          daily_summary_enabled?: boolean
          daily_summary_last_sent_on?: string | null
          daily_summary_paused_until?: string | null
          daily_summary_unopened_streak?: number
          daily_summary_weekend_enabled?: boolean
          id?: string
          pending_enabled?: boolean
          projects_enabled?: boolean
          reminders_enabled?: boolean
          transactions_enabled?: boolean
          trial_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          broadcast_enabled?: boolean
          budgets_enabled?: boolean
          chat_enabled?: boolean
          created_at?: string
          daily_summary_enabled?: boolean
          daily_summary_last_sent_on?: string | null
          daily_summary_paused_until?: string | null
          daily_summary_unopened_streak?: number
          daily_summary_weekend_enabled?: boolean
          id?: string
          pending_enabled?: boolean
          projects_enabled?: boolean
          reminders_enabled?: boolean
          transactions_enabled?: boolean
          trial_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          deleted_at: string | null
          deletion_scheduled_at: string | null
          display_name: string | null
          id: string
          multi_currency_enabled: boolean | null
          onboarding_completed: boolean
          preferred_language: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          display_name?: string | null
          id?: string
          multi_currency_enabled?: boolean | null
          onboarding_completed?: boolean
          preferred_language?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          display_name?: string | null
          id?: string
          multi_currency_enabled?: boolean | null
          onboarding_completed?: boolean
          preferred_language?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_activity_log: {
        Row: {
          action_description: string
          action_type: string
          created_at: string
          id: string
          metadata: Json | null
          project_id: string
          user_id: string | null
        }
        Insert: {
          action_description: string
          action_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          project_id: string
          user_id?: string | null
        }
        Update: {
          action_description?: string
          action_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity_push_throttle: {
        Row: {
          activity_bucket: string
          last_sent_at: string
          pending_count: number
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_bucket: string
          last_sent_at?: string
          pending_count?: number
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_bucket?: string
          last_sent_at?: string
          pending_count?: number
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_budget_revisions: {
        Row: {
          created_at: string
          id: string
          new_amount: number
          previous_amount: number
          project_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_amount: number
          previous_amount: number
          project_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_amount?: number
          previous_amount?: number
          project_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_collaborators: {
        Row: {
          company_name: string | null
          contact_info: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string
          milestone_id: string | null
          note: string | null
          paid_amount: number
          project_id: string
          service_description: string
          status: string
          total_price: number
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          contact_info?: string | null
          created_at?: string
          first_name: string
          id?: string
          last_name: string
          milestone_id?: string | null
          note?: string | null
          paid_amount?: number
          project_id: string
          service_description: string
          status?: string
          total_price?: number
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          contact_info?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          milestone_id?: string | null
          note?: string | null
          paid_amount?: number
          project_id?: string
          service_description?: string
          status?: string
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contract_amendments: {
        Row: {
          amendment_amount: number
          created_at: string
          id: string
          linked_milestone_id: string | null
          linked_revision_id: string | null
          note: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          amendment_amount: number
          created_at?: string
          id?: string
          linked_milestone_id?: string | null
          linked_revision_id?: string | null
          note?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          amendment_amount?: number
          created_at?: string
          id?: string
          linked_milestone_id?: string | null
          linked_revision_id?: string | null
          note?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contract_amendments_linked_milestone_id_fkey"
            columns: ["linked_milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contract_amendments_linked_revision_id_fkey"
            columns: ["linked_revision_id"]
            isOneToOne: false
            referencedRelation: "milestone_budget_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contract_amendments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          ai_analysis: Json | null
          captured_at: string | null
          created_at: string
          document_kind: string | null
          id: string
          location_coords: string | null
          location_name: string | null
          mime_type: string
          name: string
          project_id: string
          size_bytes: number
          storage_mode: string
          storage_path: string
          tags: string[]
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          ai_analysis?: Json | null
          captured_at?: string | null
          created_at?: string
          document_kind?: string | null
          id?: string
          location_coords?: string | null
          location_name?: string | null
          mime_type?: string
          name: string
          project_id: string
          size_bytes?: number
          storage_mode?: string
          storage_path: string
          tags?: string[]
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          ai_analysis?: Json | null
          captured_at?: string | null
          created_at?: string
          document_kind?: string | null
          id?: string
          location_coords?: string | null
          location_name?: string | null
          mime_type?: string
          name?: string
          project_id?: string
          size_bytes?: number
          storage_mode?: string
          storage_path?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_estimates: {
        Row: {
          accepted_project_id: string | null
          business_profile_id: string
          client_address: string | null
          client_name: string
          client_oib: string | null
          created_at: string
          estimate_number: string
          id: string
          items: Json
          notes: string | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          user_id: string
          valid_until: string | null
          vat_amount: number
        }
        Insert: {
          accepted_project_id?: string | null
          business_profile_id: string
          client_address?: string | null
          client_name: string
          client_oib?: string | null
          created_at?: string
          estimate_number: string
          id?: string
          items?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id: string
          valid_until?: string | null
          vat_amount?: number
        }
        Update: {
          accepted_project_id?: string | null
          business_profile_id?: string
          client_address?: string | null
          client_name?: string
          client_oib?: string | null
          created_at?: string
          estimate_number?: string
          id?: string
          items?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
          valid_until?: string | null
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_estimates_accepted_project_id_fkey"
            columns: ["accepted_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_estimates_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
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
          default_permissions: Json
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_user_id: string | null
          project_id: string
          role: string
          status: string
          suggested_context: string
          token: string
          used_at: string | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          default_permissions?: Json
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_user_id?: string | null
          project_id: string
          role?: string
          status?: string
          suggested_context?: string
          token?: string
          used_at?: string | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          default_permissions?: Json
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          project_id?: string
          role?: string
          status?: string
          suggested_context?: string
          token?: string
          used_at?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invitations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "project_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_invoices: {
        Row: {
          auto_reminders_enabled: boolean
          business_profile_id: string
          client_address: string | null
          client_email: string | null
          client_name: string
          client_oib: string | null
          created_at: string
          currency: string
          due_date: string | null
          estimate_id: string | null
          id: string
          invoice_number: string
          issue_date: string
          items: Json
          notes: string | null
          pdf_path: string | null
          project_id: string | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          user_id: string
          vat_amount: number
        }
        Insert: {
          auto_reminders_enabled?: boolean
          business_profile_id: string
          client_address?: string | null
          client_email?: string | null
          client_name: string
          client_oib?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          estimate_id?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          items?: Json
          notes?: string | null
          pdf_path?: string | null
          project_id?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id: string
          vat_amount?: number
        }
        Update: {
          auto_reminders_enabled?: boolean
          business_profile_id?: string
          client_address?: string | null
          client_email?: string | null
          client_name?: string
          client_oib?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          estimate_id?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          items?: Json
          notes?: string | null
          pdf_path?: string | null
          project_id?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_invoices_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "project_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_member_permissions: {
        Row: {
          created_at: string
          id: string
          project_id: string
          tab_key: string
          updated_at: string
          user_id: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          tab_key: string
          updated_at?: string
          user_id: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          tab_key?: string
          updated_at?: string
          user_id?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_member_permissions_project_id_fkey"
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
          member_business_profile_id: string | null
          member_context: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          joined_at?: string
          member_business_profile_id?: string | null
          member_context?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          joined_at?: string
          member_business_profile_id?: string | null
          member_context?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_member_business_profile_id_fkey"
            columns: ["member_business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
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
          color: string | null
          completed_at: string | null
          created_at: string
          depends_on_milestone_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_contingency: boolean
          name: string
          project_id: string
          reminder_days_before: number | null
          sort_order: number
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget?: number
          color?: string | null
          completed_at?: string | null
          created_at?: string
          depends_on_milestone_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_contingency?: boolean
          name: string
          project_id: string
          reminder_days_before?: number | null
          sort_order?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget?: number
          color?: string | null
          completed_at?: string | null
          created_at?: string
          depends_on_milestone_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_contingency?: boolean
          name?: string
          project_id?: string
          reminder_days_before?: number | null
          sort_order?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_depends_on_milestone_id_fkey"
            columns: ["depends_on_milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_share_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          project_id: string
          revoked_at: string | null
          show_financials: boolean
          show_milestones: boolean
          show_photos: boolean
          token: string
          updated_at: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          project_id: string
          revoked_at?: string | null
          show_financials?: boolean
          show_milestones?: boolean
          show_photos?: boolean
          token?: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          project_id?: string
          revoked_at?: string | null
          show_financials?: boolean
          show_milestones?: boolean
          show_photos?: boolean
          token?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_share_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          category: string | null
          color: string
          created_at: string
          created_by: string | null
          default_milestones: Json
          description: string | null
          icon: string
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          default_milestones?: Json
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          default_milestones?: Json
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_work_entries: {
        Row: {
          actual_hours: number
          business_profile_id: string | null
          created_at: string
          id: string
          milestone_ids: string[] | null
          note: string | null
          project_id: string | null
          scheduled_hours: number
          updated_at: string
          work_date: string
          worker_id: string
        }
        Insert: {
          actual_hours?: number
          business_profile_id?: string | null
          created_at?: string
          id?: string
          milestone_ids?: string[] | null
          note?: string | null
          project_id?: string | null
          scheduled_hours?: number
          updated_at?: string
          work_date: string
          worker_id: string
        }
        Update: {
          actual_hours?: number
          business_profile_id?: string | null
          created_at?: string
          id?: string
          milestone_ids?: string[] | null
          note?: string | null
          project_id?: string | null
          scheduled_hours?: number
          updated_at?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_work_entries_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
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
      project_work_logs: {
        Row: {
          clock_in_time: string | null
          clock_out_time: string | null
          created_at: string
          day_type: string
          hours: number | null
          id: string
          log_date: string
          milestone_id: string | null
          notes: string | null
          project_id: string
          summary: string
          updated_at: string
          user_id: string
          weather: string | null
        }
        Insert: {
          clock_in_time?: string | null
          clock_out_time?: string | null
          created_at?: string
          day_type?: string
          hours?: number | null
          id?: string
          log_date?: string
          milestone_id?: string | null
          notes?: string | null
          project_id: string
          summary: string
          updated_at?: string
          user_id: string
          weather?: string | null
        }
        Update: {
          clock_in_time?: string | null
          clock_out_time?: string | null
          created_at?: string
          day_type?: string
          hours?: number | null
          id?: string
          log_date?: string
          milestone_id?: string | null
          notes?: string | null
          project_id?: string
          summary?: string
          updated_at?: string
          user_id?: string
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_work_logs_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_work_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_workers: {
        Row: {
          business_profile_id: string | null
          created_at: string
          first_name: string
          hourly_rate: number
          id: string
          last_name: string
          position: string
          project_id: string | null
          updated_at: string
          user_id: string | null
          work_end_time: string | null
          work_hours: number
          work_start_time: string | null
        }
        Insert: {
          business_profile_id?: string | null
          created_at?: string
          first_name: string
          hourly_rate?: number
          id?: string
          last_name: string
          position: string
          project_id?: string | null
          updated_at?: string
          user_id?: string | null
          work_end_time?: string | null
          work_hours?: number
          work_start_time?: string | null
        }
        Update: {
          business_profile_id?: string | null
          created_at?: string
          first_name?: string
          hourly_rate?: number
          id?: string
          last_name?: string
          position?: string
          project_id?: string | null
          updated_at?: string
          user_id?: string | null
          work_end_time?: string | null
          work_hours?: number
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_workers_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
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
          archived_at: string | null
          business_profile_id: string | null
          color: string | null
          contract_value: number | null
          created_at: string
          description: string | null
          end_date: string | null
          icon: string | null
          id: string
          label_overrides: Json | null
          name: string
          project_type: string
          start_date: string | null
          status: string
          total_budget: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          business_profile_id?: string | null
          color?: string | null
          contract_value?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          label_overrides?: Json | null
          name: string
          project_type?: string
          start_date?: string | null
          status?: string
          total_budget?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          business_profile_id?: string | null
          color?: string | null
          contract_value?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          label_overrides?: Json | null
          name?: string
          project_type?: string
          start_date?: string | null
          status?: string
          total_budget?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_delivery_logs: {
        Row: {
          body: string | null
          created_at: string
          dispatch_error: string | null
          dispatch_status: string | null
          duration_ms: number | null
          failure_count: number
          fcm_error_codes: Json | null
          id: string
          lifecycle_stage: string | null
          request_id: string | null
          request_payload: Json | null
          response_summary: Json | null
          send_push_http_status: number | null
          source_function: string | null
          success_count: number
          title: string | null
          token_count: number
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          dispatch_error?: string | null
          dispatch_status?: string | null
          duration_ms?: number | null
          failure_count?: number
          fcm_error_codes?: Json | null
          id?: string
          lifecycle_stage?: string | null
          request_id?: string | null
          request_payload?: Json | null
          response_summary?: Json | null
          send_push_http_status?: number | null
          source_function?: string | null
          success_count?: number
          title?: string | null
          token_count?: number
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          dispatch_error?: string | null
          dispatch_status?: string | null
          duration_ms?: number | null
          failure_count?: number
          fcm_error_codes?: Json | null
          id?: string
          lifecycle_stage?: string | null
          request_id?: string | null
          request_payload?: Json | null
          response_summary?: Json | null
          send_push_http_status?: number | null
          source_function?: string | null
          success_count?: number
          title?: string | null
          token_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          platform?: string
          token?: string
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
          business_profile_id: string | null
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
          business_profile_id?: string | null
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
          business_profile_id?: string | null
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
            foreignKeyName: "recurring_transactions_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
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
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_user_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_user_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_user_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          business_profile_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_completed: boolean | null
          notified: boolean | null
          related_entity_id: string | null
          remind_at: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          business_profile_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_completed?: boolean | null
          notified?: boolean | null
          related_entity_id?: string | null
          remind_at: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          business_profile_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_completed?: boolean | null
          notified?: boolean | null
          related_entity_id?: string | null
          remind_at?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
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
      subscription_migration_log: {
        Row: {
          created_at: string
          email_sent_at: string | null
          error_message: string | null
          id: string
          migrated_at: string
          new_amount_cents: number | null
          new_price_id: string
          old_amount_cents: number | null
          old_price_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_sent_at?: string | null
          error_message?: string | null
          id?: string
          migrated_at?: string
          new_amount_cents?: number | null
          new_price_id: string
          old_amount_cents?: number | null
          old_price_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_sent_at?: string | null
          error_message?: string | null
          id?: string
          migrated_at?: string
          new_amount_cents?: number | null
          new_price_id?: string
          old_amount_cents?: number | null
          old_price_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          app_version: string | null
          auto_responder_sent: boolean
          category: string | null
          created_at: string
          email: string
          id: string
          internal_notes: string | null
          language: string | null
          message: string
          name: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          auto_responder_sent?: boolean
          category?: string | null
          created_at?: string
          email: string
          id?: string
          internal_notes?: string | null
          language?: string | null
          message: string
          name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          auto_responder_sent?: boolean
          category?: string | null
          created_at?: string
          email?: string
          id?: string
          internal_notes?: string | null
          language?: string | null
          message?: string
          name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
      travel_order_expenses: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          expense_type: string
          id: string
          travel_order_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_type: string
          id?: string
          travel_order_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_type?: string
          id?: string
          travel_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_order_expenses_travel_order_id_fkey"
            columns: ["travel_order_id"]
            isOneToOne: false
            referencedRelation: "travel_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_orders: {
        Row: {
          business_profile_id: string
          created_at: string
          daily_allowance_type: string | null
          date_from: string
          date_to: string
          destination: string
          id: string
          km_end: number | null
          km_rate: number | null
          km_start: number | null
          purpose: string | null
          status: string | null
          updated_at: string
          user_id: string
          vehicle: string | null
        }
        Insert: {
          business_profile_id: string
          created_at?: string
          daily_allowance_type?: string | null
          date_from: string
          date_to: string
          destination: string
          id?: string
          km_end?: number | null
          km_rate?: number | null
          km_start?: number | null
          purpose?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          vehicle?: string | null
        }
        Update: {
          business_profile_id?: string
          created_at?: string
          daily_allowance_type?: string | null
          date_from?: string
          date_to?: string
          destination?: string
          id?: string
          km_end?: number | null
          km_rate?: number | null
          km_start?: number | null
          purpose?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_orders_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_login_logs: {
        Row: {
          device_info: Json | null
          id: string
          logged_in_at: string
          user_id: string
        }
        Insert: {
          device_info?: Json | null
          id?: string
          logged_in_at?: string
          user_id: string
        }
        Update: {
          device_info?: Json | null
          id?: string
          logged_in_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_memories: {
        Row: {
          business_profile_id: string | null
          category: string
          content: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_profile_id?: string | null
          category?: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_profile_id?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      cleanup_old_diagnostic_logs: { Args: never; Returns: undefined }
      cleanup_old_health_summaries: { Args: never; Returns: undefined }
      cleanup_old_login_logs: { Args: never; Returns: undefined }
      cleanup_old_monitor_alerts: { Args: never; Returns: undefined }
      cleanup_old_push_logs: { Args: never; Returns: undefined }
      cleanup_stale_push_tokens: { Args: never; Returns: undefined }
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_founding_member_count: { Args: never; Returns: number }
      get_next_founding_member_number: { Args: never; Returns: number }
      has_full_payment_source_access: {
        Args: { _source_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
      is_push_category_enabled: {
        Args: { _category: string; _user_id: string }
        Returns: boolean
      }
      link_worker_to_member: {
        Args: { _user_id: string; _worker_id: string }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      expense_work_type:
        | "material"
        | "labor"
        | "equipment"
        | "permit"
        | "subcontractor"
        | "other"
      income_source_role: "owner" | "member"
      milestone_revision_coverage: "increase_total" | "transfer" | "contingency"
      milestone_revision_type:
        | "overrun"
        | "saving"
        | "scope_change"
        | "correction"
      milestone_status: "pending" | "in_progress" | "completed" | "overdue"
      project_role: "manager" | "member" | "viewer"
      project_status: "draft" | "active" | "paused" | "completed" | "cancelled"
      subscription_tier: "free" | "pro" | "business"
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
      app_role: ["admin", "user"],
      expense_work_type: [
        "material",
        "labor",
        "equipment",
        "permit",
        "subcontractor",
        "other",
      ],
      income_source_role: ["owner", "member"],
      milestone_revision_coverage: [
        "increase_total",
        "transfer",
        "contingency",
      ],
      milestone_revision_type: [
        "overrun",
        "saving",
        "scope_change",
        "correction",
      ],
      milestone_status: ["pending", "in_progress", "completed", "overdue"],
      project_role: ["manager", "member", "viewer"],
      project_status: ["draft", "active", "paused", "completed", "cancelled"],
      subscription_tier: ["free", "pro", "business"],
      transaction_status: ["pending", "approved", "rejected"],
    },
  },
} as const
