// ===== MoneyTrack - common.js =====
// Shared by every page. Needs the Supabase library + supabase-config.js loaded before it.

// Browser-only keys (preferences, selected month, and data from the old offline version)
const KEYS = {
    tx: "moneytrack-transactions",
    goals: "moneytrack-savings-goals",
    budgets: "moneytrack-budgets",
    recurring: "moneytrack-recurring",
    settings: "moneytrack-settings",
    month: "moneytrack-month"
};

const CATEGORIES = {
    expense: ["Food", "Transport", "Bills", "Shopping", "Health", "Entertainment", "Education", "Savings", "Other"],
    income: ["Salary", "Business", "Gift", "Other"]
};

// --- Local storage (only for preferences on this device) ---
function load(key, fallback) {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : fallback;
    } catch (error) {
        return fallback;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error("Could not save " + key + ":", error);
    }
}

function getSettings() {
    return Object.assign({ theme: "light", savingsAsExpense: true }, load(KEYS.settings, {}));
}

function saveSettings(settings) { save(KEYS.settings, settings); }

function applyTheme() {
    document.documentElement.dataset.theme = getSettings().theme;
}
applyTheme();

// --- Login ---
let currentUser = null;

// Call at the start of every private page. Redirects to the login page if nobody is logged in.
async function requireLogin() {
    const { data } = await db.auth.getSession();
    if (!data.session) {
        location.href = "index.html";
        return null;
    }
    currentUser = data.session.user;
    db.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") location.href = "index.html";
    });
    return currentUser;
}

async function logout() {
    await db.auth.signOut();
    location.href = "index.html";
}

// Adds "email + Log out" to the bottom of the sidebar
function setupSidebar(user) {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    const box = document.createElement("div");
    box.classList.add("sidebar-user");

    const email = document.createElement("small");
    email.textContent = user.email;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Log out";
    btn.addEventListener("click", logout);

    box.appendChild(email);
    box.appendChild(btn);
    sidebar.appendChild(box);
}

// --- Database helpers ---
function check(result) {
    if (result.error) throw result.error;
    return result.data;
}

function handleError(error) {
    console.error(error);
    alert("Something went wrong: " + ((error && error.message) || error));
}

// Reads a whole table (Supabase returns at most 1000 rows per request)
async function fetchAll(table, orders) {
    const rows = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
        let query = db.from(table).select("*");
        orders.forEach(([column, ascending]) => {
            query = query.order(column, { ascending: ascending });
        });
        const data = check(await query.range(from, from + size - 1));
        rows.push(...data);
        if (data.length < size) break;
    }
    return rows;
}

// --- Transactions ---
function txFromRow(r) {
    return {
        id: r.id,
        description: r.description,
        amount: Number(r.amount),
        type: r.type,
        category: r.category,
        date: r.date,
        goalId: r.goal_id,
        recurringId: r.recurring_id,
        createdAt: r.created_at
    };
}

function txToRow(t) {
    return {
        description: t.description,
        amount: t.amount,
        type: t.type,
        category: t.category || "Other",
        date: t.date || todayStr(),
        goal_id: t.goalId || null,
        recurring_id: t.recurringId || null
    };
}

async function loadTransactions() {
    const rows = await fetchAll("transactions", [["date", false], ["created_at", false], ["id", false]]);
    return rows.map(txFromRow);
}

async function insertTransaction(t) {
    return txFromRow(check(await db.from("transactions").insert(txToRow(t)).select().single()));
}

// patch: any of description, amount, type, category, date
async function updateTransactionRow(id, patch) {
    check(await db.from("transactions").update(patch).eq("id", id));
}

async function deleteTransactionRow(id) {
    check(await db.from("transactions").delete().eq("id", id));
}

// --- Savings goals ---
function goalFromRow(r) {
    return { id: r.id, name: r.name, target: Number(r.target), saved: Number(r.saved), monthly: Number(r.monthly) };
}

async function loadGoals() {
    return (await fetchAll("goals", [["created_at", true], ["id", true]])).map(goalFromRow);
}

async function insertGoal(g) {
    const row = { name: g.name, target: g.target, saved: g.saved, monthly: g.monthly };
    return goalFromRow(check(await db.from("goals").insert(row).select().single()));
}

async function updateGoalSaved(id, saved) {
    check(await db.from("goals").update({ saved: saved }).eq("id", id));
}

async function deleteGoalRow(id) {
    check(await db.from("goals").delete().eq("id", id));
}

// --- Budgets (one limit per expense category) ---
async function loadBudgets() {
    const budgets = {};
    (await fetchAll("budgets", [["category", true]])).forEach((r) => {
        budgets[r.category] = Number(r.monthly_limit);
    });
    return budgets;
}

async function saveBudgetRow(category, limit) {
    check(await db.from("budgets").upsert(
        { user_id: currentUser.id, category: category, monthly_limit: limit },
        { onConflict: "user_id,category" }
    ));
}

async function deleteBudgetRow(category) {
    check(await db.from("budgets").delete().eq("category", category));
}

// --- Recurring transactions ---
function recurringFromRow(r) {
    return {
        id: r.id,
        description: r.description,
        amount: Number(r.amount),
        type: r.type,
        category: r.category,
        day: r.day,
        next: r.next_month
    };
}

async function loadRecurring() {
    return (await fetchAll("recurring", [["created_at", true], ["id", true]])).map(recurringFromRow);
}

