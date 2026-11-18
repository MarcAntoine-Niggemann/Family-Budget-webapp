import {
  FamilyMemberEntity,
  SharedSettlementEntity,
  SharedSplitInfo,
  SharedSplitMode,
  SharedSplitParticipant,
  TransactionEntity
} from '../types';

export interface MemberBalanceSummary {
  memberId: string;
  memberName: string;
  avatarColor: number;
  monthlyIncome: number;
  incomeRatioPct: number;
  totalPaid: number;
  totalFairShare: number;
  settlementsSent: number;
  settlementsReceived: number;
  /**
   * Positive = net creditor (is owed money).
   * Negative = net debtor (owes money).
   */
  netBalance: number;
  sharedTransactionCount: number;
}

export interface SimplifiedDebtTransfer {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amount: number;
}

export interface SharedBalancesResult {
  memberSummaries: MemberBalanceSummary[];
  simplifiedDebts: SimplifiedDebtTransfer[];
  totalSharedVolume: number;
  totalSettledVolume: number;
  totalOutstandingDebt: number;
  sharedTransactionCount: number;
  settlementCount: number;
}

/**
 * Computes exact percentages summing to 100.00 based on each member's configured monthlyIncome.
 * Falls back to equal distribution if total income across selected members is <= 0.
 */
export function computeIncomeRatioPercentages(
  participants: FamilyMemberEntity[]
): Record<string, number> {
  const result: Record<string, number> = {};
  if (participants.length === 0) return result;

  const totalIncome = participants.reduce((acc, m) => acc + Math.max(0, Number(m.monthlyIncome) || 0), 0);
  if (totalIncome <= 0) {
    const equalPct = Math.floor((10000 / participants.length)) / 100;
    let remainingBasisPoints = 10000;
    participants.forEach((m, idx) => {
      if (idx === participants.length - 1) {
        result[m.id] = remainingBasisPoints / 100;
      } else {
        const bp = Math.round(equalPct * 100);
        result[m.id] = bp / 100;
        remainingBasisPoints -= bp;
      }
    });
    return result;
  }

  let remainingBp = 10000;
  participants.forEach((m, idx) => {
    const income = Math.max(0, Number(m.monthlyIncome) || 0);
    if (idx === participants.length - 1) {
      result[m.id] = Math.max(0, remainingBp) / 100;
    } else {
      const bp = Math.round((income / totalIncome) * 10000);
      result[m.id] = bp / 100;
      remainingBp -= bp;
    }
  });

  return result;
}

/**
 * Computes cent-exact SharedSplitParticipant entries so that sum(shareAmount) === totalAmount.
 */
export function buildSharedSplitParticipants(
  totalAmountAbs: number,
  mode: SharedSplitMode,
  paidByMemberId: string,
  selectedMembers: FamilyMemberEntity[],
  customPercentages?: Record<string, number>,
  exactAmounts?: Record<string, number>
): SharedSplitParticipant[] {
  if (selectedMembers.length === 0) return [];

  const absTotal = Math.max(0, Math.round(Math.abs(totalAmountAbs) * 100) / 100);
  const totalCents = Math.round(absTotal * 100);

  if (mode === 'EXACT') {
    return selectedMembers.map(m => {
      const share = Math.max(0, Math.round((Number(exactAmounts?.[m.id]) || 0) * 100) / 100);
      const pct = absTotal > 0 ? Math.round((share / absTotal) * 10000) / 100 : 0;
      return {
        memberId: m.id,
        memberName: m.name,
        percentage: pct,
        shareAmount: share
      };
    });
  }

  let pctMap: Record<string, number> = {};
  if (mode === 'EQUAL') {
    const baseBp = Math.floor(10000 / selectedMembers.length);
    let remBp = 10000 - baseBp * selectedMembers.length;
    selectedMembers.forEach(m => {
      const extra = remBp > 0 && m.id !== paidByMemberId ? 1 : 0;
      if (extra) remBp -= 1;
      pctMap[m.id] = (baseBp + extra) / 100;
    });
    if (remBp > 0 && selectedMembers[0]) {
      pctMap[selectedMembers[0].id] = Math.round((pctMap[selectedMembers[0].id] * 100 + remBp)) / 100;
    }
  } else if (mode === 'INCOME_RATIO') {
    pctMap = computeIncomeRatioPercentages(selectedMembers);
  } else {
    // PERCENTAGE
    selectedMembers.forEach(m => {
      pctMap[m.id] = Math.max(0, Math.round((Number(customPercentages?.[m.id]) || 0) * 100) / 100);
    });
  }

  // Convert percentages to cent-exact share amounts
  const rawCents = selectedMembers.map(m => {
    const pct = pctMap[m.id] ?? 0;
    const exactCents = (totalCents * pct) / 100;
    const floored = Math.floor(exactCents);
    return {
      member: m,
      pct,
      cents: floored,
      frac: exactCents - floored
    };
  });

  const allocatedCents = rawCents.reduce((s, r) => s + r.cents, 0);
  let diffCents = totalCents - allocatedCents;

  // Deterministic cent remainder allocation (prioritize largest fractional part, then non-payer)
  if (diffCents > 0) {
    const order = [...rawCents].sort((a, b) => {
      if (Math.abs(b.frac - a.frac) > 1e-6) return b.frac - a.frac;
      if (a.member.id !== paidByMemberId && b.member.id === paidByMemberId) return -1;
      if (a.member.id === paidByMemberId && b.member.id !== paidByMemberId) return 1;
      return 0;
    });
    let idx = 0;
    while (diffCents > 0 && order.length > 0) {
      order[idx % order.length].cents += 1;
      diffCents -= 1;
      idx++;
    }
  } else if (diffCents < 0) {
    // Handle case where custom percentages temporarily exceed 100%
    const order = [...rawCents].sort((a, b) => b.cents - a.cents);
    let idx = 0;
    while (diffCents < 0 && order.length > 0 && idx < 1000) {
      if (order[idx % order.length].cents > 0) {
        order[idx % order.length].cents -= 1;
        diffCents += 1;
      }
      idx++;
    }
  }

  return rawCents.map(r => ({
    memberId: r.member.id,
    memberName: r.member.name,
    percentage: Math.round(r.pct * 100) / 100,
    shareAmount: r.cents / 100
  }));
}

