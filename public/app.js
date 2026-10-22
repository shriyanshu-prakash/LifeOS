
const $ = (selector) => document.querySelector(selector);

const taskList = $("#task-list");
const aiResult = $("#ai-result");
const toast = $("#toast");

let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderTasks(tasks) {
  taskList.innerHTML = "";

  if (!tasks.length) {
    taskList.innerHTML = '<p class="empty">No tasks yet. Add one above to get started.</p>';
    return;
  }

  for (const task of tasks) {
    const row = document.createElement("div");
    row.className = `task-row ${task.status === "completed" ? "completed" : ""}`;

    row.innerHTML = `
      <input type="checkbox" aria-label="Complete task"
        ${task.status === "completed" ? "checked disabled" : ""}>
      <div class="task-details">
        <strong>${escapeHTML(task.title)}</strong>
        <small>${task.dueDate ? `Due ${escapeHTML(task.dueDate)}` : "No deadline set"}</small>
      </div>
      <span class="priority ${escapeHTML(task.priority)}">${escapeHTML(task.priority)}</span>
    `;

    const checkbox = row.querySelector('input[type="checkbox"]');

    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;

      try {
        await api("/api/tasks/" + encodeURIComponent(task.id) + "/complete", {
          method: "POST"
        });
        notify("Task completed!");
        await refreshTasks();
      } catch (error) {
        checkbox.checked = false;
        checkbox.disabled = false;
        notify(error.message);
      }
    });

    taskList.appendChild(row);
  }
}

async function refreshTasks() {
  try {
    const tasks = await api("/api/tasks");
    const pending = tasks.filter((task) => task.status === "pending");
    const completed = tasks.filter((task) => task.status === "completed");

    $("#pending-count").textContent = pending.length;
    $("#completed-count").textContent = completed.length;
    $("#high-count").textContent = pending.filter((task) => task.priority === "high").length;

    renderTasks(tasks);
  } catch (error) {
    taskList.innerHTML = `<p class="empty">${escapeHTML(error.message)}. Check the server.</p>`;
  }
}

$("#task-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = $("#task-title").value.trim();
  const priority = $("#task-priority").value;

  if (!title) return;

  const submitButton = event.submitter;
  submitButton.disabled = true;

  try {
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title, priority })
    });

    $("#task-title").value = "";
    notify("Task added!");
    await refreshTasks();
  } catch (error) {
    notify(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

$("#refresh-btn").addEventListener("click", refreshTasks);

$("#prioritize-btn").addEventListener("click", async () => {
  aiResult.textContent = "Prioritizing your tasks...";

  try {
    const tasks = await api("/api/prioritize", { method: "POST" });

    if (!tasks.length) {
      aiResult.textContent = "You're all caught up! Add a task to get started.";
      return;
    }

    aiResult.innerHTML = `
      <strong>Your priority order</strong>
      <ol>${tasks.map((task) => `
        <li><strong>${escapeHTML(task.title)}</strong>
        <br><small>${escapeHTML(task.priority)} priority${task.dueDate ? ` · Due ${escapeHTML(task.dueDate)}` : ""}</small></li>
      `).join("")}</ol>
    `;
  } catch (error) {
    aiResult.textContent = error.message;
  }
});

$("#plan-btn").addEventListener("click", async () => {
  aiResult.textContent = "Building your daily plan...";

  try {
    const result = await api("/api/plan", { method: "POST" });

    if (!result.plan.length) {
      aiResult.textContent = "No pending tasks. Enjoy the breathing room!";
      return;
    }

    aiResult.innerHTML = `
      <strong>Your plan for today · ${result.totalPending} tasks</strong>
      <ol>${result.plan.map(({ order, task }) => `
        <li><strong>${order}. ${escapeHTML(task.title)}</strong>
        <br><small>${escapeHTML(task.priority)} priority${task.dueDate ? ` · Due ${escapeHTML(task.dueDate)}` : ""}</small></li>
      `).join("")}</ol>
    `;
  } catch (error) {
    aiResult.textContent = error.message;
  }
});

const hour = new Date().getHours();
$("#greeting").textContent =
  hour < 12 ? "Good morning." :
  hour < 18 ? "Good afternoon." : "Good evening.";

$("#today").textContent = new Date().toLocaleDateString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric"
});

refreshTasks();
