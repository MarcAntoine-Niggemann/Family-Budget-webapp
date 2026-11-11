# Reports & Graphs Functional & Technical Documentation

This document provides complete functional and technical specifications for all financial analytics, budget comparison reports, and interactive cash flow forecast charts in **Family Budget Vault**.

---

## 📊 1. Monthly Overview Report (`MonthlyOverviewReport`)

### 🎯 Functional Purpose
Provides a consolidated view of monthly financial health for the current month, matching standard household budget spreadsheets (e.g. Google Sheets / Excel budget templates).

### 🖥️ Display Components
* **Header Summary Metrics**: Total Budget, Total Actual Spent, Total Income, and Difference (`Budget - Spent`).
* **Monthly Average Comparison**: Displays average monthly expenditure and flags whether current spending is *"Below Average"* (Green) or *"Above Average"* (Amber).
* **Category Budget vs. Réel Table**: Detailed breakdown showing category icon, name, budgeted limit, actual spent, remaining difference, and animated progress bar.
* **Spending by Family Member**: Pie/list breakdown showing total expenses incurred by each family member and their percentage share of total household spending.

### 🧮 Technical Calculation Logic (`computeMonthlyReport`)

```kotlin
// Time Bounds: Current Month 1st day 00:00:00 to last day 23:59:59.999
val monthTransactions = transactions.filter { it.date in startTime..endTime }
```

#### Mathematical Formulas:
1. **Total Expenses ($E_{month}$)**:
   $$E_{month} = \sum_{tx \in T_{month}, tx.isExpense = true} |amount_{tx}|$$
2. **Total Income ($I_{month}$)**:
   $$I_{month} = \sum_{tx \in T_{month}, tx.isExpense = false} |amount_{tx}|$$
3. **Category Effective Expense Budget ($B_{cat, exp}$)**:
   Sum of all expense budget lines (`line.isExpense = true`) applicable to the target month:
   $$B_{cat, exp} = \sum_{line \in Budgets_{cat}, line.isExpense = true} \begin{cases} amount_{line} & \text{if } line.month = month \\ \frac{amount_{line}}{12} & \text{if } line.month = null \end{cases}$$
4. **Category Effective Income Target ($B_{cat, inc}$)**:
   Sum of all income budget lines (`line.isExpense = false`) applicable to the target month:
   $$B_{cat, inc} = \sum_{line \in Budgets_{cat}, line.isExpense = false} \begin{cases} amount_{line} & \text{if } line.month = month \\ \frac{amount_{line}}{12} & \text{if } line.month = null \end{cases}$$
5. **Category Percentage Used ($P_{cat}$)**:
   $$P_{cat} = \text{clamp}\left(\frac{E_{cat}}{B_{cat, exp}}, 0.0, 1.0\right)$$
6. **Net Monthly Difference ($\Delta_{month}$)**:
   $$\Delta_{month} = B_{total, exp} - E_{month}$$
7. **Net Monthly Savings ($S_{net}$)**:
   $$S_{net} = I_{month} - E_{month}$$
8. **Family Member Spending Share ($S_{member}$)**:
   $$S_{member} = \left(\frac{E_{member}}{E_{month}}\right) \times 100\%$$

---

## 📅 2. Annual Budget Report (`YearlyBudgetReport`)

### 🎯 Functional Purpose
Tracks long-term annual envelope budgets across all 12 calendar months of the active year.

### 🖥️ Display Components
* **Annual Metrics**: Total Annual Budget (Expenses), Total Annual Spent So Far, Total Annual Income So Far, and Remaining Annual Budget.
* **Annual Category Comparison Table**: Category-by-category annual expense budget vs YTD spent comparison.

### 🧮 Technical Calculation Logic (`computeYearlyReport`)

```kotlin
// Time Bounds: Jan 1st 00:00:00 to Dec 31st 23:59:59.999
val yearTransactions = transactions.filter { it.date in startTime..endTime }
```

#### Mathematical Formulas:
1. **Total Annual Expense Budget ($B_{annual, exp}$)**:
   $$B_{annual, exp} = \sum_{cat \in Categories} resolveYearlyBudgetForCategory(cat, targetYear, isExpense = true)$$
2. **Remaining Annual Budget ($R_{annual}$)**:
   $$R_{annual} = \max\left(0.0, B_{annual, exp} - E_{year}\right)$$

---

## 📈 3. Cash Flow Forecast & Projected Balance Graph

### 🎯 Functional Purpose
Projects future bank account balances day-by-day over selectable time horizons to predict cash dips (*"Creux de trésorerie"*) and inform users how much money is **Safe to Spend Now** without risking overdrafts on upcoming bills.

