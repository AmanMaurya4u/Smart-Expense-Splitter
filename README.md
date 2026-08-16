# Smart Expense Splitter

> **Fair, Fast & Automatic Group Expense Tracking with Debt Simplification**

Smart Expense Splitter is a client-side web application built with HTML5, CSS3, and Vanilla JavaScript. It helps groups (roommates, trip friends, couples, and team outings) track shared expenses, calculate individual balances, and automatically compute the **minimum number of transaction settlements** required so everyone gets settled up cleanly.

---

## 🌟 Key Features

- 👥 **Group & Member Management:** Easily create groups and manage members with auto-generated avatars and initials.
- 💵 **Equal & Custom Expense Splitting:**
  - **Equal Split:** Paisa-safe rounding logic ensuring exact balance reconciliation down to the paisa.
  - **Custom Split:** Live real-time balance validation preventing over/under-allocation.
- ⚡ **Greedy Settlement Minimization:** Reduces complex multi-person web of debts into the fewest possible payments.
- 📊 **Dashboard & Spend Insights:**
  - 4 summary cards: Total Spend, Active Members, Your Balance, Your Contribution.
  - Spend Breakdown by category (Food, Travel, Hotel, Shopping, Entertainment, Other).
  - Key Statistics: Top Spender and Average Spend per member.
- 🔍 **Search, Filter & Sort:** Debounced title search (300ms), category filter, and sorting by date, amount, or category.
- 🌙 **Dark & Light Mode:** Seamless CSS variables theme switcher with preference persisted.
- 💾 **100% Offline & Local Storage:** No accounts, logins, or cloud databases needed — zero setup time.
- 📄 **Export & Print:** One-click CSV export and print-ready summary layout (`@media print`).

---

## 🛠️ Tech Stack

- **Core:** HTML5, Vanilla JavaScript (ES6+ modules / standard scripts)
- **Styling:** Vanilla CSS3 (CSS Custom Properties, Glassmorphism, Micro-animations, Mobile-First Responsive Design)
- **Persistence:** Browser `localStorage` API
- **Testing:** Node.js pure calculation unit test runner

---

## 🚀 How to Run

1. Clone or download the repository:
   ```bash
   git clone https://github.com/your-username/smart-expense-splitter.git
   cd smart-expense-splitter
   ```

2. Open `index.html` directly in any web browser:
   - On Windows: double-click `index.html` or open via browser.
   - Or start a standard local static server:
     ```bash
     npx serve .
     ```

3. Run the unit test suite:
   ```bash
   node tests/calculation.test.js
   ```

---

## 🧠 Technical Highlights & Algorithms

### 1. Greedy Debt Simplification Algorithm (`calculateSettlements`)
When multiple expenses are paid by different members, standard split approaches generate matrixes of transfers. Smart Expense Splitter sorts creditors by balance descending and debtors by balance ascending, greedily matching the largest debtor with the largest creditor:

$$\text{Settle Amount} = \min(\text{Creditor Balance}, -\text{Debtor Balance})$$

This reduces transfer overhead from potentially $N \times (N-1)$ transactions down to at most $N-1$ transactions.

### 2. Paisa-Safe Remainder Distribution (`calculateEqualSplit`)
When an amount cannot be divided equally (e.g. ₹1000 / 3 = ₹333.333...), integer division remainder paise are allocated deterministically to the first $R$ participants array-wise:

```javascript
baseCents = Math.floor((amount * 100) / N)
remainderCents = (amount * 100) - (baseCents * N)
```

This guarantees $\sum \text{Shares} = \text{Amount}$ strictly without floating-point arithmetic drift.

---

## 📁 Project Structure

```text
smart-expense-splitter/
├── index.html                # Main single-page web app
├── README.md                 # Project documentation
├── css/
│   ├── variables.css         # Typography, spacing & color tokens
│   ├── themes.css            # Light & Dark theme variable overrides
│   └── style.css             # Component layout, responsive rules & print CSS
├── js/
│   ├── calculation.js        # Pure calculation logic & algorithms
│   ├── storage.js            # LocalStorage persistence & CSV export
│   ├── expense.js            # State mutations & member/expense CRUD
│   ├── ui.js                 # DOM renderers, toast & modal managers
│   └── app.js                # App init, routing & event dispatching
└── tests/
    └── calculation.test.js   # Node.js automated unit test suite
```

---

## 🛣️ Future Roadmap

- [ ] **v2.0:** Multi-group switcher & optional cloud database sync (Supabase/Firebase)
- [ ] **v3.0:** Real-time group collaboration & direct UPI payment link generation
