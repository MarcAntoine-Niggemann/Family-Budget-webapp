import { ReconciliationCandidate, TransactionEntity } from '../types';
import { normalizeText } from './csvParser';
import { isSplitChildTransaction, isTransactionExcludedFromTotals } from './budgetEngine';

export function findReconciliationCandidates(
  transactions: TransactionEntity[]
): ReconciliationCandidate[] {
  // Manual pending transactions (exclude split parents & split children)
  const pendingManual = transactions.filter(
    tx =>
      !isTransactionExcludedFromTotals(tx) &&
      !isSplitChildTransaction(tx) &&
      tx.source === 'MANUAL' &&
      tx.status === 'PENDING'
  );

  // Unreconciled bank import transactions (exclude split parents & split children)
  const bankImports = transactions.filter(
    tx =>
      !isTransactionExcludedFromTotals(tx) &&
      !isSplitChildTransaction(tx) &&
      tx.source === 'BANK_IMPORT' &&
      tx.status !== 'RECONCILED'
  );

  const candidates: ReconciliationCandidate[] = [];
  const fiveDaysMs = 5 * 86_400_000;

  for (const manual of pendingManual) {
    for (const bank of bankImports) {
      // 1. Mandatory Amount equality: |amount_bank| == |amount_manual|
      const amountDiff = Math.abs(Math.abs(manual.amount) - Math.abs(bank.amount));
      if (amountDiff > 0.01) continue;

      let score = 0.60;
      const reasons: string[] = ['Exact amount match (100%)'];

      // 2. Mandatory Date proximity: within +/- 5 days
      const dateDiff = Math.abs(manual.date - bank.date);
      if (dateDiff > fiveDaysMs) continue;

      const daysApart = Math.round(dateDiff / 86_400_000);
      const dateScore = Math.max(0, 0.25 * (1 - daysApart / 5));
      score += dateScore;
      reasons.push(`Dates within ${daysApart} day(s) (+${Math.round(dateScore * 100)}%)`);

      // 3. Label / merchant similarity
      const normManual = normalizeText(manual.title);
      const normBank = normalizeText(bank.originalBankLabel || bank.title);

      const manualWords = normManual.split(/\s+/).filter(w => w.length > 2);
      const bankWords = normBank.split(/\s+/).filter(w => w.length > 2);

      const hasSharedWord = manualWords.some(w => normBank.includes(w)) ||
                            bankWords.some(w => normManual.includes(w));

      if (hasSharedWord || normBank.includes(normManual) || normManual.includes(normBank)) {
        score += 0.15;
        reasons.push('Merchant / description match (+15%)');
      }

      if (score >= 0.70) {
        candidates.push({
          manualTx: manual,
          bankTx: bank,
          confidenceScore: Math.round(score * 100),
          reasons
        });
      }
    }
  }

  // Sort candidates by confidence score descending
  return candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
}
