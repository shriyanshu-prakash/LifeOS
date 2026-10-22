
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../data/tasks.json");

async function readTasks() {
  try {
    const data = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(data);

    if (!Array.isArray(parsed.tasks)) {
      throw new Error("Invalid task store format");
    }

    return parsed.tasks;
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeFile(
        DATA_FILE,
        JSON.stringify({ tasks: [] }, null, 2),
        "utf8"
      );
      return [];
    }

    throw error;
  }
}

async function saveTasks(tasks) {
  await writeFile(
    DATA_FILE,
    JSON.stringify({ tasks }, null, 2),
    "utf8"
  );
}

export async function listTasks({ status = "all" } = {}) {
  const tasks = await readTasks();

  if (status === "all") {
    return tasks;
  }

  return tasks.filter((task) => task.status === status);
}

export async function createTask({
  title,
  description = "",
  priority = "medium",
  dueDate = null
}) {
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Task title is required");
  }

  const validPriorities = ["low", "medium", "high"];

  if (!validPriorities.includes(priority)) {
    throw new Error("Priority must be low, medium, or high");
  }

  const tasks = await readTasks();

  const task = {
    id: randomUUID(),
    title: title.trim(),
    description: description.trim(),
    priority,
    dueDate,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  tasks.push(task);
  await saveTasks(tasks);

  return task;
}

export async function completeTask({ id }) {
  const tasks = await readTasks();
  const task = tasks.find((item) => item.id === id);

  if (!task) {
    throw new Error("Task not found");
  }

  if (task.status !== "completed") {
    task.status = "completed";
    task.completedAt = new Date().toISOString();
    await saveTasks(tasks);
  }

  return task;
}

export async function prioritizeTasks() {
  const tasks = await readTasks();

  const priorityRank = {
    high: 0,
    medium: 1,
    low: 2
  };

  return tasks
    .filter((task) => task.status === "pending")
    .sort((a, b) => {
      const priorityDifference =
        priorityRank[a.priority] - priorityRank[b.priority];

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }

      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return a.createdAt.localeCompare(b.createdAt);
    });
}

export async function planMyDay() {
  const tasks = await prioritizeTasks();

  return {
    generatedAt: new Date().toISOString(),
    totalPending: tasks.length,
    plan: tasks.map((task, index) => ({
      order: index + 1,
      task
    }))
  };
}
