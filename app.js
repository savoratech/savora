const SUPABASE_URL = "https://lcqqfgyscpktrmpxsdpq.supabase.co";
const SUPABASE_KEY = "sb_publishable_v9OzNjA6-xwG1BLTrjhUiA_vedhNR3S";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// Savora stores all user data in this single localStorage key.
const STORAGE_KEY = "savora-data";

// These categories are used for the spending tracker totals.
const CATEGORIES = ["Food", "Transport", "Shopping", "Entertainment", "Travel", "Other"];

// Starter data makes the app useful on first open. Users can reset back to this sample data.
const demoData = {
  income: 0,
  bills: [],
  transactions: [],
  goals: [],
  renewals: [],
};

// The app state is kept in memory while the page is open, then saved after every change.
let state = loadState();

const elements = {
  incomeForm: document.querySelector("#incomeForm"),
  incomeInput: document.querySelector("#incomeInput"),
  incomeAmount: document.querySelector("#incomeAmount"),
  billsAmount: document.querySelector("#billsAmount"),
  spendingAmount: document.querySelector("#spendingAmount"),
  remainingAmount: document.querySelector("#remainingAmount"),
  renewalCount: document.querySelector("#renewalCount"),
  billForm: document.querySelector("#billForm"),
  billId: document.querySelector("#billId"),
  billName: document.querySelector("#billName"),
  billAmount: document.querySelector("#billAmount"),
  billDueDate: document.querySelector("#billDueDate"),
  billSubmitButton: document.querySelector("#billSubmitButton"),
  billTotalLabel: document.querySelector("#billTotalLabel"),
  billList: document.querySelector("#billList"),
  transactionForm: document.querySelector("#transactionForm"),
  transactionName: document.querySelector("#transactionName"),
  transactionAmount: document.querySelector("#transactionAmount"),
  transactionCategory: document.querySelector("#transactionCategory"),
  transactionTotalLabel: document.querySelector("#transactionTotalLabel"),
  transactionList: document.querySelector("#transactionList"),
  categoryTotals: document.querySelector("#categoryTotals"),
  goalForm: document.querySelector("#goalForm"),
  goalName: document.querySelector("#goalName"),
  goalTarget: document.querySelector("#goalTarget"),
  goalSaved: document.querySelector("#goalSaved"),
  goalList: document.querySelector("#goalList"),
  renewalForm: document.querySelector("#renewalForm"),
  renewalType: document.querySelector("#renewalType"),
  customRenewalGroup: document.querySelector("#customRenewalGroup"),
  customRenewalName: document.querySelector("#customRenewalName"),
  renewalDate: document.querySelector("#renewalDate"),
  renewalList: document.querySelector("#renewalList"),
  resetDemoButton: document.querySelector("#resetDemoButton")
};

// Convert a number into a currency string for the user's browser locale.
function formatMoney(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP"
  }).format(value || 0);
}

// Create an ID for new records. crypto is preferred, with a fallback for older browsers.
function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Clone plain data objects so demo data is copied instead of shared by reference.
function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

