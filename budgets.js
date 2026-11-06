// ===== MoneyTrack - Budgets =====

const budgetForm = document.getElementById("budgetForm");
const budgetCategory = document.getElementById("budgetCategory");
const budgetLimit = document.getElementById("budgetLimit");
const budgetList = document.getElementById("budgetList");
const monthSelect = document.getElementById("monthFilter");

const totalBudgetEl = document.getElementById("totalBudget");
const totalSpentEl = document.getElementById("totalSpent");
const totalLeftEl = document.getElementById("totalLeft");

let budgets = {};
let transactions = [];

// This page always works with one month ("all time" falls back to this month)
function budgetMonth() {
    const m = getMonth();
    return m === "all" ? currentMonth() : m;
}

function spentByCategory() {
    const month = budgetMonth();
    const spent = {};
    transactions
        .filter((t) => t.type === "expense" && monthOf(t) === month)
        .forEach((t) => {
            spent[categoryOf(t)] = (spent[categoryOf(t)] || 0) + t.amount;
        });
    return spent;
}

function render() {
    const spent = spentByCategory();
    const categories = CATEGORIES.expense.filter((c) => budgets[c] > 0);

    let totalBudget = 0;
    let totalSpent = 0;
    categories.forEach((c) => {
        totalBudget += budgets[c];
        totalSpent += spent[c] || 0;
    });

    totalBudgetEl.textContent = formatRupiah(totalBudget);
    totalSpentEl.textContent = formatRupiah(totalSpent);
    totalLeftEl.textContent = formatRupiah(totalBudget - totalSpent);
    totalLeftEl.className = totalBudget - totalSpent < 0 ? "expense" : "";

    budgetList.innerHTML = "";

    if (categories.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No budget yet.";
        budgetList.appendChild(empty);
        return;
    }

    categories.forEach((c) => {
        const limit = budgets[c];
        const used = spent[c] || 0;
        const ratio = used / limit;

        const box = document.createElement("div");
        box.classList.add("goal");

        const top = document.createElement("div");
        top.classList.add("goal-top");
        const title = document.createElement("h3");
        title.textContent = c;
        const percentText = document.createElement("strong");
        percentText.textContent = Math.round(ratio * 100) + "%";
        top.appendChild(title);
        top.appendChild(percentText);

        const progress = document.createElement("div");
        progress.classList.add("progress");
        const bar = document.createElement("div");
        bar.classList.add("progress-bar");
        if (ratio >= 1) bar.classList.add("over");
        else if (ratio >= 0.8) bar.classList.add("warn");
        bar.style.width = Math.min(100, ratio * 100) + "%";
        progress.appendChild(bar);

        const meta = document.createElement("div");
        meta.classList.add("goal-meta");
        const amounts = document.createElement("div");
        amounts.textContent = formatRupiah(used) + " of " + formatRupiah(limit);
        const status = document.createElement("div");
        status.textContent = used > limit
            ? "⚠️ Over budget by " + formatRupiah(used - limit)
            : formatRupiah(limit - used) + " left";
        meta.appendChild(amounts);
        meta.appendChild(status);

        const row = document.createElement("div");
        row.classList.add("deposit-row");

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.classList.add("btn", "secondary");
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => {
            budgetCategory.value = c;
            budgetLimit.value = limit;
            budgetLimit.focus();
            budgetForm.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.classList.add("btn", "danger");
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", async () => {
            if (!confirm("Delete the " + c + " budget?")) return;
            try {
                await deleteBudgetRow(c);
            } catch (error) {
                handleError(error);
                return;
            }
            delete budgets[c];
            render();
        });

        row.appendChild(editBtn);
        row.appendChild(deleteBtn);

        box.appendChild(top);
        box.appendChild(progress);
        box.appendChild(meta);
        box.appendChild(row);
        budgetList.appendChild(box);
    });
}

async function saveBudget(event) {
    event.preventDefault();
    const limit = Number(budgetLimit.value);
    if (!(limit > 0)) return;

    try {
        await saveBudgetRow(budgetCategory.value, limit);
    } catch (error) {
        handleError(error);
        return;
    }

    budgets[budgetCategory.value] = limit;
    budgetForm.reset();
    render();
}

// --- Start ---
fillCategories(budgetCategory, "expense");
budgetForm.addEventListener("submit", saveBudget);

async function start() {
    try {
        const user = await requireLogin();
        if (!user) return;
        setupSidebar(user);
        await applyRecurring();
        [transactions, budgets] = await Promise.all([loadTransactions(), loadBudgets()]);
        setupMonthSelect(monthSelect, transactions, render, false);
        render();
    } catch (error) {
        handleError(error);
    }
}
start();
