import { Trade } from "./trade";

export type MetricPeriod = "year" | "month" | "week";

export interface MetricRow {
  period: string;
  totalTrades: number;
  winRate: number | null;
  tradesWon: number;
  totalRR: number;
  maxWinStreak: number;
  maxLossStreak: number;
}

export function calculateMetricRows(trades: Trade[], period: MetricPeriod): MetricRow[] {
  const groups = new Map<string, Trade[]>();
  const chronological = [...trades].sort((a, b) =>
    a.entryTime.localeCompare(b.entryTime) || a.file.path.localeCompare(b.file.path),
  );

  for (const trade of chronological) {
    const key = periodKey(trade.entryTime, period);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => summarizePeriod(key, group))
    .sort((a, b) => b.period.localeCompare(a.period));
}

export function isoWeekKey(entryTime: string): string {
  const [year, month, day] = entryTime.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function summarizePeriod(period: string, trades: Trade[]): MetricRow {
  const rrTrades = trades.filter((trade) => trade.rr !== null);
  const tradesWon = rrTrades.filter((trade) => (trade.rr ?? 0) > 0).length;
  const totalRR = rrTrades.reduce((sum, trade) => sum + (trade.rr ?? 0), 0);
  let currentWins = 0;
  let currentLosses = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  for (const trade of trades) {
    if (trade.rr !== null && trade.rr > 0) {
      currentWins += 1;
      currentLosses = 0;
    } else if (trade.rr !== null && trade.rr < 0) {
      currentLosses += 1;
      currentWins = 0;
    } else {
      currentWins = 0;
      currentLosses = 0;
    }
    maxWinStreak = Math.max(maxWinStreak, currentWins);
    maxLossStreak = Math.max(maxLossStreak, currentLosses);
  }

  return {
    period,
    totalTrades: trades.length,
    winRate: rrTrades.length === 0 ? null : (tradesWon / rrTrades.length) * 100,
    tradesWon,
    totalRR: Math.round((totalRR + Number.EPSILON) * 100) / 100,
    maxWinStreak,
    maxLossStreak,
  };
}

function periodKey(entryTime: string, period: MetricPeriod): string {
  if (period === "year") return entryTime.slice(0, 4);
  if (period === "month") return entryTime.slice(0, 7);
  return isoWeekKey(entryTime);
}
