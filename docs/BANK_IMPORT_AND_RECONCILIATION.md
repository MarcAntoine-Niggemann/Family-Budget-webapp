# Bank Statement Import, Auto-Categorization & Expense Reconciliation

This document details the functional specification and algorithmic logic for bank statement CSV parsing, automated merchant categorization, and reconciliation between on-the-go manual expense declarations and imported bank statements.

---

## 📑 Functional Workflow Overview

```
                      ┌──────────────────────────────────────────────┐
                      │    Manual On-The-Go Expense Declaration      │
                      │    (Logged by Family Member on Mobile)      │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │   Status: PENDING         │
                               │   Source: MANUAL          │
                               └─────────────┬─────────────┘
                                             │
                                             │ (Later in the month)
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                          CSV BANK STATEMENT IMPORT PIPELINE                             │
│                                                                                         │
│  ┌──────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────┐   │
│  │ 1. Delimiter Detection   │───>│ 2. Smart Column Discovery│───>│ 3. Data Parsing &│   │
│  │    (;, ,, \t)            │    │    (Date, Label, Amount) │    │    Sanitization  │   │
│  └──────────────────────────┘    └──────────────────────────┘    └────────┬─────────┘   │
└───────────────────────────────────────────────────────────────────────────┼─────────────┘
                                                                            │
                                                                            ▼
                                                           ┌──────────────────────────────┐
                                                           │  Auto-Categorization Engine   │
                                                           │  (Rules & Keyword Matching)  │
                                                           └──────────────┬───────────────┘
                                                                          │
                                                                          ▼
                                                           ┌──────────────────────────────┐
                                                           │  AUTOMATED RECONCILIATION    │
                                                           │  ENGINE                      │
                                                           │  - Matching Candidates       │
                                                           │  - Confidence Scoring        │
                                                           └──────────────┬───────────────┘
                                                                          │
                                                 ┌────────────────────────┴────────────────────────┐
                                                 ▼                                                 ▼
                                  ┌──────────────────────────────┐                  ┌──────────────────────────────┐
                                  │   AUTO / MANUAL MATCH        │                  │   UNMATCHED BANK ENTRY       │
                                  │   - Link Manual & Bank Tx    │                  │   - Create New Bank Record   │
                                  │   - Status: RECONCILED       │                  │   - Status: VERIFIED         │
                                  │   - Deduplicate in Reports   │                  │   - Source: BANK_IMPORT      │
                                  └──────────────────────────────┘                  └──────────────────────────────┘
```

---

## 🏦 1. CSV Bank Statement Parsing Engine (`CsvBankStatementParser.kt`)

Bank statements vary significantly across financial institutions (e.g., BNP Paribas, Crédit Agricole, BoursoBank, Revolut, Chase). `CsvBankStatementParser` handles format variations automatically without requiring pre-configured bank templates.

### A. Automatic Delimiter Detection
The parser samples the first 5 lines of the CSV file and counts occurrences of common delimiter characters:
```kotlin
private fun detectDelimiter(sample: String): Char {
    val semicolons = sample.count { it == ';' }
    val commas = sample.count { it == ',' }
    val tabs = sample.count { it == '\t' }
    return when {
        semicolons >= commas && semicolons >= tabs -> ';'
        tabs >= commas && tabs >= semicolons -> '\t'
        else -> ','
    }
}
```

---

### B. Smart Header Column Discovery
The parser scans up to the first 10 lines to locate the header row using alias token lists:

| Semantic Field | Header Alias Keywords |
| :--- | :--- |
| **Date Column** | `date`, `operation_date`, `date_operation`, `valeur` |
| **Label / Description** | `libell`, `libelle`, `description`, `label`, `detail`, `operation`, `merchant` |
| **Debit Column** | `debit`, `depense`, `sortie` |
| **Credit Column** | `credit`, `recette`, `entree` |
| **Single Amount Column** | `montant`, `amount`, `total`, `valeur_eur` |
| **Payment Card / Method** | `carte`, `card`, `cb`, `moyen_paiement` |
| **Account Balance / Solde** | `solde`, `balance`, `solde_eur`, `solde_actuel` |

#### Statement Classification:
* If a balance/solde column is found $\rightarrow$ classified as **`MAIN_ACCOUNT`**.
* If a card reference column is found $\rightarrow$ classified as **`CREDIT_CARD`**.
* Otherwise $\rightarrow$ classified as **`GENERIC`**.

---

