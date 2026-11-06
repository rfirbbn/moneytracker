// ===== MoneyTrack - Savings Plan =====

const goalForm = document.getElementById("goalForm");
const nameInput = document.getElementById("goalName");
const targetInput = document.getElementById("goalTarget");
const savedInput = document.getElementById("goalSaved");
const monthlyInput = document.getElementById("goalMonthly");
const formEstimate = document.getElementById("formEstimate");
const goalList = document.getElementById("goalList");
const depositNote = document.getElementById("depositNote");

const totalSavedEl = document.getElementById("totalSaved");
const totalTargetEl = document.getElementById("totalTarget");
const totalProgressEl = document.getElementById("totalProgress");

let goals = [];

// --- Estimate: months until the goal is reached ---
function getEstimate(target, saved, monthly) {
    const remaining = target - saved;
    if (remaining <= 0 || !(monthly > 0)) return null;

    const months = Math.ceil(remaining / monthly);
    const date = new Date();
    date.setMonth(date.getMonth() + months);

    return {
        months: months,
        dateText: date.toLocaleDateString("id-ID", { month: "long", year: "numeric" })
    };
}

function estimateText(estimate) {
    const years = Math.floor(estimate.months / 12);
    const rest = estimate.months % 12;
    let duration = "";
    if (years > 0) duration += years + " year" + (years > 1 ? "s" : "") + " ";
    if (rest > 0) duration += rest + " month" + (rest > 1 ? "s" : "");
    return duration.trim() + " (around " + estimate.dateText + ")";
}

// --- Summary cards ---
function updateSummary() {
    let saved = 0;
    let target = 0;
    goals.forEach((g) => {
        saved += g.saved;
        target += g.target;
    });

    const percent = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    totalSavedEl.textContent = formatRupiah(saved);
    totalTargetEl.textContent = formatRupiah(target);
    totalProgressEl.textContent = percent + "%";

    depositNote.textContent = getSettings().savingsAsExpense
        ? "New deposits are also recorded as an expense (category: Savings), so your balance goes down. You can change this in Settings."
        : "Deposits only change the goal. They don't affect your balance (see Settings).";
}

// --- Goal list ---
function renderGoals() {
    goalList.innerHTML = "";

    if (goals.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No savings goal yet.";
        goalList.appendChild(empty);
        return;
    }

    goals.forEach((g) => {
        const percent = Math.min(100, Math.round((g.saved / g.target) * 100));
        const finished = g.saved >= g.target;

        const box = document.createElement("div");
        box.classList.add("goal");

        const top = document.createElement("div");
        top.classList.add("goal-top");
        const title = document.createElement("h3");
        title.textContent = g.name;
        const percentText = document.createElement("strong");
        percentText.textContent = percent + "%";
        top.appendChild(title);
        top.appendChild(percentText);

        const progress = document.createElement("div");
        progress.classList.add("progress");
        const bar = document.createElement("div");
        bar.classList.add("progress-bar");
        if (finished) bar.classList.add("done");
        bar.style.width = percent + "%";
        progress.appendChild(bar);

        const meta = document.createElement("div");
        meta.classList.add("goal-meta");
        const amounts = document.createElement("div");
        amounts.textContent =
            formatRupiah(g.saved) + " of " + formatRupiah(g.target) +
            " · Plan: " + formatRupiah(g.monthly) + " / month";
        const eta = document.createElement("div");
        eta.textContent = finished
            ? "🎉 Goal reached!"
            : "Estimated finish: " + estimateText(getEstimate(g.target, g.saved, g.monthly));
        meta.appendChild(amounts);
        meta.appendChild(eta);

        const row = document.createElement("div");
        row.classList.add("deposit-row");

        const depositInput = document.createElement("input");
        depositInput.type = "number";
        depositInput.min = "1";
        depositInput.placeholder = "Add savings (Rp)";

        const depositBtn = document.createElement("button");
        depositBtn.type = "button";
        depositBtn.classList.add("btn");
        depositBtn.textContent = "Add";
        depositBtn.addEventListener("click", () => {
            const value = Number(depositInput.value);
            if (value > 0) addDeposit(g.id, value);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.classList.add("btn", "danger");
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => deleteGoal(g.id));

        row.appendChild(depositInput);
        row.appendChild(depositBtn);
        row.appendChild(deleteBtn);

        box.appendChild(top);
        box.appendChild(progress);
        box.appendChild(meta);
        box.appendChild(row);
        goalList.appendChild(box);
    });
}

// --- Actions ---
async function addGoal(event) {
    event.preventDefault();

    const name = nameInput.value.trim();
    const target = Number(targetInput.value);
    const saved = Number(savedInput.value) || 0;
    const monthly = Number(monthlyInput.value);

    if (name === "" || !(target > 0) || !(monthly > 0) || saved < 0) return;

    try {
        goals.push(await insertGoal({ name, target, saved, monthly }));
    } catch (error) {
        handleError(error);
        return;
    }
    refresh();

    goalForm.reset();
    savedInput.value = 0;
    formEstimate.textContent = "";
    nameInput.focus();
}

async function addDeposit(id, amount) {
    const goal = goals.find((g) => g.id === id);
    if (!goal) return;

    const newSaved = goal.saved + amount;

    try {
        await updateGoalSaved(id, newSaved);

        // Also record it as an expense so the balance matches
        if (getSettings().savingsAsExpense) {
            await insertTransaction({
                description: "Savings: " + goal.name,
                amount: amount,
                type: "expense",
                category: "Savings",
                date: todayStr(),
                goalId: goal.id
            });
        }
    } catch (error) {
        handleError(error);
        return;
    }

    goal.saved = newSaved;
    refresh();
}

async function deleteGoal(id) {
    if (!confirm("Delete this savings goal?")) return;
    try {
        await deleteGoalRow(id);
    } catch (error) {
        handleError(error);
        return;
    }
    goals = goals.filter((g) => g.id !== id);
    refresh();
}

function refresh() {
    updateSummary();
    renderGoals();
}

function updateFormEstimate() {
    const target = Number(targetInput.value);
    const saved = Number(savedInput.value) || 0;
    const monthly = Number(monthlyInput.value);

    if (!(target > 0) || !(monthly > 0)) {
        formEstimate.textContent = "";
        return;
    }

    const estimate = getEstimate(target, saved, monthly);
    formEstimate.textContent = estimate
        ? "You will reach this goal in " + estimateText(estimate)
        : "You already reached this target!";
}

// --- Start ---
goalForm.addEventListener("submit", addGoal);
[targetInput, savedInput, monthlyInput].forEach((input) => input.addEventListener("input", updateFormEstimate));

async function start() {
    try {
        const user = await requireLogin();
        if (!user) return;
        setupSidebar(user);
        goals = await loadGoals();
        refresh();
    } catch (error) {
        handleError(error);
    }
}
start();