### 🖥️ Horizon Selectors
Users can toggle between three forecast horizons:
1. **Current Month**: Day-by-day projection from current date to the end of the current month.
2. **Next 3 Months**: 90-day macro cash flow projection.
3. **End of Year**: Long-term annual balance projection through December 31st.

---

### 🧮 Cash Flow Forecasting Algorithm (`computeCashFlowForecast`)

#### Step A: Calculate Variable Budget & Fixed Bills
1. **Upcoming Expected Total ($F_{upcoming}$)**:
   Sum of active subscription / recurring bill entities (`expected_spends`) that have **not yet** been matched with an actual expense transaction in the current month:
   $$F_{upcoming} = \sum_{s \in ExpectedSpends, s.isActive, !s.isPaidThisPeriod} |amount_s|$$

2. **Variable Monthly Budget ($B_{variable}$)**:
   Total monthly category budget minus fixed recurring costs:
   $$B_{variable} = \max\left(0.0, B_{total} - \sum_{s \in ExpectedSpends} |amount_s|\right)$$

3. **Variable Spent So Far ($E_{variable}$)**:
   Sum of expense transactions that are not recurring bills:
   $$E_{variable} = \sum_{tx \in T_{month}, tx.isExpense, tx \notin ExpectedSpends} |amount_{tx}|$$

4. **Remaining Variable Budget ($R_{variable}$)**:
   $$R_{variable} = \max\left(0.0, B_{variable} - E_{variable}\right)$$

5. **Daily Variable Burn Rate ($R_{daily}$)**:
   Spreads remaining variable allowance evenly across remaining days in the month:
   $$R_{daily} = \frac{R_{variable}}{\max(1, DaysInMonth - CurrentDay)}$$

6. **Safe To Spend Now ($S_{safe}$)**:
   Liquid balance available immediately after reserving funds for all upcoming expected bills and remaining variable day-to-day spending:
   $$S_{safe} = BankBalance - F_{upcoming} - R_{variable}$$

---

#### Step B: Day-by-Day Timeline Simulation
Starting with current bank balance $Bal_0 = BankBalance$, for each day $d$ from $CurrentDay$ to $MaxDay$:

$$Bal_d = Bal_{d-1} - \sum_{events \in d} amount_{event} - \begin{cases} R_{daily} & \text{if } d > CurrentDay \\ 0 & \text{if } d = CurrentDay \end{cases}$$

* Tracks **Lowest Projected Balance Dip** ($\min(Bal_d)$) and marks the exact date when the dip occurs.
* If $\min(Bal_d) < 500 €$, an amber warning banner is displayed.
* If $\min(Bal_d) < 0 €$, a red overdraft alert banner is displayed.

---

### 🎨 Technical Graph Rendering (`CashFlowOverTimeCard`)

The graph is rendered using Jetpack Compose **`Canvas`** with custom gesture detectors:

```kotlin
Canvas(
    modifier = Modifier
        .fillMaxWidth()
        .height(145.dp)
        .pointerInput(currentHorizon, timeline) {
            detectTapGestures { offset ->
                val stepX = size.width / (timeline.size - 1).coerceAtLeast(1)
                val idx = ((offset.x / stepX).roundToInt()).coerceIn(0, timeline.size - 1)
                selectedPointIndex = idx
            }
        }
        .pointerInput(currentHorizon, timeline) {
            detectDragGestures { change, _ ->
                val stepX = size.width / (timeline.size - 1).coerceAtLeast(1)
                val idx = ((change.position.x / stepX).roundToInt()).coerceIn(0, timeline.size - 1)
                selectedPointIndex = idx
            }
        }
) { ... }
```

#### Graphical Elements:
1. **Dashed Grid Lines**: 4 horizontal reference gridlines dividing the vertical balance scale (`maxBal` to `minBal`).
2. **Zero Baseline**: Dashed red reference line rendered when balance transitions between positive and negative territory.
3. **Smooth Cubic Bezier Curve**: Points are connected using `path.cubicTo(controlX, p0.y, controlX, p1.y, p1.x, p1.y)` for smooth visual curves.
4. **Gradient Fill Under Curve**: Vertical gradient transition from `MoneyGreen (35% alpha)` down to `MoneyGreen (2% alpha)`.
5. **Milestone Markers**: Circular nodes indicating scheduled salary income (Green) or major bill debits (Amber/Red).
6. **Interactive Touch Scrubber Tooltip**: Touching or dragging across the canvas displays a vertical dashed line and pop-up card showing exact date, projected balance, and scheduled events for that day.