export function validateSharedSplit(
  totalAmountAbs: number,
  mode: SharedSplitMode,
  participants: SharedSplitParticipant[],
  paidByMemberId: string
): { valid: boolean; reason?: 'NO_PARTICIPANTS' | 'PCT_MISMATCH' | 'AMOUNT_MISMATCH' | 'PAYER_MISSING' } {
  if (!paidByMemberId) {
    return { valid: false, reason: 'PAYER_MISSING' };
  }
  if (participants.length === 0) {
    return { valid: false, reason: 'NO_PARTICIPANTS' };
  }
  // Must include at least one person other than payer, or at least 2 participants
  const hasOtherParticipant = participants.some(p => p.memberId !== paidByMemberId);
  if (!hasOtherParticipant && participants.length < 2) {
    return { valid: false, reason: 'NO_PARTICIPANTS' };
  }

  if (mode === 'PERCENTAGE') {
    const sumPct = participants.reduce((acc, p) => acc + p.percentage, 0);
    if (Math.abs(sumPct - 100) > 0.1) {
      return { valid: false, reason: 'PCT_MISMATCH' };
    }
  }

  if (mode === 'EXACT') {
    const sumAmt = participants.reduce((acc, p) => acc + p.shareAmount, 0);
    if (Math.abs(sumAmt - Math.abs(totalAmountAbs)) > 0.02) {
      return { valid: false, reason: 'AMOUNT_MISMATCH' };
    }
  }

  return { valid: true };
}

/**
 * Computes net balances across all members ("who owes what to whom")
 * from tagged transactions and recorded settlements.
 */
