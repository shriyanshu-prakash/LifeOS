import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import {
  listTasks,
  createTask,
  completeTask,
  prioritizeTasks,
  planMyDay
} from "./taskStore.js";

const app = express();
app.use(express.static("public"));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: "LifeOS" });
});

// REST API routes for the frontend
app.get("/api/tasks", async (_req, res) => {
  try {
    res.json(await listTasks());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const task = await createTask(req.body);
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/tasks/:id/complete", async (req, res) => {
  try {
    res.json(await completeTask({ id: req.params.id }));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post("/api/prioritize", async (_req, res) => {
  try {
    res.json(await prioritizeTasks());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/plan", async (_req, res) => {
  try {
    res.json(await planMyDay());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create the MCP server and register five tools.
function createMcpServer() {
  const server = new McpServer({
    name: "lifeos",
    version: "1.0.0"
  });

  server.tool(
    "list_tasks",
    "List tasks, optionally filtered by status.",
    { status: z.enum(["all", "pending", "completed"]).optional() },
    async ({ status = "all" }) => ({
      content: [{
        type: "text",
        text: JSON.stringify(await listTasks({ status }), null, 2)
      }]
    })
  );

  server.tool(
    "create_task",
    "Create a task with a title, description, priority and optional due date.",
    {
      title: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      dueDate: z.string().nullable().optional()
    },
    async (args) => ({
      content: [{
        type: "text",
        text: JSON.stringify(await createTask(args), null, 2)
      }]
    })
  );

  server.tool(
    "complete_task",
    "Mark a task as completed using its ID.",
    { id: z.string().uuid() },
    async ({ id }) => ({
      content: [{
        type: "text",
        text: JSON.stringify(await completeTask({ id }), null, 2)
      }]
    })
  );

  server.tool(
    "prioritize_tasks",
    "Rank pending tasks by priority and due date.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(await prioritizeTasks(), null, 2)
      }]
    })
  );

  server.tool(
    "plan_my_day",
    "Create an ordered daily plan from pending tasks.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(await planMyDay(), null, 2)
      }]
    })
  );

  return server;
}

// Each MCP session gets its own server and transport.
const transports = new Map();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  let transport;

  try {
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    const server = createMcpServer();

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => transports.set(id, transport)
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "MCP request failed"
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  if (!sessionId || !transports.has(sessionId)) {
    return res.status(400).send("Missing or invalid MCP session ID");
  }

  await transports.get(sessionId).handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  if (!sessionId || !transports.has(sessionId)) {
    return res.status(400).send("Missing or invalid MCP session ID");
  }

  await transports.get(sessionId).handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`LifeOS running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});