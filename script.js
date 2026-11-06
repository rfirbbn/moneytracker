// ===== MoneyTrack - Dashboard (script.js) =====

const form = document.getElementById("TransactionForm");
const descriptionInput = document.getElementById("description");
const amountInput = document.getElementById("amount");
const typeSelect = document.getElementById("type");
const categorySelect = document.getElementById("category");
const dateInput = document.getElementById("date");
const monthSelect = document.getElementById("monthFilter");

const balanceEl = document.getElementById("balance");
const balanceAllEl = document.getElementById("balanceAll");
const incomeEl = document.getElementById("income");
const expenseEl = document.getElementById("expense");
const listEl = document.getElementById("transactionList");

const COLORS = ["#1d4e89", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#64748b"];

let transactions = [];
let charts = {};

// Transactions in the selected period
function periodList() {
    const month = getMonth();
    return month === "all" ? transactions : transactions.filter((t) => monthOf(t) === month);
}

function updateSummary() {
    const period = sumBy(periodList());
    const all = sumBy(transactions);

    balanceEl.textContent = formatRupiah(period.balance);
    incomeEl.textContent = formatRupiah(period.income);
    expenseEl.textContent = formatRupiah(period.expense);
    balanceAllEl.textContent = "All time: " + formatRupiah(all.balance);
}

function renderRecent() {
    listEl.innerHTML = "";
    const recent = [...transactions].sort(sortNewest).slice(0, 5);

    if (recent.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No transaction yet.";
        listEl.appendChild(empty);
        return;
    }

    recent.forEach((t) => listEl.appendChild(createRow(t)));
}

// --- Charts (Chart.js) ---
function showChart(key, canvasId, emptyId, hasData, config) {
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);
    const loaded = typeof Chart !== "undefined";

    if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
    }

    const ok = hasData && loaded;
    canvas.style.display = ok ? "block" : "none";
    empty.style.display = ok ? "none" : "block";
    empty.textContent = loaded ? "No data for this period." : "Chart.js could not load (check your internet connection).";

    if (ok) charts[key] = new Chart(canvas, config);
}

function formatShort(value) {
    if (value >= 1000000) return value / 1000000 + "jt";
    if (value >= 1000) return value / 1000 + "rb";
    return value;
}

function renderCharts() {
    const css = getComputedStyle(document.documentElement);
    const textColor = css.getPropertyValue("--muted").trim();
    const gridColor = css.getPropertyValue("--border").trim();
    const incomeColor = css.getPropertyValue("--income").trim();
    const expenseColor = css.getPropertyValue("--expense").trim();

    // Expenses by category (selected period)
    const byCategory = {};
    periodList()
        .filter((t) => t.type === "expense")
        .forEach((t) => {
            byCategory[categoryOf(t)] = (byCategory[categoryOf(t)] || 0) + t.amount;
        });
    const labels = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a]);

    showChart("category", "categoryChart", "categoryEmpty", labels.length > 0, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{ data: labels.map((l) => byCategory[l]), backgroundColor: COLORS, borderWidth: 0 }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom", labels: { color: textColor } },
                tooltip: { callbacks: { label: (c) => c.label + ": " + formatRupiah(c.parsed) } }
            }
        }
    });

    // Income vs expenses, last 6 months
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(addMonths(currentMonth(), -i));
    const totals = months.map((m) => sumBy(transactions.filter((t) => monthOf(t) === m)));
    const hasData = totals.some((s) => s.income > 0 || s.expense > 0);

    showChart("monthly", "monthlyChart", "monthlyEmpty", hasData, {
        type: "bar",
        data: {
            labels: months.map(formatMonthShort),
            datasets: [
                { label: "Income", data: totals.map((s) => s.income), backgroundColor: incomeColor },
                { label: "Expenses", data: totals.map((s) => s.expense), backgroundColor: expenseColor }
            ]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + formatRupiah(c.parsed.y) } }
            },
            scales: {
                x: { ticks: { color: textColor }, grid: { display: false } },
                y: { ticks: { color: textColor, callback: formatShort }, grid: { color: gridColor } }
            }
        }
    });
}

// --- Add ---
async function addTransaction(event) {
    event.preventDefault();

    const description = descriptionInput.value.trim();
    const amount = Number(amountInput.value);
    const type = typeSelect.value;
    const category = categorySelect.value;
    const date = dateInput.value || todayStr();

    if (description === "" || !(amount > 0)) return;

    try {
        transactions.push(await insertTransaction({ description, amount, type, category, date }));
    } catch (error) {
        handleError(error);
        return;
    }
    refresh();

    form.reset();
    dateInput.value = todayStr();
    fillCategories(categorySelect, typeSelect.value);
    descriptionInput.focus();
}

function render() {
    updateSummary();
    renderCharts();
    renderRecent();
}

function refresh() {
    setupMonthSelect(monthSelect, transactions, render, true);
    render();
}

// --- Start ---
bindCategoryToType(typeSelect, categorySelect);
dateInput.value = todayStr();
form.addEventListener("submit", addTransaction);

async function start() {
    try {
        const user = await requireLogin();
        if (!user) return;
        setupSidebar(user);
        await applyRecurring();
        transactions = await loadTransactions();
        refresh();
    } catch (error) {
        handleError(error);
    }
}
start();
