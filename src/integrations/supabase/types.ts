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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      cotacao_itens: {
        Row: {
          categoria: string | null
          codigo: string | null
          cotacao_id: string
          created_at: string
          id: string
          incoterm: string | null
          material: string
          observacao: string | null
          observacao_fornecedor: string | null
          ordem: number
          prazo_entrega: string | null
          preco_unitario: number | null
          quantidade: number
          unidade: string
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          cotacao_id: string
          created_at?: string
          id?: string
          incoterm?: string | null
          material: string
          observacao?: string | null
          observacao_fornecedor?: string | null
          ordem?: number
          prazo_entrega?: string | null
          preco_unitario?: number | null
          quantidade?: number
          unidade?: string
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          cotacao_id?: string
          created_at?: string
          id?: string
          incoterm?: string | null
          material?: string
          observacao?: string | null
          observacao_fornecedor?: string | null
          ordem?: number
          prazo_entrega?: string | null
          preco_unitario?: number | null
          quantidade?: number
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_itens_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_resposta_itens: {
        Row: {
          id: string
          incoterm: string | null
          item_id: string
          observacao_fornecedor: string | null
          prazo_entrega: string | null
          preco_unitario: number | null
          resposta_id: string
        }
        Insert: {
          id?: string
          incoterm?: string | null
          item_id: string
          observacao_fornecedor?: string | null
          prazo_entrega?: string | null
          preco_unitario?: number | null
          resposta_id: string
        }
        Update: {
          id?: string
          incoterm?: string | null
          item_id?: string
          observacao_fornecedor?: string | null
          prazo_entrega?: string | null
          preco_unitario?: number | null
          resposta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_resposta_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "cotacao_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_resposta_itens_resposta_id_fkey"
            columns: ["resposta_id"]
            isOneToOne: false
            referencedRelation: "cotacao_respostas"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_respostas: {
        Row: {
          cotacao_id: string
          created_at: string
          fornecedor: string
          id: string
        }
        Insert: {
          cotacao_id: string
          created_at?: string
          fornecedor: string
          id?: string
        }
        Update: {
          cotacao_id?: string
          created_at?: string
          fornecedor?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_respostas_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          assunto: string
          created_at: string
          data_envio: string
          fornecedor: string | null
          id: string
          observacoes: string | null
          prazo_resposta: string | null
          status: string
        }
        Insert: {
          assunto: string
          created_at?: string
          data_envio?: string
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          prazo_resposta?: string | null
          status?: string
        }
        Update: {
          assunto?: string
          created_at?: string
          data_envio?: string
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          prazo_resposta?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
