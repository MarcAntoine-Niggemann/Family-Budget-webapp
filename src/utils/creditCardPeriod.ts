import { AccountEntity, TransactionEntity } from '../types';
import { clampDayToMonth, getDaysInMonth } from './budgetEngine';

export interface ParsedCardPeriod {
  year: number;
  month1to12: number;
}

export interface CardPeriodSummary {
  cardId: string;
  period: string;
  lumpSumAmount: number;
  expectedSettlementAmount: number; // Positive amount owed on card for this period (expenses minus refunds)
  signedCardTotal: number; // Raw signed sum of card transactions (negative for net expenses)
  delta: number; // lumpSumAmount - expectedSettlementAmount (>0 means missing card charges, <0 means excess on card)
  isMatch: boolean;
  transactions: TransactionEntity[];
  adjacentTransactions: TransactionEntity[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatCardPeriod(year: number, month1to12: number): string {
  const mm = String(month1to12).padStart(2, '0');
  return `${year}-${mm}`;
}

export function parseCardPeriod(period?: string | null): ParsedCardPeriod | null {
  if (!period) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12 || year < 1970 || year > 2100) return null;
  return { year, month1to12: month };
}

export function isValidCardPeriod(period?: string | null): boolean {
  return parseCardPeriod(period) !== null;
}

export function shiftCardPeriod(period: string, deltaMonths: number): string {
  const parsed = parseCardPeriod(period);
  if (!parsed) {
    const now = new Date();
    return shiftCardPeriod(formatCardPeriod(now.getFullYear(), now.getMonth() + 1), deltaMonths);
  }
  const totalMonths = parsed.year * 12 + (parsed.month1to12 - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth0 = ((totalMonths % 12) + 12) % 12;
  return formatCardPeriod(nextYear, nextMonth0 + 1);
}

/**
 * Computes the default credit card billing period ("YYYY-MM") for a transaction date
 * given the card's monthly closing day (1..31).
 * Rule:
 * - day <= clampedClosingDay -> current calendar month ("YYYY-MM")
 * - day > clampedClosingDay  -> next calendar month (settlement month)
 */
export function computeDefaultCardPeriod(
  dateMillis: number,
  closingDay?: number | null
): string {
  const d = new Date(Number.isFinite(dateMillis) ? dateMillis : Date.now());
  const year = d.getFullYear();
  const month1 = d.getMonth() + 1;
  const day = d.getDate();

  const rawClosing = closingDay != null && Number.isFinite(closingDay) ? Math.floor(closingDay) : 25;
  const clampedSetting = Math.min(31, Math.max(1, rawClosing));
  const effectiveClosing = clampDayToMonth(clampedSetting, year, month1);

  const currentPeriod = formatCardPeriod(year, month1);
  if (day <= effectiveClosing) {
    return currentPeriod;
  }
  return shiftCardPeriod(currentPeriod, 1);
}

/**
 * Computes the inclusive start and end calendar dates for a billing period ("YYYY-MM")
 * given a card's closing day (1..31).
 */
export function getPeriodCycleBounds(
  period: string,
  closingDay?: number | null
): { start: Date; end: Date } | null {
  const parsed = parseCardPeriod(period);
  if (!parsed) return null;

  const rawClosing = closingDay != null && Number.isFinite(closingDay) ? Math.floor(closingDay) : 25;
  const clampedSetting = Math.min(31, Math.max(1, rawClosing));

  const endDay = clampDayToMonth(clampedSetting, parsed.year, parsed.month1to12);
  const endDate = new Date(parsed.year, parsed.month1to12 - 1, endDay);

  const prevPeriodStr = shiftCardPeriod(period, -1);
  const prevParsed = parseCardPeriod(prevPeriodStr)!;
  const prevClosingDay = clampDayToMonth(clampedSetting, prevParsed.year, prevParsed.month1to12);
  const prevMonthDays = getDaysInMonth(prevParsed.year, prevParsed.month1to12);

  let startDate: Date;
  if (prevClosingDay >= prevMonthDays) {
    // Closing at end of month -> period starts on the 1st of the period's month
    startDate = new Date(parsed.year, parsed.month1to12 - 1, 1);
  } else {
    startDate = new Date(prevParsed.year, prevParsed.month1to12 - 1, prevClosingDay + 1);
  }

  return { start: startDate, end: endDate };
}

export function formatPeriodCycleRange(
  period: string,
  closingDay?: number | null,
  locale: 'fr' | 'en' = 'fr'
): string {
  const bounds = getPeriodCycleBounds(period, closingDay);
  if (!bounds) return period;

  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US';
  const startLabel = bounds.start.toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short'
  });
  const endLabel = bounds.end.toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return `${startLabel} → ${endLabel}`;
}

