import {
  CategorizationRuleEntity,
  CategoryBudgetEntity,
  CategoryEntity,
  TransactionEntity
} from '../types';

export interface ParsedBankRow {
  id: string;
  dateMillis: number;
  dateStr: string;
  isoDate: string; // YYYY-MM-DD
  originalLabel: string;
  cleanTitle: string;
  amount: number; // negative for expense, positive for income
  isExpense: boolean;
  rawLine: string;
  matchedCategoryId: number;
  matchedCategoryName: string;
  matchedCategoryColor: number;
  matchedCategoryIcon: string;
  matchedBudgetId: number;
  matchedBudgetTitle: string;
  matchedRulePattern?: string;
}

export interface CsvParseResult {
  delimiter: string;
  totalRows: number;
  parsedRecords: ParsedBankRow[];
  headers: string[];
  detectedAccountType: 'MAIN_ACCOUNT' | 'CREDIT_CARD' | 'GENERIC';
  truncated?: boolean;
  errors: string[];
}

export interface DuplicateMatchInfo {
  isDuplicate: boolean;
  matchedTransactionId?: number;
  reason?: 'BANK_IMPORT_MATCH' | 'OPEN_BANKING_MATCH';
}

export const MAX_RULE_PATTERN_LENGTH = 150;
export const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_CSV_ROWS = 10_000;

/**
 * Validates that a user-supplied or synced regex pattern is bounded and free of
 * catastrophic backtracking (ReDoS) constructs such as nested or chained quantifiers.
 */
export function isSafeRegexPattern(pattern: string): { valid: boolean; reason?: string } {
  const trimmed = (pattern || '').trim();
  if (!trimmed) {
    return { valid: false, reason: 'Pattern cannot be empty.' };
  }
  if (trimmed.length > MAX_RULE_PATTERN_LENGTH) {
    return {
      valid: false,
      reason: `Pattern exceeds maximum length of ${MAX_RULE_PATTERN_LENGTH} characters.`
    };
  }

  // Disallow backreferences and lookbehinds which can cause exponential or unsupported evaluation
  if (/\\[1-9]|\\k</.test(trimmed)) {
    return { valid: false, reason: 'Backreferences are not permitted in rule patterns.' };
  }
  if (/\(\?<[=!]/.test(trimmed)) {
    return { valid: false, reason: 'Lookbehind assertions are not permitted in rule patterns.' };
  }

  // Strip escaped characters & character classes so quantifier structural checks only inspect syntax tokens
  const stripped = trimmed
    .replace(/\\./g, 'a')
    .replace(/\[[^\]]*\]/g, 'a');

  // Chained quantifiers like a++, a*+, {1,2}+
  if (/([+*?]|\{\d+,?\d*\})\s*[+*?{]/.test(stripped)) {
    return { valid: false, reason: 'Nested or chained quantifiers are not allowed (ReDoS protection).' };
  }

  // Quantified groups that themselves contain a quantifier or alternation: e.g. (a+)+, (.*)*, (a|a)+
  const groupStack: boolean[] = [];
  let inQuantifierBrace = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '{') {
      inQuantifierBrace = true;
    } else if (ch === '}') {
      inQuantifierBrace = false;
    }
    if (inQuantifierBrace) continue;

    if (ch === '(') {
      groupStack.push(false);
    } else if (ch === ')') {
      const hasInnerComplexity = groupStack.pop() || false;
      const next = stripped[i + 1];
      const nextIsQuantifier = next === '+' || next === '*' || next === '?' || next === '{';
      if (hasInnerComplexity && nextIsQuantifier) {
        return {
          valid: false,
          reason: 'Quantified groups containing quantifiers or alternations are not allowed (ReDoS protection).'
        };
      }
      if (nextIsQuantifier && groupStack.length > 0) {
        groupStack[groupStack.length - 1] = true;
      }
    } else if ((ch === '+' || ch === '*' || ch === '|') && groupStack.length > 0) {
      groupStack[groupStack.length - 1] = true;
    }
  }

  try {
    new RegExp(trimmed, 'i');
    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: err?.message || 'Invalid regular expression syntax.' };
  }
}

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function normalizeLabelForMatch(text: string): string {
  return normalizeText(text).replace(/\s+/g, ' ');
}

