export type DateOrder = "dmy" | "mdy";

export interface MessageDate {
  tokens: [number, number, number];
  yearFirst: boolean;
  hour: number;
  minute: number;
  second: number;
}

export interface Sale {
  id: string;
  date: MessageDate;
  customer: string;
  phone?: string;
  packageGb: number;
  price: number;
  sender: string;
  raw: string;
}

export interface Contact {
  phone: string;
  date: MessageDate;
  sender: string;
  raw: string;
}

export interface ChatMessage {
  id: string;
  date: MessageDate;
  sender: string;
  body: string;
}

export interface ParsedChat {
  version: 2;
  fileName: string;
  parsedAt: number;
  messageCount: number;
  dateOrder: DateOrder;
  dateOrderAmbiguous: boolean;
  senders: string[];
  sales: Sale[];
  contacts: Contact[];
  messages: ChatMessage[];
}
