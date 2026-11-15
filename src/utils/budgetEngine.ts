import { CategoryBudgetEntity } from '../types';

export function getDaysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

export function clampDayToMonth(day: number, year: number, month1to12: number): number {
  const maxDay = getDaysInMonth(year, month1to12);
  return Math.max(1, Math.min(maxDay, Math.floor(day)));
}

/**
 * Checks whether a sub-category budget line is active and within its optional
 * startYear/startMonth .. endYear/endMonth validity window for a given (year, month1to12).
 */
export function isBudgetActiveInMonth(
  b: CategoryBudgetEntity,
  year: number,
  month1to12: number
): boolean {
  if (b.isDeleted || !b.isActive) return false;

  if (b.startYear != null) {
    const sMonth = b.startMonth != null ? b.startMonth : 1;
    if (year < b.startYear || (year === b.startYear && month1to12 < sMonth)) {
      return false;
    }
  }

  if (b.endYear != null) {
    const eMonth = b.endMonth != null ? b.endMonth : 12;
    if (year > b.endYear || (year === b.endYear && month1to12 > eMonth)) {
      return false;
    }
  }

  if (b.frequency === 'ONCE') {
    if (b.year != null && b.year !== year) return false;
    if (b.month != null && b.month !== month1to12) return false;
  }

  return true;
}

/**
 * Returns the budgeted amount attributed to a specific (year, month1to12):
 * - MONTHLY: full amount when active in that month
 * - YEARLY with assigned month (1..12): full amount in that month, 0 in all other months
 * - YEARLY with no assigned month (null): amount / 12 spread evenly across months
 * - ONCE (legacy compatibility): full amount in its target (year, month)
 */
export function getBudgetMonthlyAmount(
  b: CategoryBudgetEntity,
  year: number,
  month1to12: number
): number {
  if (!isBudgetActiveInMonth(b, year, month1to12)) return 0;

  if (b.frequency === 'MONTHLY') {
    return b.amount;
  }

  if (b.frequency === 'YEARLY') {
    if (b.month != null && b.month >= 1 && b.month <= 12) {
      return b.month === month1to12 ? b.amount : 0;
    }
    return b.amount / 12;
  }

  // Legacy ONCE
  return b.amount;
}

/**
 * Returns the annual budgeted amount for a given year by summing the 12 months,
 * ensuring start/end windows and month-assigned yearly lines are respected accurately.
 */
export function getBudgetAnnualAmount(b: CategoryBudgetEntity, year: number): number {
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    total += getBudgetMonthlyAmount(b, year, m);
  }
  return Math.round(total * 100) / 100;
}

/**
 * True when this sub-category budget line is a scheduled fixed-day item
 * during the given (year, month1to12) rather than a spread allowance.
 */
export function isBudgetScheduledInMonth(
  b: CategoryBudgetEntity,
  year: number,
  month1to12: number
): boolean {
  if (!isBudgetActiveInMonth(b, year, month1to12)) return false;
  if (b.day == null || b.day < 1 || b.day > 31) return false;

  if (b.frequency === 'MONTHLY') return true;
  if (b.frequency === 'YEARLY') {
    return b.month != null && b.month === month1to12;
  }
  if (b.frequency === 'ONCE') {
    return (b.year == null || b.year === year) && (b.month == null || b.month === month1to12);
  }
  return false;
}

/**
 * True when this sub-category budget line triggers on the exact calendar date.
 */
export function doesBudgetTriggerOnDate(
  b: CategoryBudgetEntity,
  year: number,
  month1to12: number,
  dayOfMonth: number
): boolean {
  if (!isBudgetScheduledInMonth(b, year, month1to12)) return false;
  if (b.day == null) return false;
  const effectiveDay = clampDayToMonth(b.day, year, month1to12);
  return dayOfMonth === effectiveDay;
}

export function getMonthShortName(month1to12: number, language: 'fr' | 'en'): string {
  const date = new Date(2026, month1to12 - 1, 1);
  return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });
}

export function getMonthLongName(month1to12: number, language: 'fr' | 'en'): string {
  const date = new Date(2026, month1to12 - 1, 1);
  return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long' });
}

/**
 * Produces a concise, unboxed schedule label for a sub-category budget line.
 */
export function formatBudgetScheduleLabel(
  b: CategoryBudgetEntity,
  language: 'fr' | 'en'
): string {
  const isFr = language === 'fr';
  const flowLabel = b.isExpense ? (isFr ? 'Dépense' : 'Expense') : isFr ? 'Revenu' : 'Income';

  let schedulePart = '';
  if (b.frequency === 'MONTHLY') {
    if (b.day != null && b.day >= 1 && b.day <= 31) {
      schedulePart = isFr ? `Mensuel · Jour ${b.day}` : `Monthly · Day ${b.day}`;
    } else {
      schedulePart = isFr ? 'Mensuel · Réparti' : 'Monthly · Spread';
    }
  } else if (b.frequency === 'YEARLY') {
    if (b.month != null && b.month >= 1 && b.month <= 12) {
      const mName = getMonthShortName(b.month, language);
      if (b.day != null && b.day >= 1 && b.day <= 31) {
        schedulePart = isFr ? `Annuel · ${b.day} ${mName}` : `Yearly · ${mName} ${b.day}`;
      } else {
        schedulePart = isFr ? `Annuel · ${mName} (réparti)` : `Yearly · ${mName} (spread)`;
      }
    } else {
      schedulePart = isFr ? 'Annuel · Réparti sur l’année' : 'Yearly · Spread across year';
    }
  } else {
    const mName = b.month ? getMonthShortName(b.month, language) : '';
    const yr = b.year ? ` ${b.year}` : '';
    schedulePart = isFr ? `Ponctuel · ${mName}${yr}`.trim() : `Once · ${mName}${yr}`.trim();
  }

  return `${flowLabel} · ${schedulePart}`;
}

export function formatBudgetWindowLabel(
  b: CategoryBudgetEntity,
  language: 'fr' | 'en'
): string | null {
  const isFr = language === 'fr';
  if (b.startYear == null && b.endYear == null) return null;

  const formatBound = (yr?: number | null, mo?: number | null) => {
    if (yr == null) return '';
    if (mo != null && mo >= 1 && mo <= 12) {
      return `${getMonthShortName(mo, language)} ${yr}`;
    }
    return `${yr}`;
  };

  const startStr = formatBound(b.startYear, b.startMonth);
  const endStr = formatBound(b.endYear, b.endMonth);

  if (startStr && endStr) {
    return isFr ? `Période : ${startStr} → ${endStr}` : `Window: ${startStr} → ${endStr}`;
  }
  if (startStr) {
    return isFr ? `À partir de ${startStr}` : `From ${startStr}`;
  }
  return isFr ? `Jusqu’à ${endStr}` : `Until ${endStr}`;
}