function detectDelimiter(sampleLines: string[]): string {
  let semicolons = 0;
  let commas = 0;
  let tabs = 0;

  for (const line of sampleLines.slice(0, 25)) {
    // Strip quoted segments and French decimal commas (e.g. "1305,45") before counting delimiters
    const unquoted = line.replace(/"[^"]*"/g, '').replace(/(\d),(\d)/g, '$1.$2');
    semicolons += (unquoted.match(/;/g) || []).length;
    commas += (unquoted.match(/,/g) || []).length;
    tabs += (unquoted.match(/\t/g) || []).length;
  }

  if (semicolons >= commas && semicolons >= tabs && semicolons > 0) return ';';
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return '\t';
  if (commas > 0) return ',';
  return ';';
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let clean = raw
    .replace(/€/g, '')
    .replace(/EUR/gi, '')
    .replace(/\$/g, '')
    .replace(/£/g, '')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[\s\u00A0\u202F]/g, '')
    .trim();

  if (!clean) return null;

  // Handle accounting negatives like "(10,00)" or trailing minus like "10,00-"
  let forceNegative = false;
  if (/^\(.+\)$/.test(clean)) {
    clean = clean.slice(1, -1);
    forceNegative = true;
  } else if (/^-?[\d.,]+-$/.test(clean)) {
    clean = clean.slice(0, -1);
    forceNegative = true;
  }

  // Handle French vs US notation: e.g. -1.250,50 vs -1,250.50
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  if (isNaN(num)) return null;
  return forceNegative ? -Math.abs(num) : num;
}

function buildParsedDate(year: number, monthIndex: number, day: number): { millis: number; dateStr: string; isoDate: string } | null {
  const d = new Date(year, monthIndex, day);
  if (
    isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== monthIndex ||
    d.getDate() !== day
  ) {
    return null;
  }
  const dd = String(day).padStart(2, '0');
  const mm = String(monthIndex + 1).padStart(2, '0');
  return {
    millis: d.getTime(),
    dateStr: `${dd}/${mm}/${year}`,
    isoDate: `${year}-${mm}-${dd}`
  };
}

function parseDate(raw: string): { millis: number; dateStr: string; isoDate: string } | null {
  if (!raw) return null;
  const clean = raw.trim();

  // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const euroMatch = clean.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})/);
  if (euroMatch) {
    const day = parseInt(euroMatch[1], 10);
    const month = parseInt(euroMatch[2], 10) - 1;
    const year = parseInt(euroMatch[3], 10);
    const built = buildParsedDate(year, month, day);
    if (built) return built;
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = clean.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const built = buildParsedDate(year, month, day);
    if (built) return built;
  }

  // 3. DD/MM/YY
  const shortEuroMatch = clean.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2})$/);
  if (shortEuroMatch) {
    const day = parseInt(shortEuroMatch[1], 10);
    const month = parseInt(shortEuroMatch[2], 10) - 1;
    const twoDigitYear = parseInt(shortEuroMatch[3], 10);
    const year = twoDigitYear >= 70 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
    const built = buildParsedDate(year, month, day);
    if (built) return built;
  }

  // Fallback to Date.parse
  const timestamp = Date.parse(clean);
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp);
    return buildParsedDate(d.getFullYear(), d.getMonth(), d.getDate());
  }

  return null;
}

