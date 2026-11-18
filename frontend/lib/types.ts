export type User = {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

export type ListenerStatus = "running" | "stopped" | "error";

export type Listener = {
  id: string;
  label: string | null;
  channel_input: string;
  resolved_chat_id: number | null;
  chat_title: string | null;
  bot_username: string | null;
  status: ListenerStatus;
  last_error: string | null;
  last_error_at: string | null;
  token_hint: string;
  created_at: string;
  updated_at: string;
  payment_count: number;
  total_value: number;
  total_usd: number;
  last_activity_at: string | null;
};

export type LogKind = "message" | "event";
export type LogLevel = "info" | "warning" | "error";

export type LogItem = {
  id: number;
  kind: LogKind;
  level: LogLevel;
  text: string;
  update_id: number | null;
  message_id: number | null;
  edited_at: string | null;
  parsed_count: number;
  created_at: string;
};

export type LogPage = {
  items: LogItem[];
  next_before_id: number | null;
};

export type PaymentCurrency = "SYP" | "USD";
export type PaymentKind = "payment" | "refund";

export type Payment = {
  id: number;
  value: number;
  currency: PaymentCurrency;
  kind: PaymentKind;
  name: string;
  description: string | null;
  month: number;
  source: string;
  extra: Record<string, string> | null;
  received_at: string;
  message_date: string | null;
};

export type PaymentPage = {
  items: Payment[];
  total: number;
  total_value: number;
  total_usd: number;
  page: number;
  page_size: number;
};

export type LogFilters = {
  level?: LogLevel;
  kind?: LogKind;
};

export type PaymentFilters = {
  q?: string;
  month?: number;
  dateFrom?: string;
  dateTo?: string;
};

export type ListenerPayload = {
  label?: string | null;
  channel_input?: string;
  bot_token?: string;
};

export type PatternType = "number" | "text" | "word" | "month";

export type PatternField = {
  placeholder: string;
  target: string;
  type: PatternType;
  required: boolean;
};

export type PatternDefinition = {
  name: string;
  template: string;
  fields: PatternField[];
  defaults: Record<string, string>;
  enabled: boolean;
};

export type ExportColumnSource = "field" | "custom" | "constant";

export type ExportColumn = {
  key: string;
  header: string;
  source: ExportColumnSource;
  field: string | null;
  default: string | null;
};

export type ParserProfile = {
  id: string;
  listener_id: string | null;
  kind: "telegram" | "whatsapp";
  name: string;
  patterns: PatternDefinition[];
  export_columns: ExportColumn[];
  fallback_to_default: boolean;
  created_at: string;
  updated_at: string;
};

export type PatternProfilePayload = {
  name: string;
  patterns: PatternDefinition[];
  export_columns: ExportColumn[];
  fallback_to_default: boolean;
};

export type PatternPreviewRow = {
  value: number;
  name: string;
  description: string;
  month: number;
  source: string;
  currency: PaymentCurrency;
  kind: PaymentKind;
  extra: Record<string, string>;
  cells: string[];
};

export type PatternPreviewResponse = {
  rows: PatternPreviewRow[];
  unmatched_lines: string[];
  errors: string[];
  columns: ExportColumn[];
};

export type DateOrder = "dmy" | "mdy";

export type WhatsAppRow = {
  date: string | null;
  sender: string;
  raw: string;
  value: number | null;
  name: string;
  description: string;
  month: number | null;
  source: string;
  currency: PaymentCurrency;
  kind: PaymentKind;
  extra: Record<string, string>;
  cells: string[];
};

export type WhatsAppParseResponse = {
  rows: WhatsAppRow[];
  columns: ExportColumn[];
  message_count: number;
  row_count: number;
  unmatched_messages: number;
  date_order: DateOrder;
  date_order_ambiguous: boolean;
  total_syp: number;
  total_usd: number;
  senders: string[];
  errors: string[];
};
