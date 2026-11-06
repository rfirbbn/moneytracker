// ===== MoneyTrack - Settings =====

const darkMode = document.getElementById("darkMode");
const savingsAsExpense = document.getElementById("savingsAsExpense");
const messageEl = document.getElementById("message");

const recurringForm = document.getElementById("recurringForm");
const recName = document.getElementById("recName");
const recAmount = document.getElementById("recAmount");
const recType = document.getElementById("recType");
const recCategory = document.getElementById("recCategory");
const recDay = document.getElementById("recDay");
const recurringList = document.getElementById("recurringList");

let messageTimer = null;

function showMessage(text) {
    messageEl.textContent = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (messageEl.textContent = ""), 6000);
}

// --- Preferences (saved on this device) ---
function setupPreferences() {
    const settings = getSettings();
    darkMode.checked = settings.theme === "dark";
    savingsAsExpense.checked = settings.savingsAsExpense;

    darkMode.addEventListener("change", () => {
        const s = getSettings();
        s.theme = darkMode.checked ? "dark" : "light";
        saveSettings(s);
        applyTheme();
    });

    savingsAsExpense.addEventListener("change", () => {
        const s = getSettings();
        s.savingsAsExpense = savingsAsExpense.checked;
        saveSettings(s);
    });
}

// --- Account ---
async function changePassword(event) {
    event.preventDefault();

    const password = document.getElementById("newPassword").value;
    if (password !== document.getElementById("newPassword2").value) {
        showMessage("The two passwords are not the same.");
        return;
    }

    const { error } = await db.auth.updateUser({ password: password });
    if (error) {
        showMessage(error.message);
    } else {
        event.target.reset();
        showMessage("Password changed.");
    }
}

// --- Recurring transactions ---
async function renderRecurring() {
    const rules = await loadRecurring();
    recurringList.innerHTML = "";

    if (rules.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No recurring transaction yet.";
        recurringList.appendChild(empty);
        return;
    }

    rules.forEach((r) => {
        const row = document.createElement("div");
        row.classList.add("transaction");

        const info = document.createElement("div");
        info.classList.add("transaction-info");
        const name = document.createElement("span");
        name.textContent = r.description;
        const meta = document.createElement("span");
        meta.classList.add("transaction-meta");
        meta.textContent = "Every month on day " + r.day + " · " + r.category;
        info.appendChild(name);
        info.appendChild(meta);

        const right = document.createElement("span");
        right.classList.add("transaction-right");
        const amount = document.createElement("span");
        amount.classList.add(r.type);
        amount.textContent = (r.type === "income" ? "+ " : "- ") + formatRupiah(r.amount);
        right.appendChild(amount);
        right.appendChild(iconButton("✕", "Delete", async () => {
            if (!confirm("Stop this recurring transaction? Past transactions stay.")) return;
            try {
                await deleteRecurringRow(r.id);
                await renderRecurring();
            } catch (error) {
                handleError(error);
            }
        }));

        row.appendChild(info);
        row.appendChild(right);
        recurringList.appendChild(row);
    });
}

async function addRecurring(event) {
    event.preventDefault();

    const description = recName.value.trim();
    const amount = Number(recAmount.value);
    const day = Math.min(28, Math.max(1, Math.round(Number(recDay.value))));
    if (description === "" || !(amount > 0)) return;

    // First run: this month if the day hasn't passed yet, otherwise next month
    const todayDay = Number(todayStr().slice(8, 10));
    const first = day >= todayDay ? currentMonth() : addMonths(currentMonth(), 1);

    try {
        await insertRecurring({
            description: description,
            amount: amount,
            type: recType.value,
            category: recCategory.value,
            day: day,
            next: first
        });
        const added = await applyRecurring(); // adds it right away if it is due today
        await renderRecurring();
        showMessage(added > 0 ? "Added, and today's transaction was recorded." : "Recurring transaction added.");
    } catch (error) {
        handleError(error);
        return;
    }

    recurringForm.reset();
    recDay.value = 1;
    fillCategories(recCategory, recType.value);
}