async function insertRecurring(r) {
    const row = {
        description: r.description,
        amount: r.amount,
        type: r.type,
        category: r.category,
        day: r.day,
        next_month: r.next
    };
    return recurringFromRow(check(await db.from("recurring").insert(row).select().single()));
}

async function deleteRecurringRow(id) {
    check(await db.from("recurring").delete().eq("id", id));
}

// Creates the recurring transactions that are due. Returns how many were added.
async function applyRecurring() {
    const rules = await loadRecurring();
    if (rules.length === 0) return 0;

    const today = todayStr();
    const thisMonth = currentMonth();
    const created = [];
    const moved = [];

    rules.forEach((r) => {
        let next = r.next;
        let changed = false;

        while (next && next <= thisMonth) {
            const date = next + "-" + pad(r.day);
            if (date > today) break;
            created.push({
                description: r.description,
                amount: r.amount,
                type: r.type,
                category: r.category,
                date: date,
                recurring_id: r.id
            });
            next = addMonths(next, 1);
            changed = true;
        }

        if (changed) moved.push({ id: r.id, next: next });
    });

    if (created.length === 0) return 0;

    // The unique index (recurring_id, date) makes sure nothing is added twice
    check(await db.from("transactions").upsert(created, { onConflict: "recurring_id,date", ignoreDuplicates: true }));

    for (const m of moved) {
        check(await db.from("recurring").update({ next_month: m.next }).eq("id", m.id));
    }
    return created.length;
}

// --- Formatting / dates ---
function formatRupiah(number) {
    return "Rp " + Math.round(number).toLocaleString("id-ID");
}

function pad(n) { return String(n).padStart(2, "0"); }

function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function currentMonth() { return todayStr().slice(0, 7); }

// Dates are always saved now; the fallback is only for data from the old offline version
function dateOf(t) {
    if (t.date) return t.date;
    const d = new Date(t.id);
    if (isNaN(d)) return "1970-01-01";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function monthOf(t) { return dateOf(t).slice(0, 7); }
function categoryOf(t) { return t.category || "Other"; }

function formatDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatMonth(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function formatMonthShort(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "short" });
}

function addMonths(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
}

function sortNewest(a, b) {
    return dateOf(b).localeCompare(dateOf(a)) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

function sumBy(list) {
    let income = 0;
    let expense = 0;
    list.forEach((t) => {
        if (t.type === "income") income += t.amount;
        else expense += t.amount;
    });
    return { income: income, expense: expense, balance: income - expense };
}

// --- Category dropdowns ---
function fillCategories(select, type, selected) {
    select.innerHTML = "";
    CATEGORIES[type].forEach((c) => select.add(new Option(c, c)));
    if (selected && CATEGORIES[type].includes(selected)) select.value = selected;
}

function bindCategoryToType(typeSelect, categorySelect) {
    const update = () => fillCategories(categorySelect, typeSelect.value, categorySelect.value);
    typeSelect.addEventListener("change", update);
    update();
}

// --- Month selector (shared by all pages, remembered on this device) ---
function getMonth() { return load(KEYS.month, null) || currentMonth(); } // "all" or "YYYY-MM"

function setupMonthSelect(select, transactions, onChange, allowAll) {
    const months = new Set(transactions.map(monthOf));
    months.add(currentMonth());

    let selected = getMonth();
    if (selected === "all" && !allowAll) selected = currentMonth();
    if (selected !== "all") months.add(selected);

    select.innerHTML = "";
    if (allowAll) select.add(new Option("All time", "all"));
    [...months].sort().reverse().forEach((m) => select.add(new Option(formatMonth(m), m)));
    select.value = selected;

    select.onchange = () => {
        save(KEYS.month, select.value);
        onChange();
    };
}

// --- One transaction row (Dashboard and Transactions pages) ---
function iconButton(text, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("icon-btn");
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener("click", onClick);
    return btn;
}

function createRow(t, actions) {
    actions = actions || {};

    const row = document.createElement("div");
    row.classList.add("transaction");

    const info = document.createElement("div");
    info.classList.add("transaction-info");

    const name = document.createElement("span");
    name.textContent = t.description;

    const meta = document.createElement("span");
    meta.classList.add("transaction-meta");

    if (actions.onDateChange) {
        const date = document.createElement("input");
        date.type = "date";
        date.classList.add("transaction-date");
        date.value = dateOf(t);
        date.title = "Change date";
        date.addEventListener("change", () => {
            if (date.value) actions.onDateChange(t.id, date.value);
            else date.value = dateOf(t);
        });
        meta.appendChild(date);
    } else {
        meta.appendChild(document.createTextNode(formatDate(dateOf(t))));
    }
    meta.appendChild(document.createTextNode(" · " + categoryOf(t)));

    info.appendChild(name);
    info.appendChild(meta);

    const right = document.createElement("span");
    right.classList.add("transaction-right");

    const amount = document.createElement("span");
    amount.classList.add(t.type);
    amount.textContent = (t.type === "income" ? "+ " : "- ") + formatRupiah(t.amount);
    right.appendChild(amount);

    if (actions.onEdit) right.appendChild(iconButton("✎", "Edit", () => actions.onEdit(t)));
    if (actions.onDelete) right.appendChild(iconButton("✕", "Delete", () => actions.onDelete(t.id)));

    row.appendChild(info);
    row.appendChild(right);
    return row;
}