export function formatPeriodShortLabel(
  period: string,
  locale: 'fr' | 'en' = 'fr'
): string {
  const parsed = parseCardPeriod(period);
  if (!parsed) return period;
  const d = new Date(parsed.year, parsed.month1to12 - 1, 1);
  return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Checks whether a transaction is an effective card activity item (not deleted, not a split parent,
 * not excluded, not an internal settlement transfer).
 */
export function isEffectiveCardTransaction(tx: TransactionEntity): boolean {
  if (tx.isDeleted) return false;
  if (tx.isSplitParent) return false;
  if (tx.isExcluded || tx.isExcludedFromTotals) return false;
  if (tx.isInternalTransfer || tx.transferType === 'CARD_SETTLEMENT') return false;
  return true;
}

export function getCardPeriodTransactions(
  cardId: string,
  period: string,
  transactions: TransactionEntity[]
): TransactionEntity[] {
  if (!cardId || !isValidCardPeriod(period)) return [];
  return transactions
    .filter(
      tx =>
        tx.accountId === cardId &&
        tx.creditCardPeriod === period &&
        isEffectiveCardTransaction(tx)
    )
    .sort((a, b) => b.date - a.date);
}

export function getAdjacentOrUnassignedCardTransactions(
  cardId: string,
  period: string,
  transactions: TransactionEntity[]
): TransactionEntity[] {
  if (!cardId || !isValidCardPeriod(period)) return [];
  const prevPeriod = shiftCardPeriod(period, -1);
  const nextPeriod = shiftCardPeriod(period, 1);

  return transactions
    .filter(tx => {
      if (tx.accountId !== cardId || !isEffectiveCardTransaction(tx)) return false;
      return (
        !tx.creditCardPeriod ||
        tx.creditCardPeriod === prevPeriod ||
        tx.creditCardPeriod === nextPeriod
      );
    })
    .sort((a, b) => b.date - a.date);
}

export function summarizeCardPeriod(
  cardId: string,
  period: string,
  lumpSumDebitAmount: number,
  transactions: TransactionEntity[]
): CardPeriodSummary {
  const items = getCardPeriodTransactions(cardId, period, transactions);
  const adjacentTransactions = getAdjacentOrUnassignedCardTransactions(
    cardId,
    period,
    transactions
  );

  // Expenses are negative (-100), refunds on card are positive (+20), so signedCardTotal = -80
  const signedCardTotal = round2(items.reduce((sum, tx) => sum + tx.amount, 0));
  // Positive amount expected to settle the card for that cycle
  const expectedSettlementAmount = round2(-signedCardTotal);
  const lumpSum = round2(Math.abs(Number.isFinite(lumpSumDebitAmount) ? lumpSumDebitAmount : 0));
  const delta = round2(lumpSum - expectedSettlementAmount);
  const isMatch = Math.abs(delta) < 0.01;

  return {
    cardId,
    period,
    lumpSumAmount: lumpSum,
    expectedSettlementAmount,
    signedCardTotal,
    delta,
    isMatch,
    transactions: items,
    adjacentTransactions
  };
}

export function getAvailableCardPeriods(
  cardId: string,
  transactions: TransactionEntity[],
  closingDay?: number | null
): string[] {
  const periods = new Set<string>();
  const now = Date.now();
  const currentDefault = computeDefaultCardPeriod(now, closingDay);
  periods.add(currentDefault);
  periods.add(shiftCardPeriod(currentDefault, -1));

  for (const tx of transactions) {
    if (tx.isDeleted) continue;
    if (
      (tx.accountId === cardId || tx.targetAccountId === cardId) &&
      tx.creditCardPeriod &&
      isValidCardPeriod(tx.creditCardPeriod)
    ) {
      periods.add(tx.creditCardPeriod);
    }
  }

  return Array.from(periods).sort((a, b) => b.localeCompare(a));
}

export function findDefaultCardForCheckingTx(
  tx: TransactionEntity,
  accounts: AccountEntity[]
): AccountEntity | null {
  const deferredCards = accounts.filter(a => !a.isDeleted && a.type === 'DEFERRED_CARD');
  if (deferredCards.length === 0) return null;

  if (tx.targetAccountId) {
    const byTarget = deferredCards.find(c => c.id === tx.targetAccountId);
    if (byTarget) return byTarget;
  }

  if (tx.settlementCardName) {
    const byName = deferredCards.find(
      c => c.name.toLowerCase() === tx.settlementCardName!.toLowerCase()
    );
    if (byName) return byName;
  }

  const byLinked = deferredCards.find(c => c.linkedCheckingAccountId === tx.accountId);
  if (byLinked) return byLinked;

  return deferredCards[0];
}