### C. Date Parsing Engine
The parser sequentially tests dates against localized format strings until a valid timestamp is resolved:
1. `dd/MM/yyyy` (France / European Standard)
2. `yyyy-MM-dd` (ISO 8601)
3. `dd-MM-yyyy` (European Alternative)
4. `dd.MM.yyyy` (German Standard)
5. `dd/MM/yy` (Short Year)
6. `yyyy/MM/dd` (Asian / US Alternative)
7. `MM/dd/yyyy` (US Standard)

---

### D. Amount Sanitization
Raw numeric strings are cleaned to normalize European decimal formatting (commas vs. dots) and strip currency symbols:
```kotlin
// Example inputs: "-1 250,50 €", "1,250.50 EUR", "-45.50$"
var clean = raw.replace("€", "").replace("EUR", "").replace("$", "").replace(" ", "").trim()

if (clean.contains(",") && clean.contains(".")) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
        clean = clean.replace(".", "").replace(",", ".") // French format: 1.250,50 -> 1250.50
    } else {
        clean = clean.replace(",", "") // US format: 1,250.50 -> 1250.50
    }
} else if (clean.contains(",")) {
    clean = clean.replace(",", ".")
}
```
* **Expenses** are guaranteed negative values (`amount < 0.0`).
* **Incomes** are guaranteed positive values (`amount > 0.0`).

---

## 🏷️ 2. Auto-Categorization Engine (`CategorizationEngine.kt`)

Once a bank statement line is parsed, `CategorizationEngine` automatically assigns a budget/sub-category (e.g. "Supermarché" under "Alimentation", "Électricité" under "Factures") based on user-defined rules stored in `categorization_rules`.

### A. Text Normalization
To prevent false negatives due to accents, special characters, or case sensitivity (e.g., matching `"CARREFOUR"` against `"Carrefour Contact № 9812"`), both the bank label and rule pattern undergo Unicode NFD normalization:

```kotlin
fun normalize(text: String): String {
    val normalized = Normalizer.normalize(text, Normalizer.Form.NFD)
    return normalized.replace("\\p{InCombiningDiacriticalMarks}+".toRegex(), "")
        .uppercase(Locale.ROOT)
        .trim()
}
```

---

### B. Rule Evaluation Strategies

Rules are evaluated in descending order of **Priority** (`priority` field):

```kotlin
for (rule in rules.filter { it.isActive }.sortedByDescending { it.priority }) {
    val isMatch = when (rule.matchType) {
        CategorizationRuleEntity.MATCH_CONTAINS -> normalizedLabel.contains(normalizedPattern)
        CategorizationRuleEntity.MATCH_STARTS_WITH -> normalizedLabel.startsWith(normalizedPattern)
        CategorizationRuleEntity.MATCH_EXACT -> normalizedLabel == normalizedPattern
        CategorizationRuleEntity.MATCH_REGEX -> Regex(rule.pattern, RegexOption.IGNORE_CASE).containsMatchIn(label)
        else -> normalizedLabel.contains(normalizedPattern)
    }
    if (isMatch) return matchedBudget
}
```

* **`CONTAINS`** *(Default)*: Matches if the keyword is anywhere inside the bank label (e.g. pattern `"TOTAL"` matches `"TOTAL STATION AUTOROUTE A6"`).
* **`STARTS_WITH`**: Matches prefixes (e.g. pattern `"PRLV SEPA"`).
* **`EXACT`**: Strict equality match.
* **`REGEX`**: Evaluates custom regular expressions for advanced pattern matching.

---

## 🔄 3. Automated Expense Reconciliation Engine

### Problem Statement
When family members make on-the-go purchases (e.g. paying cash or card at a restaurant), they log the transaction manually in the app with custom notes, tags, and family member assignments. Weeks later, when the official bank statement CSV is imported, the same physical expense appears as a bank entry.

Without reconciliation, reporting would **double-count** expenses ($1 \text{ manual} + 1 \text{ bank} = 2 \times \text{ cost}$).

---

### Reconciliation Algorithm & Matching Candidate Scoring

When a bank statement CSV is imported, `BudgetRepository` compares every incoming bank record against all un-reconciled manual transactions (`source == "MANUAL"`, `status == "PENDING"`):