// Dates are displayed in a compact, readable format.
function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${dateString}T00:00:00`));
}

// Escape user-entered text before placing it in HTML strings.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Load saved data. If none exists yet, save and return demo data.
function loadState() {
  return cloneData(demoData);
}

function saveState() {
  // Supabase now handles saving data.
}

// Add all amounts in an array. The key tells the function which field to add.
function sumBy(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

// A renewal is upcoming when it falls within the next 30 days.
function isUpcoming(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const renewalDate = new Date(`${dateString}T00:00:00`);
  const daysAway = Math.ceil((renewalDate - today) / (1000 * 60 * 60 * 24));

  return daysAway >= 0 && daysAway <= 30;
}

// Render every section from state. Calling this after changes keeps the UI in sync.
function render() {
  const totalBills = sumBy(state.bills, "amount");
  const totalSpending = sumBy(state.transactions, "amount");
  const remaining = Number(state.income || 0) - totalBills - totalSpending;
  const upcomingRenewals = state.renewals.filter((renewal) => isUpcoming(renewal.date)).length;

  elements.incomeInput.value = state.income || "";
  elements.incomeAmount.textContent = formatMoney(state.income);
  elements.billsAmount.textContent = formatMoney(totalBills);
  elements.spendingAmount.textContent = formatMoney(totalSpending);
  elements.remainingAmount.textContent = formatMoney(remaining);
  elements.renewalCount.textContent = String(upcomingRenewals);
  elements.billTotalLabel.textContent = `${formatMoney(totalBills)} total`;
  elements.transactionTotalLabel.textContent = `${formatMoney(totalSpending)} total`;

  renderBills();
  renderTransactions();
  renderCategoryTotals();
  renderGoals();
  renderRenewals();
}

function renderBills() {
  if (state.bills.length === 0) {
    elements.billList.innerHTML = `<p class="empty-state">No bills yet. Add your first regular payment.</p>`;
    return;
  }

  elements.billList.innerHTML = state.bills.map((bill) => `
    <div class="list-item">
      <div class="item-main">
        <div>
          <p class="item-title">${escapeHtml(bill.name)}</p>
          <p class="item-meta">${formatMoney(bill.amount)} due ${formatDate(bill.dueDate)}</p>
        </div>
        <div class="item-actions">
          <button type="button" onclick="editBill('${bill.id}')">Edit</button>
          <button class="danger-button" type="button" onclick="deleteBill('${bill.id}')">Delete</button>
        </div>
      </div>
    </div>
  `).join("");
  document.querySelectorAll(".delete-transaction").forEach(button => {
  button.addEventListener("click", () => {
    const id = button.dataset.id;

    if (!confirm("Delete this transaction?")) return;

    state.transactions = state.transactions.filter(
      transaction => transaction.id !== id
    );

    saveState();
    render();
  });
});
}
function renderTransactions() {
  if (state.transactions.length === 0) {
    elements.transactionList.innerHTML = `<p class="empty-state">No transactions yet.</p>`;
    return;
  }

  elements.transactionList.innerHTML = state.transactions.map((transaction) => `
    <div class="list-item">
      <div class="item-main">
        <div>
          <p class="item-title">${escapeHtml(transaction.name)}</p>
          <p class="item-meta">${escapeHtml(transaction.category)}</p>
        </div>

        <div style="display:flex;align-items:center;gap:12px;">
          <strong>${formatMoney(transaction.amount)}</strong>
          <button class="delete-transaction" data-id="${transaction.id}">🗑</button>
        </div>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".delete-transaction").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      state.transactions = state.transactions.filter(transaction => transaction.id !== id);
      render();
    });
  });
}

function renderCategoryTotals() {
  elements.categoryTotals.innerHTML = CATEGORIES.map((category) => {
    const total = state.transactions
      .filter((transaction) => transaction.category === category)
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    return `
      <div class="category-pill">
        ${category}
        <strong>${formatMoney(total)}</strong>
      </div>
    `;
  }).join("");
}

function renderGoals() {
  if (state.goals.length === 0) {
    elements.goalList.innerHTML = `<p class="empty-state">No goals yet. Create a target to track progress.</p>`;
    return;
  }

  elements.goalList.innerHTML = state.goals.map((goal) => {
    const progress = Math.min((Number(goal.saved) / Number(goal.target)) * 100, 100);

    return `
      <div class="list-item">
        <div class="item-main">
          <div>
            <p class="item-title">${escapeHtml(goal.name)}</p>
            <p class="item-meta">${formatMoney(goal.saved)} of ${formatMoney(goal.target)}</p>
          </div>
          <strong>${Math.round(progress)}%</strong>
        </div>
        <div class="progress-track" aria-label="${escapeHtml(goal.name)} progress">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderRenewals() {
  if (state.renewals.length === 0) {
    elements.renewalList.innerHTML = `<p class="empty-state">No reminders yet.</p>`;
    return;
  }

  elements.renewalList.innerHTML = state.renewals.map((renewal) => `
    <div class="list-item ${isUpcoming(renewal.date) ? "upcoming" : ""}">
      <div class="item-main">
        <div>
          <p class="item-title">${escapeHtml(renewal.type)}</p>
          <p class="item-meta">Renews ${formatDate(renewal.date)}</p>
        </div>
        <button class="danger-button" type="button" onclick="deleteRenewal('${renewal.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

elements.incomeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {
    alert("Please log in first.");
    return;
  }

  const income = Number(elements.incomeInput.value);

  const { error } = await supabaseClient
  .from("user_settings")
  .upsert({
    user_id: user.id,
    income: income,
    updated_at: new Date().toISOString()
  });

if (error) {
  alert(error.message);
  console.log(error);
  return;
}

  state.income = income;
  render();
});

elements.billForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {
    alert("Please log in first.");
    return;
  }

  const bill = {
    name: elements.billName.value.trim(),
    amount: Number(elements.billAmount.value),
    due_date: elements.billDueDate.value,
    user_id: user.id
  };

  if (elements.billId.value) {
    await supabaseClient
      .from("bills")
      .update(bill)
      .eq("id", elements.billId.value);
  } else {
    await supabaseClient
      .from("bills")
      .insert(bill);
  }

  elements.billForm.reset();
  elements.billId.value = "";
  elements.billSubmitButton.textContent = "Add bill";

  await loadUserData();
});

