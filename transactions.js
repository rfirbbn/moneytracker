// ===== MoneyTrack - Transactions page =====

let transactions = [];

const balanceEl = document.getElementById("balance");
const incomeEl = document.getElementById("income");
const expenseEl = document.getElementById("expense");
const listEl = document.getElementById("transactionList");
const countEl = document.getElementById("resultCount");

const searchInput = document.getElementById("search");
const monthSelect = document.getElementById("monthFilter");
const typeFilter = document.getElementById("filterType");
const categoryFilter = document.getElementById("filterCategory");
const sortSelect = document.getElementById("sortOrder");

const editDialog = document.getElementById("editDialog");
const editForm = document.getElementById("editForm");
const editName = document.getElementById("editName");
const editAmount = document.getElementById("editAmount");
const editType = document.getElementById("editType");
const editCategory = document.getElementById("editCategory");
const editDate = document.getElementById("editDate");
let editingId = null;

// --- Filtering + sorting ---
function getVisible() {
    const month = getMonth();
    const query = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;
    const category = categoryFilter.value;
    const sort = sortSelect.value;

    const result = transactions.filter((t) =>
        (month === "all" || monthOf(t) === month) &&
        (type === "all" || t.type === type) &&
        (category === "all" || categoryOf(t) === category) &&
        t.description.toLowerCase().includes(query)
    );

    result.sort((a, b) => {
        if (sort === "oldest") return -sortNewest(a, b);
        if (sort === "highest") return b.amount - a.amount;
        if (sort === "lowest") return a.amount - b.amount;
        return sortNewest(a, b);
    });

    return result;
}

function render() {
    const visible = getVisible();
    const totals = sumBy(visible);

    balanceEl.textContent = formatRupiah(totals.balance);
    incomeEl.textContent = formatRupiah(totals.income);
    expenseEl.textContent = formatRupiah(totals.expense);
    countEl.textContent = visible.length + " of " + transactions.length + " shown";

    listEl.innerHTML = "";

    if (visible.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = transactions.length === 0 ? "No transaction yet." : "No transaction matches your filter.";
        listEl.appendChild(empty);
        return;
    }

    visible.forEach((t) =>
        listEl.appendChild(
            createRow(t, { onEdit: openEdit, onDelete: deleteTransaction, onDateChange: changeDate })
        )
    );
}

// --- Actions ---
async function deleteTransaction(id) {
    if (!confirm("Delete this transaction?")) return;
    try {
        await deleteTransactionRow(id);
    } catch (error) {
        handleError(error);
        return;
    }
    transactions = transactions.filter((t) => t.id !== id);
    refresh();
}

async function changeDate(id, newDate) {
    try {
        await updateTransactionRow(id, { date: newDate });
        const t = transactions.find((item) => item.id === id);
        if (t) t.date = newDate;
    } catch (error) {
        handleError(error);
    }
    refresh();
}

function openEdit(t) {
    editingId = t.id;
    editName.value = t.description;
    editAmount.value = t.amount;
    editType.value = t.type;
    fillCategories(editCategory, t.type, categoryOf(t));
    editDate.value = dateOf(t);
    editDialog.showModal();
}

async function saveEdit(event) {
    event.preventDefault();

    const t = transactions.find((item) => item.id === editingId);
    const name = editName.value.trim();
    const amount = Number(editAmount.value);
    if (!t || name === "" || !(amount > 0)) return;

    const patch = {
        description: name,
        amount: amount,
        type: editType.value,
        category: editCategory.value,
        date: editDate.value || dateOf(t)
    };

    try {
        await updateTransactionRow(t.id, patch);
    } catch (error) {
        handleError(error);
        return;
    }

    Object.assign(t, patch);
    editDialog.close();
    refresh();
}

function refresh() {
    setupMonthSelect(monthSelect, transactions, render, true);
    render();
}

// --- Start ---
categoryFilter.add(new Option("All categories", "all"));
[...new Set([...CATEGORIES.expense, ...CATEGORIES.income])].forEach((c) => categoryFilter.add(new Option(c, c)));

bindCategoryToType(editType, editCategory);
editForm.addEventListener("submit", saveEdit);
document.getElementById("editCancel").addEventListener("click", () => editDialog.close());
document.getElementById("filterForm").addEventListener("submit", (e) => e.preventDefault());

searchInput.addEventListener("input", render);
[typeFilter, categoryFilter, sortSelect].forEach((el) => el.addEventListener("change", render));

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
