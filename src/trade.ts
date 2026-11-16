import { parseYaml, TFile } from "obsidian";

export type TradeTimeframe = "1m" | "5m" | "15m";
export type TradeDirection = "long" | "short";

export interface TradeValues {
  accountName: string;
  symbol: string;
  riskAmount: number;
  entryTime: string;
  duration: string;
  direction: TradeDirection;
  timeframe: TradeTimeframe;
  entry: number | null;
  exit: number | null;
  rr: number | null;
  profitLoss: number | null;
  maxRR: number | null;
  followedPlan: boolean;
  rating: number;
  notes: string;
  images: string[];
}

export interface Trade extends TradeValues {
  file: TFile;
}

export interface PendingImage {
  name: string;
  data: ArrayBuffer;
  previewUrl: string;
}

export interface TradeDefaults {
  accountName: string;
  symbol: string;
  riskAmount: number;
  timeframe: TradeTimeframe;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const TIMEFRAMES: TradeTimeframe[] = ["1m", "5m", "15m"];

export function nowInputValue(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
}

export function defaultTradeValues(defaults: TradeDefaults): TradeValues {
  return {
    accountName: defaults.accountName,
    symbol: defaults.symbol,
    riskAmount: defaults.riskAmount,
    entryTime: nowInputValue(),
    duration: "",
    direction: "long",
    timeframe: defaults.timeframe,
    entry: null,
    exit: null,
    rr: null,
    profitLoss: null,
    maxRR: null,
    followedPlan: false,
    rating: 3,
    notes: "",
    images: [],
  };
}

export function calculateProfitLoss(
  values: Pick<TradeValues, "riskAmount" | "direction" | "entry" | "exit" | "rr">,
): number | null {
  let result: number;
  if (values.rr !== null) {
    result = values.rr * values.riskAmount;
  } else if (values.entry !== null && values.exit !== null) {
    result = values.direction === "long" ? values.exit - values.entry : values.entry - values.exit;
  } else {
    return null;
  }
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

export function validateTrade(values: TradeValues): string | null {
  if (!values.accountName.trim()) return "Set an account name in the plugin settings.";
  if (!values.symbol.trim()) return "Set a symbol in the plugin settings.";
  if (!Number.isFinite(values.riskAmount) || values.riskAmount <= 0) return "Risk amount must be greater than zero.";
  if (!isValidLocalDateTime(values.entryTime)) return "Enter a valid entry date and time.";
  if (values.direction !== "long" && values.direction !== "short") return "Choose long or short.";
  if (!TIMEFRAMES.includes(values.timeframe)) return "Choose a valid timeframe.";
  if (values.entry !== null && (!Number.isFinite(values.entry) || values.entry < 0)) {
    return "Entry price must be zero or greater, or left blank.";
  }
  if (values.exit !== null && (!Number.isFinite(values.exit) || values.exit < 0)) {
    return "Exit price must be zero or greater, or left blank.";
  }
  if (values.rr !== null && !Number.isFinite(values.rr)) return "RR must be a number or left blank.";
  if (values.maxRR !== null && (!Number.isFinite(values.maxRR) || values.maxRR < 0)) {
    return "Max RR must be zero or greater, or left blank.";
  }
  if (!Number.isInteger(values.rating) || values.rating < 1 || values.rating > 5) {
    return "Rating must be between 1 and 5.";
  }
  return null;
}

export function serializeTrade(values: TradeValues): string {
  const symbol = values.symbol.trim().toUpperCase();
  const direction = values.direction === "long" ? "Long" : "Short";
  const frontmatter = [
    "---",
    "type: local-trading-journal-trade",
    "schemaVersion: 2",
    `accountName: ${JSON.stringify(values.accountName.trim())}`,
    `symbol: ${JSON.stringify(symbol)}`,
    `riskAmount: ${values.riskAmount}`,
    `entryTime: ${JSON.stringify(values.entryTime)}`,
    `duration: ${JSON.stringify(values.duration.trim())}`,
    `direction: ${values.direction}`,
    `timeframe: ${values.timeframe}`,
    `entry: ${nullableNumber(values.entry)}`,
    `exit: ${nullableNumber(values.exit)}`,
    `rr: ${nullableNumber(values.rr)}`,
    `profitLoss: ${nullableNumber(calculateProfitLoss(values))}`,
    `maxRR: ${nullableNumber(values.maxRR)}`,
    `followedPlan: ${values.followedPlan}`,
    `rating: ${values.rating}`,
    `images: ${JSON.stringify(values.images)}`,
    "---",
    "",
  ].join("\n");
  const embeds = values.images.map((path) => `![[${path}]]`).join("\n");
  const imageSection = values.images.length > 0 ? `\n## Images\n\n${embeds}\n` : "";
  return `${frontmatter}# ${symbol} ${direction}\n\n## Notes\n\n${values.notes.trim()}\n${imageSection}`;
}

export function parseTradeNote(content: string, file: TFile): Trade | null {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) return null;

  try {
    const data: unknown = parseYaml(match[1]);
    if (!isRecord(data) || data.type !== "local-trading-journal-trade") return null;
    const legacy = data.schemaVersion !== 2;
    const entryTime = typeof data.entryTime === "string"
      ? data.entryTime
      : typeof data.date === "string"
        ? `${data.date}T00:00`
        : "";
    const values: TradeValues = {
      accountName: typeof data.accountName === "string" ? data.accountName : legacy ? "Legacy account" : "",
      symbol: typeof data.symbol === "string" ? data.symbol : "",
      riskAmount: data.riskAmount === undefined && legacy ? 1 : finiteNumber(data.riskAmount),
      entryTime,
      duration: typeof data.duration === "string" ? data.duration : "",
      direction: data.direction === "short" ? "short" : "long",
      timeframe: isTimeframe(data.timeframe) ? data.timeframe : "5m",
      entry: optionalNumber(data.entry),
      exit: optionalNumber(data.exit),
      rr: optionalNumber(data.rr),
      profitLoss: null,
      maxRR: optionalNumber(data.maxRR),
      followedPlan: typeof data.followedPlan === "boolean" ? data.followedPlan : false,
      rating: typeof data.rating === "number" ? data.rating : 3,
      notes: extractNotes(content.slice(match[0].length)),
      images: Array.isArray(data.images) ? data.images.filter((image): image is string => typeof image === "string") : [],
    };
    values.profitLoss = calculateProfitLoss(values);
    if (validateTrade(values)) return null;
    return { ...values, file };
  } catch {
    return null;
  }
}

export function tradeFileBaseName(values: TradeValues): string {
  const symbol = values.symbol.trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${values.entryTime.slice(0, 10)}-${symbol || "TRADE"}-${Date.now()}`;
}

export function formatRR(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}R`;
}

export function formatProfitLoss(value: number | null): string {
  if (value === null) return "—";
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatEntryTime(value: string): string {
  return value.replace("T", " ");
}

export function tradeDateKey(trade: Pick<TradeValues, "entryTime">): string {
  return trade.entryTime.slice(0, 10);
}

function isValidLocalDateTime(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return false;
  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    && date.getHours() === hours && date.getMinutes() === minutes;
}

function extractNotes(body: string): string {
  const notesHeading = /^## Notes[ \t]*$/m.exec(body);
  if (notesHeading?.index !== undefined) {
    const start = notesHeading.index + notesHeading[0].length;
    const remainder = body.slice(start);
    const imageHeading = /^## Images[ \t]*$/m.exec(remainder);
    const end = imageHeading?.index === undefined ? remainder.length : imageHeading.index;
    return remainder.slice(0, end).trim();
  }
  return body.replace(/^# [^\r\n]*(?:\r?\n){0,2}/, "").trim();
}

function optionalNumber(value: unknown): number | null {
  return value === null || value === undefined || value === "" ? null : finiteNumber(value);
}

function nullableNumber(value: number | null): string {
  return value === null ? "null" : String(value);
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function isTimeframe(value: unknown): value is TradeTimeframe {
  return value === "1m" || value === "5m" || value === "15m";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