elements.transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {
    alert("Please log in first.");
    return;
  }

  const transaction = {
    name: elements.transactionName.value.trim(),
    amount: Number(elements.transactionAmount.value),
    category: elements.transactionCategory.value,
    user_id: user.id
  };

  const { error } = await supabaseClient
    .from("transactions")
    .insert(transaction);

  if (error) {
    alert(error.message);
    console.error(error);
    return;
  }

  elements.transactionForm.reset();

  await loadUserData();
});
elements.goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {
    alert("Please log in first.");
    return;
  }

  const goal = {
    name: elements.goalName.value.trim(),
    target_amount: Number(elements.goalTarget.value),
    current_amount: Number(elements.goalSaved.value),
    user_id: user.id
  };

  const { error } = await supabaseClient
    .from("savings_goals")
    .insert(goal);

  if (error) {
    alert(error.message);
    console.error(error);
    return;
  }

  elements.goalForm.reset();

  await loadUserData();
});

elements.renewalForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const type = elements.renewalType.value === "Custom reminder"
    ? elements.customRenewalName.value.trim() || "Custom reminder"
    : elements.renewalType.value;

  state.renewals.push({
    id: createId(),
    type,
    date: elements.renewalDate.value
  });

  elements.renewalForm.reset();
  toggleCustomRenewalField();
  saveState();
  render();
});

elements.renewalType.addEventListener("change", toggleCustomRenewalField);

elements.resetDemoButton?.addEventListener("click", () => {
  state = cloneData(demoData);
  saveState();
  render();
});

// Show the custom reminder input only when the custom type is selected.
function toggleCustomRenewalField() {
  const isCustom = elements.renewalType.value === "Custom reminder";
  elements.customRenewalGroup.classList.toggle("hidden", !isCustom);
  elements.customRenewalName.required = isCustom;
}

// These functions are global so the buttons created with innerHTML can call them.
function editBill(id) {
  const bill = state.bills.find((item) => item.id === id);

  if (!bill) {
    return;
  }

  elements.billId.value = bill.id;
  elements.billName.value = bill.name;
  elements.billAmount.value = bill.amount;
  elements.billDueDate.value = bill.dueDate;
  elements.billSubmitButton.textContent = "Save bill";
  elements.billName.focus();
}

async function deleteBill(id) {
  await supabaseClient
    .from("bills")
    .delete()
    .eq("id", id);

  await loadUserData();
}

function deleteRenewal(id) {
  state.renewals = state.renewals.filter((renewal) => renewal.id !== id);
  saveState();
  render();
}

toggleCustomRenewalField();
render();
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authMessage = document.getElementById("authMessage");

signupBtn?.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signUp({
    email: authEmail.value,
    password: authPassword.value
  });

  authMessage.textContent = error
    ? error.message
    : "Account created successfully.";
});

loginBtn?.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: authEmail.value,
    password: authPassword.value
  });

  if (error) {
  authMessage.textContent = error.message;
} else {
  authMessage.textContent = "Logged in successfully.";
  checkUser();
}
});

logoutBtn?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  authMessage.textContent = "Logged out.";
  checkUser();
});
async function loadUserData() {
  const { data: bills } = await supabaseClient
    .from("bills")
    .select("*")
    .order("due_date", { ascending: true });

  const { data: transactions } = await supabaseClient
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });

  state.bills = (bills || []).map((bill) => ({
    id: bill.id,
    name: bill.name,
    amount: bill.amount,
    dueDate: bill.due_date
  }));
const { data: goals } = await supabaseClient
  .from("savings_goals")
  .select("*");

state.goals = (goals || []).map((goal) => ({
  id: goal.id,
  name: goal.name,
  target: goal.target_amount,
  saved: goal.current_amount
}));
  state.transactions = (transactions || []).map((transaction) => ({
    id: transaction.id,
    name: transaction.name,
    amount: transaction.amount,
    category: transaction.category
  }));

  const { data: settings } = await supabaseClient
    .from("user_settings")
    .select("income")
    .maybeSingle();

  state.income = settings?.income || 0;

  render();
}
async function checkUser() {
  const { data } = await supabaseClient.auth.getUser();
  const user = data.user;

  const loginPage = document.getElementById("loginPage");
  const appShell = document.getElementById("appShell");

  if (user) {
    loginPage.style.display = "none";

    appShell.style.display = "block";
    appShell.style.width = "100%";
    appShell.style.margin = "0 auto";

    await loadUserData();
  } else {
    loginPage.style.display = "flex";
    appShell.style.display = "none";
  }
}


const dashboardLogoutBtn = document.getElementById("dashboardLogoutBtn");

dashboardLogoutBtn?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  checkUser();
});

checkUser();