import type {
  ChatMessage,
  Contact,
  DateOrder,
  MessageDate,
  ParsedChat,
  Sale,
} from "./types";

const INVISIBLE_RE =
  /[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\u061c\u00ad\ufeff]/g;
const SPACE_RE = /[\u00a0\u202f\u2009]/g;
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

const IOS_HEADER_RE =
  /^\[(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})[,\u060c]?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm]|ص|م)?\]\s*([^:]{1,120}?):\s?([\s\S]*)$/;
const ANDROID_HEADER_RE =
  /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})[,\u060c]?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm]|ص|م)?\s+[-–—]\s+([^:]{1,120}?):\s?([\s\S]*)$/;
const DATED_LINE_RE =
  /^(?:\[)?\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}[,\u060c]?/;

const PACKAGE_RE =
  /(?:(?:ال)?باق[ةه](?:ات)?\s*)?(?:ال\s*)?(\d+(?:[.,]\d+)?)\s*(?:جيجا(?:بايت)?|جيغا|جيج|giga(?:bytes?)?|gb)(?![a-zA-Z\u0600-\u06ff])/i;

const PHONE_IN_TEXT_RE = /(?:\+\d[\d\s\-()]{7,}\d|\b0\d[\d\s\-()]{6,}\d)/g;

interface ParsedMessage {
  date: MessageDate;
  sender: string;
  body: string;
}

interface Range {
  start: number;
  end: number;
}

export interface ParseOptions {
  unknownCustomer?: string;
  unknownSender?: string;
}

export function cleanText(value: string): string {
  return value.replace(INVISIBLE_RE, "").replace(SPACE_RE, " ").trim();
}

function normalizeDigits(value: string): string {
  return value
    .replace(/\u066c/g, ",")
    .replace(/\u066b/g, ".")
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const arabic = ARABIC_INDIC.indexOf(digit);
      if (arabic >= 0) return String(arabic);
      return String(EXTENDED_ARABIC_INDIC.indexOf(digit));
    });
}

function parseNumber(value: string): number {
  const normalized = value.trim();
  if (/^\d{1,3}(?:,\d{3})+$/.test(normalized)) {
    return Number(normalized.replace(/,/g, ""));
  }
  return Number(normalized.replace(/,/g, "."));
}

function parseHeader(
  match: RegExpExecArray,
  unknownSender: string,
): ParsedMessage | null {
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);
  const firstIsYear = match[1].length === 4 || first > 31;

  let tokens: [number, number, number];
  if (firstIsYear) {
    tokens = [first, second, third];
  } else {
    const year = match[3].length <= 2 ? 2000 + third : third;
    tokens = [first, second, year];
  }

  let hour = Number(match[4]);
  const marker = cleanText(match[7] ?? "").toLowerCase();
  if (marker === "pm" || marker === "م") {
    if (hour < 12) hour += 12;
  } else if (marker === "am" || marker === "ص") {
    if (hour === 12) hour = 0;
  }

  const minute = Number(match[5]);
  const secondOfMinute = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || secondOfMinute > 59) return null;

  return {
    date: {
      tokens,
      yearFirst: firstIsYear,
      hour,
      minute,
      second: secondOfMinute,
    },
    sender: cleanText(match[8]) || unknownSender,
    body: match[9] ?? "",
  };
}

function resolveYmd(
  parts: MessageDate,
  order: DateOrder,
): { year: number; month: number; day: number } {
  if (parts.yearFirst) {
    return { year: parts.tokens[0], month: parts.tokens[1], day: parts.tokens[2] };
  }
  const [first, second, year] = parts.tokens;
  return order === "dmy"
    ? { year, month: second, day: first }
    : { year, month: first, day: second };
}

export function resolveDate(parts: MessageDate, order: DateOrder): Date {
  const { year, month, day } = resolveYmd(parts, order);
  return new Date(year, month - 1, day, parts.hour, parts.minute, parts.second);
}

