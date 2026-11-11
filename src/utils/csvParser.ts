import {
  CategorizationRuleEntity,
  CategoryBudgetEntity,
  CategoryEntity
} from '../types';

export interface ParsedBankRow {
  id: string;
  dateMillis: number;
  dateStr: string;
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
  errors: string[];
}

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function detectDelimiter(sampleLines: string[]): string {
  let semicolons = 0;
  let commas = 0;
  let tabs = 0;

  for (const line of sampleLines.slice(0, 5)) {
    semicolons += (line.match(/;/g) || []).length;
    commas += (line.match(/,/g) || []).length;
    tabs += (line.match(/\t/g) || []).length;
  }

  if (semicolons >= commas && semicolons >= tabs) return ';';
  if (tabs >= commas && tabs >= semicolons) return '\t';
  return ',';
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let clean = raw
    .replace(/€/g, '')
    .replace(/EUR/gi, '')
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .trim();

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
  return isNaN(num) ? null : num;
}

function parseDate(raw: string): { millis: number; dateStr: string } | null {
  if (!raw) return null;
  const clean = raw.trim();

  // Common date formats: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY, MM/DD/YYYY
  // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const euroMatch = clean.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})/);
  if (euroMatch) {
    const day = parseInt(euroMatch[1], 10);
    const month = parseInt(euroMatch[2], 10) - 1;
    const year = parseInt(euroMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return { millis: d.getTime(), dateStr: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}` };
    }
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = clean.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return { millis: d.getTime(), dateStr: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}` };
    }
  }

  // Fallback to Date.parse
  const timestamp = Date.parse(clean);
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp);
    return {
      millis: d.getTime(),
      dateStr: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    };
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
        case 'REGEX':
          matched = new RegExp(rule.pattern, 'i').test(label);
          break;
      }
    } catch {
      matched = normLabel.includes(normPattern);
    }

    if (matched) {
      const cat = categories.find(c => c.id === rule.targetCategoryId);
      return {
        categoryId: rule.targetCategoryId,
        categoryName: rule.targetCategoryName || cat?.name || 'General',
        categoryColor: cat?.color || 0xff3b82f6,
        categoryIcon: cat?.icon || 'Tag',
        budgetId: rule.targetBudgetId,
        budgetTitle: rule.targetBudgetTitle || 'General',
        rulePattern: rule.pattern
      };
    }
  }

  // Fallback category
  const fallbackCat = categories.find(c => !c.isDeleted) || {
    id: 3,
    name: 'Alimentation & Courses',
    icon: 'ShoppingCart',
    color: 0xfff59e0b
  };

  return {
    categoryId: fallbackCat.id,
    categoryName: fallbackCat.name,
    categoryColor: fallbackCat.color,
    categoryIcon: fallbackCat.icon,
    budgetId: 0,
    budgetTitle: 'General'
  };
}

export function parseBankStatementCsv(
  csvContent: string,
  rules: CategorizationRuleEntity[],
  categories: CategoryEntity[],
  budgets: CategoryBudgetEntity[]
): CsvParseResult {
  const lines = csvContent
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

  // Scan up to the first 10 lines to locate the header row
  let headerIndex = -1;
  let dateColIdx = -1;
  let labelColIdx = -1;
  let amountColIdx = -1;
  let debitColIdx = -1;
  let creditColIdx = -1;
  let detectedType: 'MAIN_ACCOUNT' | 'CREDIT_CARD' | 'GENERIC' = 'GENERIC';
  let headers: string[] = [];

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const rawTokens = lines[i].split(delimiter).map(t => t.replace(/^["']|["']$/g, '').trim());
    const normTokens = rawTokens.map(normalizeText);

    const dIdx = normTokens.findIndex(t => /DATE|OPERATION_DATE|DATE_OPERATION|VALEUR/.test(t));
    const lIdx = normTokens.findIndex(t => /LIBELL|DESCRIPTION|LABEL|DETAIL|OPERATION|MERCHANT/.test(t));
    const aIdx = normTokens.findIndex(t => /MONTANT|AMOUNT|TOTAL|VALEUR_EUR/.test(t));
    const debIdx = normTokens.findIndex(t => /DEBIT|DEPENSE|SORTIE/.test(t));
    const credIdx = normTokens.findIndex(t => /CREDIT|RECETTE|ENTREE/.test(t));

    if (dIdx !== -1 && lIdx !== -1 && (aIdx !== -1 || (debIdx !== -1 && credIdx !== -1))) {
      headerIndex = i;
      headers = rawTokens;
      dateColIdx = dIdx;
      labelColIdx = lIdx;
      amountColIdx = aIdx;
      debitColIdx = debIdx;
      creditColIdx = credIdx;

      if (normTokens.some(t => /SOLDE|BALANCE/.test(t))) {
        detectedType = 'MAIN_ACCOUNT';
      } else if (normTokens.some(t => /CARTE|CARD|CB/.test(t))) {
        detectedType = 'CREDIT_CARD';
      }
      break;
    }
  }

  // If header not found through standard aliases, fallback to assuming row 0 is header with col 0=Date, 1=Label, 2=Amount
  if (headerIndex === -1) {
    headerIndex = 0;
    headers = lines[0].split(delimiter).map(t => t.replace(/^["']|["']$/g, '').trim());
    dateColIdx = 0;
    labelColIdx = 1;
    amountColIdx = 2;
  }

  const parsedRecords: ParsedBankRow[] = [];
  const errors: string[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawTokens = lines[i].split(delimiter).map(t => t.replace(/^["']|["']$/g, '').trim());
    if (rawTokens.length <= Math.max(dateColIdx, labelColIdx)) continue;

    const rawDate = rawTokens[dateColIdx];
    const parsedDate = parseDate(rawDate);
    if (!parsedDate) continue;

    const rawLabel = rawTokens[labelColIdx] || 'Bank Transaction';

    let amount: number | null = null;
    let isExpense = true;

    if (amountColIdx !== -1 && rawTokens[amountColIdx] !== undefined) {
      amount = parseAmount(rawTokens[amountColIdx]);
      if (amount !== null) {
        isExpense = amount < 0;
      }
    } else if (debitColIdx !== -1 && creditColIdx !== -1) {
      const debit = parseAmount(rawTokens[debitColIdx]);
      const credit = parseAmount(rawTokens[creditColIdx]);
      if (debit !== null && debit > 0) {
        amount = -Math.abs(debit);
        isExpense = true;
      } else if (credit !== null && credit > 0) {
        amount = Math.abs(credit);
        isExpense = false;
      }
    }

    if (amount === null || isNaN(amount)) continue;

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
      id: `row_${i}_${Date.now()}`,
      dateMillis: parsedDate.millis,
      dateStr: parsedDate.dateStr,
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
    errors
  };
}