export function categorizeLabel(
  label: string,
  rules: CategorizationRuleEntity[],
  categories: CategoryEntity[],
  budgets: CategoryBudgetEntity[]
): {
  categoryId: number;
  categoryName: string;
  categoryColor: number;
  categoryIcon: string;
  budgetId: number;
  budgetTitle: string;
  rulePattern?: string;
} {
  const normLabel = normalizeText(label);
  const activeRules = rules.filter(r => !r.isDeleted && r.isActive).sort((a, b) => b.priority - a.priority);

  for (const rule of activeRules) {
    const normPattern = normalizeText(rule.pattern);
    let matched = false;

    try {
      switch (rule.matchType) {
        case 'CONTAINS':
          matched = normLabel.includes(normPattern);
          break;
        case 'STARTS_WITH':
          matched = normLabel.startsWith(normPattern);
          break;
        case 'EXACT':
          matched = normLabel === normPattern;
          break;
        case 'REGEX': {
          const check = isSafeRegexPattern(rule.pattern);
          matched = check.valid
            ? new RegExp(rule.pattern, 'i').test(label)
            : normLabel.includes(normPattern);
          break;
        }
      }
    } catch {
      matched = normLabel.includes(normPattern);
    }

    if (matched) {
      const cat = categories.find(c => !c.isDeleted && c.id === rule.targetCategoryId);
      const budget = budgets.find(b => !b.isDeleted && b.id === rule.targetBudgetId);

      if (cat && budget) {
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          categoryColor: cat.color,
          categoryIcon: cat.icon,
          budgetId: budget.id,
          budgetTitle: budget.title,
          rulePattern: rule.pattern
        };
      }

      if (cat) {
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          categoryColor: cat.color,
          categoryIcon: cat.icon,
          budgetId: 0,
          budgetTitle: '',
          rulePattern: rule.pattern
        };
      }
    }
  }

  // Unmatched: leave unassigned until edited by the user after import
  return {
    categoryId: 0,
    categoryName: '',
    categoryColor: 0xff64748b,
    categoryIcon: 'HelpCircle',
    budgetId: 0,
    budgetTitle: ''
  };
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(t => {
    const trimmed = t.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  });
}

function findDateColumnIndex(normTokens: string[]): number {
  const exact = normTokens.findIndex(t => t === 'DATE' || t === 'DATE_OPERATION' || t === 'OPERATION_DATE');
  if (exact !== -1) return exact;

  const opDate = normTokens.findIndex(t => /DATE.*OP|OP.*DATE|BOOKING/.test(t));
  if (opDate !== -1) return opDate;

  const genericDate = normTokens.findIndex(t => /\bDATE\b/.test(t) && !/VALEUR/.test(t));
  if (genericDate !== -1) return genericDate;

  return normTokens.findIndex(t => /DATE|OPERATION_DATE|DATE_OPERATION|VALEUR/.test(t));
}

function findLabelColumnIndex(normTokens: string[], excludeIndices: number[]): number {
  const isAllowed = (idx: number) => idx !== -1 && !excludeIndices.includes(idx);

  const primary = normTokens.findIndex(
    (t, idx) =>
      isAllowed(idx) && /LIBELL|DESCRIPTION|LABEL|MERCHANT|PAYEE|NARRATIVE|MEMO/.test(t)
  );
  if (primary !== -1) return primary;

  return normTokens.findIndex(
    (t, idx) => isAllowed(idx) && /DETAIL|OPERATION/.test(t)
  );
}