function isValidYmd(
  ymd: { year: number; month: number; day: number },
  parts: MessageDate,
): boolean {
  if (ymd.month < 1 || ymd.month > 12 || ymd.day < 1 || ymd.day > 31) {
    return false;
  }
  const date = new Date(
    ymd.year,
    ymd.month - 1,
    ymd.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (
    date.getFullYear() === ymd.year &&
    date.getMonth() === ymd.month - 1 &&
    date.getDate() === ymd.day
  );
}

function isValidDate(parts: MessageDate): boolean {
  if (parts.yearFirst) return isValidYmd(resolveYmd(parts, "dmy"), parts);
  return (
    isValidYmd(resolveYmd(parts, "dmy"), parts) ||
    isValidYmd(resolveYmd(parts, "mdy"), parts)
  );
}

function inferDateOrder(dates: MessageDate[]): {
  order: DateOrder;
  ambiguous: boolean;
} {
  let dayFirst = 0;
  let monthFirst = 0;
  const ambiguousDates: MessageDate[] = [];

  for (const parts of dates) {
    if (parts.yearFirst) continue;
    const [first, second] = parts.tokens;
    if (first > 31 || second > 31) continue;
    if (first > 12 && second <= 12) {
      dayFirst += 1;
    } else if (second > 12 && first <= 12) {
      monthFirst += 1;
    } else if (first <= 12 && second <= 12) {
      ambiguousDates.push(parts);
    }
  }

  if (dayFirst !== monthFirst) {
    return { order: dayFirst > monthFirst ? "dmy" : "mdy", ambiguous: false };
  }
  if (dayFirst > 0) return { order: "dmy", ambiguous: true };

  if (ambiguousDates.length > 0) {
    const cutoff = Date.now() + 24 * 60 * 60 * 1000;
    let dmyFuture = 0;
    let mdyFuture = 0;
    for (const parts of ambiguousDates) {
      if (resolveDate(parts, "dmy").getTime() > cutoff) dmyFuture += 1;
      if (resolveDate(parts, "mdy").getTime() > cutoff) mdyFuture += 1;
    }
    if (dmyFuture !== mdyFuture) {
      return {
        order: dmyFuture < mdyFuture ? "dmy" : "mdy",
        ambiguous: true,
      };
    }
    return { order: "dmy", ambiguous: true };
  }

  return { order: "dmy", ambiguous: false };
}

function findPrice(
  body: string,
  excluded: Range[],
): { value: number; range: Range } | null {
  const candidateRe = /\d+(?:[.,]\d+)?/g;
  const candidates: { value: number; range: Range }[] = [];
  let match: RegExpExecArray | null;

  while ((match = candidateRe.exec(body))) {
    const start = match.index;
    const end = start + match[0].length;
    if (excluded.some((range) => start < range.end && end > range.start)) {
      continue;
    }
    candidates.push({
      value: parseNumber(match[0]),
      range: { start, end },
    });
  }

  if (candidates.length === 0) return null;

  const currencyRe = /^\s*(?:جنيه|جنية|جنيها|ج\.?\s?م|egp|le|pounds?)/i;
  const withCurrency = candidates.find((candidate) =>
    currencyRe.test(body.slice(candidate.range.end, candidate.range.end + 16)),
  );
  return withCurrency ?? candidates[0];
}

function cleanupName(value: string): string {
  return value
    .replace(/[()\[\]{}]/g, " ")
    .replace(/(?:^|\s)(?:ال)?باق[ةه](?:ات)?(?=\s|$)/g, " ")
    .replace(/(?:^|\s)ال(?=\s|$)/g, " ")
    .replace(/(?:^|\s)(?:بـ|ب|لـ|ل)(?=\s|$)/g, " ")
    .replace(/(^|\s)ل(?=[أإآ])/g, "$1")
    .replace(/(?:جنيه|جنية|جنيها|ج\.?\s?م)/g, " ")
    .replace(/(?:^|\s)(?:egp|le|pounds?)(?=\s|$)/gi, " ")
    .replace(/(?:لمدة\s+)?شهر(?:ين)?/g, " ")
    .replace(/[-–—:|،,;.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asPhoneOnly(body: string): string | null {
  if (!/^\+?[\d\s\-()]+$/.test(body)) return null;
  const digits = body.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return body.trim();
}

function parseSale(
  bodyRaw: string,
  date: MessageDate,
  sender: string,
  index: number,
  unknownCustomer: string,
): { sale?: Sale; contact?: Contact } {
  const body = cleanText(normalizeDigits(bodyRaw));
  if (!body) return {};

  const phoneOnly = asPhoneOnly(body);
  if (phoneOnly) {
    return { contact: { phone: phoneOnly, date, sender, raw: body } };
  }

  const packageMatch = PACKAGE_RE.exec(body);
  if (!packageMatch) return {};

  const gb = parseNumber(packageMatch[1]);
  if (!Number.isFinite(gb) || gb <= 0) return {};

  const packageRange: Range = {
    start: packageMatch.index,
    end: packageMatch.index + packageMatch[0].length,
  };

  const phoneMatches: RegExpExecArray[] = [];
  PHONE_IN_TEXT_RE.lastIndex = 0;
  let phoneMatch: RegExpExecArray | null;
  while ((phoneMatch = PHONE_IN_TEXT_RE.exec(body))) {
    phoneMatches.push(phoneMatch);
  }
  const phoneRanges: Range[] = phoneMatches.map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));

  const price = findPrice(body, [packageRange, ...phoneRanges]);
  if (!price || price.value <= 0) return {};

  const ranges = [packageRange, price.range, ...phoneRanges].sort(
    (a, b) => b.start - a.start,
  );
  let name = body;
  for (const range of ranges) {
    name = `${name.slice(0, range.start)} ${name.slice(range.end)}`;
  }
  const firstLine =
    name
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  name = cleanupName(firstLine);

  const phone = phoneMatches.length
    ? phoneMatches[0][0].replace(/\s+/g, "")
    : undefined;

  return {
    sale: {
      id: `sale-${index}`,
      date,
      customer: name || unknownCustomer,
      phone,
      packageGb: gb,
      price: price.value,
      sender,
      raw: body,
    },
  };
}

export function parseWhatsAppChat(
  text: string,
  fileName: string,
  options: ParseOptions = {},
): ParsedChat {
  const unknownCustomer = options.unknownCustomer ?? "Unknown customer";
  const unknownSender = options.unknownSender ?? "Unknown";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const messages: ParsedMessage[] = [];
  let current: ParsedMessage | null = null;

  for (const rawLine of lines) {
    const line = cleanText(normalizeDigits(rawLine));

    if (!line) {
      if (current) current.body += "\n";
      continue;
    }

    const match = IOS_HEADER_RE.exec(line) ?? ANDROID_HEADER_RE.exec(line);
    if (match) {
      const parsed = parseHeader(match, unknownSender);
      if (parsed) {
        messages.push(parsed);
        current = parsed;
      } else {
        current = null;
      }
      continue;
    }

    if (DATED_LINE_RE.test(line)) {
      current = null;
      continue;
    }

    if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }

  const validMessages = messages.filter((message) => isValidDate(message.date));
  const { order, ambiguous } = inferDateOrder(
    validMessages.map((message) => message.date),
  );

  const sales: Sale[] = [];
  const contactsByDigits = new Map<string, Contact>();
  const otherMessages: ChatMessage[] = [];

  validMessages.forEach((message, index) => {
    const result = parseSale(
      message.body,
      message.date,
      message.sender,
      index,
      unknownCustomer,
    );
    if (result.sale) {
      sales.push(result.sale);
    } else if (result.contact) {
      const key = result.contact.phone.replace(/\D/g, "");
      if (!contactsByDigits.has(key)) {
        contactsByDigits.set(key, result.contact);
      }
    } else if (message.body.trim()) {
      otherMessages.push({
        id: `message-${index}`,
        date: message.date,
        sender: message.sender,
        body: message.body.trim(),
      });
    }
  });

  const senders = Array.from(
    new Set(validMessages.map((message) => message.sender).filter(Boolean)),
  );

  return {
    version: 2,
    fileName,
    parsedAt: Date.now(),
    messageCount: validMessages.length,
    dateOrder: order,
    dateOrderAmbiguous: ambiguous,
    senders,
    sales,
    contacts: Array.from(contactsByDigits.values()),
    messages: otherMessages,
  };
}