```
                                 [ Candidate Pair ]
                       (Bank Record B  vs  Manual Record M)
                                         │
                                         ▼
                           Are Amounts Exactly Equal?
                            |amount_B| == |amount_M|
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
                       NO                                YES
                        │                                 │
                 [ Score = 0.0 ]                  Base Score = 0.60
               (Candidate Rejected)                       │
                                                          ▼
                                            Is Date within ±5 Days?
                                            |date_B - date_M| <= 5 days
                                                          │
                                         ┌────────────────┴────────────────┐
                                         ▼                                 ▼
                                        NO                                YES
                                         │                                 │
                                 [ Score = 0.0 ]                   Date Score += 0.25
                               (Candidate Rejected)                        │
                                                                           ▼
                                                             Does Merchant / Label Match?
                                                             (Normalized substring match)
                                                                           │
                                                          ┌────────────────┴────────────────┐
                                                          ▼                                 ▼
                                                         NO                                YES
                                                          │                                 │
                                                 [ Total Score = 0.85 ]           Merchant Score += 0.15
                                                (Strong Match Candidate)                   │
                                                                                           ▼
                                                                                   [ Total Score = 1.00 ]
                                                                                   (Perfect Match Candidate)
```

---

### Matching Confidence Criteria
To qualify as a **Reconciliation Candidate**, a pair must satisfy:
1. **Exact Amount Match**: $|amount_{bank}| = |amount_{manual}|$ (Mandatory).
2. **Date Proximity Window**: $|date_{bank} - date_{manual}| \le 5 \text{ days}$ (Mandatory to allow bank settlement latency).
3. **Confidence Threshold**: $Score \ge 0.70$.

---

### Reconciliation Execution Logic
When a candidate match is confirmed (either automatically or by tapping **"Reconcile & Link"** in the UI):

1. **Status Update**:
   * Both records (`manualTx` and `bankTx`) update their status to **`STATUS_RECONCILED`** (`"RECONCILED"`).
   * `manualTx.reconciledWithId = bankTx.id`
   * `bankTx.reconciledWithId = manualTx.id`
2. **Data Fusion**:
   * The bank record retains official bank settlement metadata (exact date, bank label, bank balance).
   * The manual record retains family member attribution, notes, custom tags, and manual category overrides.
3. **Deduplication in Reports**:
   All financial report calculators (`computeMonthlyReport`, `computeYearlyReport`, `computeCashFlowForecast`) filter out duplicate reconciled pairs using the following rule:
   ```kotlin
   val reportTransactions = allTransactions.filter { tx ->
       if (tx.status == TransactionEntity.STATUS_RECONCILED) {
           // Keep only the BANK_IMPORT side of reconciled pairs to prevent double counting
           tx.source == TransactionEntity.SOURCE_BANK_IMPORT
       } else {
           true // Keep all unreconciled manual, verified bank, or income records
       }
   }
   ```

---

## 💳 4. Deferred Credit Card Billing Periods & Lump-Sum Settlement Matching

In deferred debit credit cards (Cartes à débit différé), transactions incurred during a billing cycle (e.g., from the 26th of month $M-1$ to the 25th of month $M$) are debited from the main checking account in a single lump-sum on the settlement day (e.g., the 30th or end of month).

### A. The Boundary Cutoff Day Challenge
Transactions occurring on the exact cutoff day (e.g. October 25th) may be split across two billing periods:
* An early purchase on Oct 25th is processed before cutoff and belongs to the **October statement** (`"2026-10"`).
* A late purchase on Oct 25th is processed after the bank batch run and belongs to the **November statement** (`"2026-11"`).

### B. Two-Tier Period Assignment System
1. **Automatic Assignment by Default**:
   Upon transaction insertion or statement CSV import, the period is automatically calculated using the account's closing day and monthly overrides:
   $$\text{Period}(tx) = \begin{cases} 
   \text{Year}-\text{Month}(tx) & \text{if } day \le \text{closingDay}(tx) \\
   \text{Year}-\text{Month}(tx) + 1\text{ month} & \text{if } day > \text{closingDay}(tx)
   \end{cases}$$
2. **Explicit User Override (`creditCardPeriod`)**:
   Users can override the billing period directly on any card transaction:
   * **List Item Chip**: Quick dropdown with adjacent billing periods (`[💳 Octobre 2026 ▾]`).
   * **Transaction Edit Dialog**: Dedicated statement period selector with quick cycle candidates and a "Reset to automatic" action.

### C. Strict Period Matching for Lump-Sum Settlement
When flagging or viewing a lump-sum card debit settlement in the checking account:
* Transactions are matched **strictly by their assigned statement period** (`it.resolveEffectivePeriod(cardAccount) == targetPeriodKey`), rather than relying on raw timestamps.
* Boundary-day transactions occurring within $\pm 3$ days of cutoff that are assigned to a different period are highlighted in the UI with a 1-tap **"Assign to this statement"** quick action.