export function computeSharedBalances(
  transactions: TransactionEntity[],
  settlements: SharedSettlementEntity[],
  members: FamilyMemberEntity[]
): SharedBalancesResult {
  const activeMembers = members.filter(m => !m.isDeleted);
  const memberMap = new Map<string, FamilyMemberEntity>(activeMembers.map(m => [m.id, m]));

  // Include any member IDs referenced in historical splits or settlements even if removed
  const statsMap = new Map<
    string,
    {
      memberId: string;
      memberName: string;
      avatarColor: number;
      monthlyIncome: number;
      totalPaidCents: number;
      totalShareCents: number;
      sentCents: number;
      receivedCents: number;
      txCount: number;
    }
  >();

  const ensureMemberStat = (id: string, fallbackName: string) => {
    if (!statsMap.has(id)) {
      const m = memberMap.get(id);
      statsMap.set(id, {
        memberId: id,
        memberName: m?.name || fallbackName || id,
        avatarColor: m?.avatarColor ?? 0xff0f766e,
        monthlyIncome: Math.max(0, Number(m?.monthlyIncome) || 0),
        totalPaidCents: 0,
        totalShareCents: 0,
        sentCents: 0,
        receivedCents: 0,
        txCount: 0
      });
    }
    return statsMap.get(id)!;
  };

  activeMembers.forEach(m => ensureMemberStat(m.id, m.name));

  let totalSharedCents = 0;
  let sharedTransactionCount = 0;

  for (const tx of transactions) {
    if (tx.isDeleted) continue;
    // Split children inherit category allocations; shared split sits on top-level/parent tx
    if (tx.parentId && tx.parentId > 0) continue;
    const split: SharedSplitInfo | null | undefined = tx.sharedSplit;
    if (!split || !split.isShared || !split.participants || split.participants.length === 0) continue;

    // Sign multiplier: +1 for expenses (payer fronted money), -1 for refunds/shared credits (receiver collected money)
    const sign = tx.isExpense ? 1 : -1;
    const absCents = Math.round(Math.abs(tx.amount) * 100);
    if (absCents <= 0) continue;

    sharedTransactionCount++;
    totalSharedCents += sign * absCents;

    const payerStat = ensureMemberStat(
      split.paidByMemberId || tx.familyMemberId,
      split.paidByMemberName || tx.familyMemberName
    );
    payerStat.totalPaidCents += sign * absCents;
    payerStat.txCount += 1;

    // Normalize participant shares in cents to match absCents cleanly
    let sumPartCents = 0;
    const partCentsList = split.participants.map(p => {
      const c = Math.round(Math.abs(p.shareAmount) * 100);
      sumPartCents += c;
      return { p, c };
    });

    if (sumPartCents !== absCents && partCentsList.length > 0) {
      partCentsList[0].c += absCents - sumPartCents;
    }

    for (const { p, c } of partCentsList) {
      const partStat = ensureMemberStat(p.memberId, p.memberName);
      partStat.totalShareCents += sign * c;
      if (p.memberId !== payerStat.memberId) {
        partStat.txCount += 1;
      }
    }
  }

  let totalSettledCents = 0;
  let settlementCount = 0;

  for (const st of settlements) {
    if (st.isDeleted) continue;
    const amtCents = Math.round(Math.abs(st.amount) * 100);
    if (amtCents <= 0) continue;

    settlementCount++;
    totalSettledCents += amtCents;

    const fromStat = ensureMemberStat(st.fromMemberId, st.fromMemberName);
    const toStat = ensureMemberStat(st.toMemberId, st.toMemberName);
    fromStat.sentCents += amtCents;
    toStat.receivedCents += amtCents;
  }

  const incomeMap = computeIncomeRatioPercentages(activeMembers);

  const memberSummaries: MemberBalanceSummary[] = Array.from(statsMap.values()).map(s => {
    const netCents = s.totalPaidCents - s.totalShareCents + s.sentCents - s.receivedCents;
    return {
      memberId: s.memberId,
      memberName: s.memberName,
      avatarColor: s.avatarColor,
      monthlyIncome: s.monthlyIncome,
      incomeRatioPct: incomeMap[s.memberId] ?? 0,
      totalPaid: s.totalPaidCents / 100,
      totalFairShare: s.totalShareCents / 100,
      settlementsSent: s.sentCents / 100,
      settlementsReceived: s.receivedCents / 100,
      netBalance: netCents / 100,
      sharedTransactionCount: s.txCount
    };
  });

  // Simplify debts (greedy matching of largest debtors to largest creditors)
  const creditors = memberSummaries
    .map(m => ({ id: m.memberId, name: m.memberName, cents: Math.round(m.netBalance * 100) }))
    .filter(x => x.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const debtors = memberSummaries
    .map(m => ({ id: m.memberId, name: m.memberName, cents: Math.round(-m.netBalance * 100) }))
    .filter(x => x.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const simplifiedDebts: SimplifiedDebtTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const cred = creditors[ci];
    const debt = debtors[di];
    const settleCents = Math.min(cred.cents, debt.cents);
    if (settleCents > 0) {
      simplifiedDebts.push({
        fromMemberId: debt.id,
        fromMemberName: debt.name,
        toMemberId: cred.id,
        toMemberName: cred.name,
        amount: settleCents / 100
      });
      cred.cents -= settleCents;
      debt.cents -= settleCents;
    }
    if (cred.cents === 0) ci++;
    if (debt.cents === 0) di++;
  }

  const totalOutstandingDebt =
    simplifiedDebts.reduce((acc, d) => acc + Math.round(d.amount * 100), 0) / 100;

  return {
    memberSummaries,
    simplifiedDebts,
    totalSharedVolume: totalSharedCents / 100,
    totalSettledVolume: totalSettledCents / 100,
    totalOutstandingDebt,
    sharedTransactionCount,
    settlementCount
  };
}

export function formatSplitModeLabel(mode: SharedSplitMode, language: 'fr' | 'en'): string {
  const isFr = language === 'fr';
  switch (mode) {
    case 'EQUAL':
      return '50/50';
    case 'INCOME_RATIO':
      return isFr ? 'Prorata revenus' : 'Income ratio';
    case 'PERCENTAGE':
      return isFr ? '% personnalisé' : 'Custom %';
    case 'EXACT':
      return isFr ? 'Montants exacts' : 'Exact amounts';
  }
}