// --- Export ---
function download(filename, text, type) {
    const blob = new Blob([text], { type: type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function exportJson() {
    try {
        const [transactions, goals, budgets, recurring] = await Promise.all([
            loadTransactions(), loadGoals(), loadBudgets(), loadRecurring()
        ]);

        const data = {
            app: "MoneyTrack",
            exported: new Date().toISOString(),
            transactions: transactions.map((t) => ({
                description: t.description,
                amount: t.amount,
                type: t.type,
                category: categoryOf(t),
                date: dateOf(t)
            })),
            goals: goals.map((g) => ({ name: g.name, target: g.target, saved: g.saved, monthly: g.monthly })),
            budgets: budgets,
            recurring: recurring.map((r) => ({
                description: r.description,
                amount: r.amount,
                type: r.type,
                category: r.category,
                day: r.day,
                next: r.next
            }))
        };

        download("moneytrack-backup-" + todayStr() + ".json", JSON.stringify(data, null, 2), "application/json");
        showMessage("Backup downloaded.");
    } catch (error) {
        handleError(error);
    }
}

async function exportCsv() {
    try {
        const quote = (v) => '"' + String(v).replace(/"/g, '""') + '"';
        const rows = [["Date", "Name", "Type", "Category", "Amount"].map(quote).join(",")];

        (await loadTransactions()).sort(sortNewest).forEach((t) => {
            rows.push([dateOf(t), t.description, t.type, categoryOf(t), t.amount].map(quote).join(","));
        });

        download("moneytrack-transactions-" + todayStr() + ".csv", "\uFEFF" + rows.join("\n"), "text/csv");
        showMessage("CSV downloaded.");
    } catch (error) {
        handleError(error);
    }
}

// --- Import (a backup file, or data from the old offline version) ---
// ADDS the records to your account; nothing is replaced.
async function importData(data) {
    const transactions = (Array.isArray(data.transactions) ? data.transactions : [])
        .filter((t) => t && Number(t.amount) > 0 && (t.type === "income" || t.type === "expense"))
        .map((t) => ({
            description: String(t.description || "Transaction"),
            amount: Number(t.amount),
            type: t.type,
            category: t.category || "Other",
            date: dateOf(t)
        }));

    const goals = (Array.isArray(data.goals) ? data.goals : [])
        .filter((g) => g && g.name && Number(g.target) > 0 && Number(g.monthly) > 0)
        .map((g) => ({ name: String(g.name), target: Number(g.target), saved: Number(g.saved) || 0, monthly: Number(g.monthly) }));

    const budgetEntries = Object.entries(data.budgets && typeof data.budgets === "object" ? data.budgets : {})
        .filter(([category, limit]) => CATEGORIES.expense.includes(category) && Number(limit) > 0)
        .map(([category, limit]) => ({ user_id: currentUser.id, category: category, monthly_limit: Number(limit) }));

    const recurring = (Array.isArray(data.recurring) ? data.recurring : [])
        .filter((r) => r && Number(r.amount) > 0 && (r.type === "income" || r.type === "expense"))
        .map((r) => ({
            description: String(r.description || "Recurring"),
            amount: Number(r.amount),
            type: r.type,
            category: r.category || "Other",
            day: Math.min(28, Math.max(1, Math.round(Number(r.day) || 1))),
            next_month: r.next || currentMonth()
        }));

    for (let i = 0; i < transactions.length; i += 500) {
        check(await db.from("transactions").insert(transactions.slice(i, i + 500)));
    }
    if (goals.length) check(await db.from("goals").insert(goals));
    if (recurring.length) check(await db.from("recurring").insert(recurring));
    if (budgetEntries.length) {
        check(await db.from("budgets").upsert(budgetEntries, { onConflict: "user_id,category" }));
    }

    return { transactions: transactions.length, goals: goals.length, budgets: budgetEntries.length, recurring: recurring.length };
}

function importSummary(c) {
    return c.transactions + " transactions, " + c.goals + " goals, " + c.budgets + " budgets, " + c.recurring + " recurring";
}

async function importFromFile(file) {
    try {
        const data = JSON.parse(await file.text());
        if (!data || !Array.isArray(data.transactions)) throw new Error("Not a MoneyTrack backup");
        if (!confirm("Add the records from this backup to your account?")) return;

        const counts = await importData(data);
        showMessage("Imported: " + importSummary(counts) + ". Reload the other pages to see them.");
        await renderRecurring();
    } catch (error) {
        console.error(error);
        showMessage("Import failed: " + (error.message || "this file is not a valid MoneyTrack backup."));
    }
}

// Data saved by the old offline version lives in this browser's localStorage
async function importFromBrowser() {
    const data = {
        transactions: load(KEYS.tx, []),
        goals: load(KEYS.goals, []),
        budgets: load(KEYS.budgets, {}),
        recurring: load(KEYS.recurring, [])
    };

    if (data.transactions.length + data.goals.length + data.recurring.length + Object.keys(data.budgets).length === 0) {
        showMessage("No data from the old version was found in this browser.");
        return;
    }
    if (!confirm("Copy the data saved in this browser into your account?")) return;

    try {
        const counts = await importData(data);
        await renderRecurring();
        showMessage("Imported: " + importSummary(counts) + ".");

        if (confirm("Done! Remove the old copy from this browser so it can't be imported twice?")) {
            [KEYS.tx, KEYS.goals, KEYS.budgets, KEYS.recurring].forEach((key) => localStorage.removeItem(key));
        }
    } catch (error) {
        handleError(error);
    }
}

// --- Reset ---
async function resetAll() {
    if (!confirm("Delete ALL your transactions, goals, budgets and recurring rules? This cannot be undone.")) return;

    try {
        check(await db.from("transactions").delete().not("id", "is", null));
        check(await db.from("goals").delete().not("id", "is", null));
        check(await db.from("recurring").delete().not("id", "is", null));
        check(await db.from("budgets").delete().not("category", "is", null));
        await renderRecurring();
        showMessage("All your data was deleted.");
    } catch (error) {
        handleError(error);
    }
}

// --- Start ---
setupPreferences();
fillCategories(recCategory, recType.value);
recType.addEventListener("change", () => fillCategories(recCategory, recType.value));
recurringForm.addEventListener("submit", addRecurring);
document.getElementById("passwordForm").addEventListener("submit", changePassword);
document.getElementById("logoutBtn").addEventListener("click", logout);

document.getElementById("exportJson").addEventListener("click", exportJson);
document.getElementById("exportCsv").addEventListener("click", exportCsv);
document.getElementById("resetBtn").addEventListener("click", resetAll);
document.getElementById("migrateBtn").addEventListener("click", importFromBrowser);

const importFile = document.getElementById("importFile");
document.getElementById("importBtn").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
    if (importFile.files[0]) importFromFile(importFile.files[0]);
    importFile.value = "";
});

async function start() {
    try {
        const user = await requireLogin();
        if (!user) return;
        setupSidebar(user);
        document.getElementById("accountEmail").textContent = user.email;
        await applyRecurring();
        await renderRecurring();
    } catch (error) {
        handleError(error);
    }
}
start();