export function parseBankStatementCsv(
  csvContent: string,
  rules: CategorizationRuleEntity[],
  categories: CategoryEntity[],
  budgets: CategoryBudgetEntity[]
): CsvParseResult {
  const byteSize =
    typeof Blob !== 'undefined' ? new Blob([csvContent]).size : csvContent.length * 2;
  if (byteSize > MAX_CSV_BYTES) {
    return {
      delimiter: ',',
      totalRows: 0,
      parsedRecords: [],
      headers: [],
      detectedAccountType: 'GENERIC',
      errors: [
        `The CSV file exceeds the maximum allowed size of ${Math.round(MAX_CSV_BYTES / (1024 * 1024))} MB.`
      ]
    };
  }

  const cleanedContent = csvContent.replace(/^\uFEFF/, '');
  const lines = cleanedContent
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return {
      delimiter: ',',
      totalRows: 0,
      parsedRecords: [],
      headers: [],
      detectedAccountType: 'GENERIC',
      errors: ['The CSV file is empty']
    };
  }

  const delimiter = detectDelimiter(lines);

  // Scan up to the first 25 lines to locate the header row
  let headerIndex = -1;
  let dateColIdx = -1;
  let labelColIdx = -1;
  let amountColIdx = -1;
  let debitColIdx = -1;
  let creditColIdx = -1;
  let detectedType: 'MAIN_ACCOUNT' | 'CREDIT_CARD' | 'GENERIC' = 'GENERIC';
  let headers: string[] = [];

  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const rawTokens = splitCsvLine(lines[i], delimiter);
    const normTokens = rawTokens.map(normalizeText);

    const dIdx = findDateColumnIndex(normTokens);
    const debIdx = normTokens.findIndex(t => /DEBIT|DEPENSE|SORTIE/.test(t));
    const credIdx = normTokens.findIndex(t => /CREDIT|RECETTE|ENTREE/.test(t));
    const aIdx = normTokens.findIndex(
      (t, idx) => idx !== dIdx && /MONTANT|AMOUNT|TOTAL|VALEUR_EUR/.test(t)
    );
    const lIdx = findLabelColumnIndex(normTokens, [dIdx, debIdx, credIdx, aIdx]);

    if (dIdx !== -1 && lIdx !== -1 && (aIdx !== -1 || debIdx !== -1 || credIdx !== -1)) {
      headerIndex = i;
      headers = rawTokens;
      dateColIdx = dIdx;
      labelColIdx = lIdx;
      amountColIdx = aIdx;
      debitColIdx = debIdx;
      creditColIdx = credIdx;

      if (normTokens.some(t => /SOLDE|BALANCE/.test(t))) {
        detectedType = 'MAIN_ACCOUNT';
      } else if (normTokens.some(t => /CARTE|CARD|\bCB\b/.test(t))) {
        detectedType = 'CREDIT_CARD';
      }
      break;
    }
  }

  // If header not found through standard aliases, fallback to assuming row 0 is header with col 0=Date, 1=Label, 2=Amount
  if (headerIndex === -1) {
    headerIndex = 0;
    headers = splitCsvLine(lines[0], delimiter);
    dateColIdx = 0;
    labelColIdx = 1;
    amountColIdx = 2;
  }

  const parsedRecords: ParsedBankRow[] = [];
  const errors: string[] = [];
  let truncated = false;
  const maxLineIndex = Math.min(lines.length, headerIndex + 1 + MAX_CSV_ROWS);
  if (lines.length > maxLineIndex) {
    truncated = true;
    errors.push(`CSV truncated at ${MAX_CSV_ROWS.toLocaleString()} rows for safety.`);
  }

  for (let i = headerIndex + 1; i < maxLineIndex; i++) {
    const rawTokens = splitCsvLine(lines[i], delimiter);
    if (rawTokens.length <= Math.max(dateColIdx, labelColIdx)) continue;

    const rawDate = rawTokens[dateColIdx];
    const parsedDate = parseDate(rawDate);
    if (!parsedDate) continue;

    const rawLabel = rawTokens[labelColIdx] || 'Bank Transaction';

    let amount: number | null = null;
    let isExpense = true;

    if (amountColIdx !== -1 && rawTokens[amountColIdx] !== undefined) {
      const parsedSingle = parseAmount(rawTokens[amountColIdx]);
      if (parsedSingle !== null) {
        amount = parsedSingle;
        isExpense = parsedSingle < 0;
      }
    }

    if (amount === null && (debitColIdx !== -1 || creditColIdx !== -1)) {
      const debit =
        debitColIdx !== -1 && rawTokens[debitColIdx] !== undefined
          ? parseAmount(rawTokens[debitColIdx])
          : null;
      const credit =
        creditColIdx !== -1 && rawTokens[creditColIdx] !== undefined
          ? parseAmount(rawTokens[creditColIdx])
          : null;

      if (debit !== null && debit !== 0) {
        amount = -Math.abs(debit);
        isExpense = true;
      } else if (credit !== null && credit !== 0) {
        amount = Math.abs(credit);
        isExpense = false;
      }
    }

    if (amount === null || isNaN(amount)) {
      errors.push(`Line ${i + 1}: could not parse amount`);
      continue;
    }

    // Apply auto-categorization
    const match = categorizeLabel(rawLabel, rules, categories, budgets);

    // Clean display title
    let cleanTitle = rawLabel
      .replace(/PRLV\s+/gi, '')
      .replace(/VIR\s+/gi, '')
      .replace(/CARTE\s+\d{2}\/\d{2}\s+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (cleanTitle.length > 40) {
      cleanTitle = cleanTitle.substring(0, 40) + '...';
    }

    parsedRecords.push({
      id: `row_${i}_${parsedDate.isoDate}_${Math.round(amount * 100)}`,
      dateMillis: parsedDate.millis,
      dateStr: parsedDate.dateStr,
      isoDate: parsedDate.isoDate,
      originalLabel: rawLabel,
      cleanTitle,
      amount,
      isExpense,
      rawLine: lines[i],
      matchedCategoryId: match.categoryId,
      matchedCategoryName: match.categoryName,
      matchedCategoryColor: match.categoryColor,
      matchedCategoryIcon: match.categoryIcon,
      matchedBudgetId: match.budgetId,
      matchedBudgetTitle: match.budgetTitle,
      matchedRulePattern: match.rulePattern
    });
  }

  return {
    delimiter,
    totalRows: parsedRecords.length,
    parsedRecords,
    headers,
    detectedAccountType: detectedType,
    truncated,
    errors
  };
}

function toLocalIsoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toUtcIsoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameImportDate(tx: TransactionEntity, row: ParsedBankRow): boolean {
  if (toLocalIsoDate(tx.date) === row.isoDate) return true;
  if (tx.source === 'OPEN_BANKING' && toUtcIsoDate(tx.date) === row.isoDate) return true;
  // Cross-timezone tolerance for local-midnight timestamps (same calendar day across timezones, < 14h)
  return Math.abs(tx.date - row.dateMillis) <= 14 * 3600 * 1000;
}

function isMatchingLabel(tx: TransactionEntity, row: ParsedBankRow): boolean {
  const rowOrig = normalizeLabelForMatch(row.originalLabel);
  const rowClean = normalizeLabelForMatch(row.cleanTitle);
  const txOrig = normalizeLabelForMatch(tx.originalBankLabel || '');
  const txTitle = normalizeLabelForMatch(tx.title || '');

  if (txOrig && rowOrig && txOrig === rowOrig) return true;
  if (!txOrig && txTitle && (txTitle === rowClean || txTitle === rowOrig)) return true;

  if (tx.source === 'OPEN_BANKING') {
    const compareTarget = txOrig || txTitle;
    if (compareTarget && rowOrig) {
      if (compareTarget.includes(rowOrig) || rowOrig.includes(compareTarget)) return true;
      const wordsA = compareTarget.split(' ').filter(w => w.length >= 4);
      const wordsB = rowOrig.split(' ').filter(w => w.length >= 4);
      if (wordsA.some(w => wordsB.includes(w))) return true;
    }
  }

  return false;
}

/**
 * Performs 1-to-1 duplicate detection for parsed CSV rows against already-imported
 * transactions in the target account. Using a consumed-ID set preserves legitimate
 * same-day identical transactions (e.g. two identical coffees on the same day) when
 * they appear multiple times in the CSV without yet existing in the ledger.
 */
export function detectCsvDuplicates(
  rows: ParsedBankRow[],
  existingTransactions: TransactionEntity[],
  targetAccountId: string
): Map<string, DuplicateMatchInfo> {
  const results = new Map<string, DuplicateMatchInfo>();
  const consumedTxIds = new Set<number>();

  const candidateExisting = existingTransactions.filter(
    tx =>
      !tx.isDeleted &&
      !tx.parentId &&
      tx.accountId === targetAccountId &&
      (tx.source === 'BANK_IMPORT' || tx.source === 'OPEN_BANKING')
  );

  for (const row of rows) {
    const match = candidateExisting.find(tx => {
      if (consumedTxIds.has(tx.id)) return false;
      if (Math.abs(tx.amount - row.amount) >= 0.005) return false;
      if (!isSameImportDate(tx, row)) return false;
      return isMatchingLabel(tx, row);
    });

    if (match) {
      consumedTxIds.add(match.id);
      results.set(row.id, {
        isDuplicate: true,
        matchedTransactionId: match.id,
        reason: match.source === 'OPEN_BANKING' ? 'OPEN_BANKING_MATCH' : 'BANK_IMPORT_MATCH'
      });
    } else {
      results.set(row.id, { isDuplicate: false });
    }
  }

  return results;
}
