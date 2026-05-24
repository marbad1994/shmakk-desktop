import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

let mainWindow: BrowserWindow | null = null;
const IS_CLI_MODE = process.env.SHMAKK_CLI === "1";

// ── Paths ─────────────────────────────────────────────────────────────────

const SHMAKK_DIR = path.join(app.getPath("home"), ".config", "shmakk");
const SESSIONS_DB = path.join(SHMAKK_DIR, "sessions.db");
const SKILLS_DIR = path.join(SHMAKK_DIR, "skills");
const PLUGINS_DIR = path.join(SHMAKK_DIR, "plugins");
const WORKSPACE_JSON = path.join(SHMAKK_DIR, "workspace.json");
const ENDPOINTS_JSON = path.join(SHMAKK_DIR, "endpoints.json");
const RULES_MD = path.join(SHMAKK_DIR, "rules.md");
const SKILLS_REGISTRY_JSON = path.join(SHMAKK_DIR, "skills-registry.json");

// ── Window ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#111114",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function runCliMode() {
  try {
    require("shmakk/bin/shmakk.js");
  } catch (e) {
    console.error("[shmakk-desktop] Failed to launch CLI mode:", e);
    app.exit(1);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath: string, data: unknown): boolean {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

function sendToRenderer(channel: string, data: unknown) {
  mainWindow?.webContents.send(channel, data);
}

function resolveInsideRoot(root: string, relativePath = ""): string | null {
  if (!root) return null;
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const rel = path.relative(resolvedRoot, resolvedPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolvedPath;
}

function resolveWorkspacePath(relativePath = ""): string | null {
  const root = workspaceRoot || "";
  return resolveInsideRoot(root, relativePath);
}

function safeFileName(fileName: string): string {
  return path.basename(fileName).replace(/[<>:"/\\|?*]/g, "_");
}

function defaultProjectSettings(settings?: Record<string, unknown>): Record<string, unknown> {
  return {
    shareMemory: false,
    shareKnowledge: false,
    shareArtifacts: true,
    ...(settings || {}),
  };
}

function parseSettings(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return defaultProjectSettings();
  try {
    const parsed = JSON.parse(raw);
    return defaultProjectSettings(parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {});
  } catch {
    return defaultProjectSettings();
  }
}

function resolveShmakkBaseDir(): string {
  const envDir = process.env.SHMAKK_SOURCE_DIR;
  if (envDir && fs.existsSync(envDir)) return path.resolve(envDir);

  try {
    const pkgJson = require.resolve("shmakk/package.json");
    return path.dirname(pkgJson);
  } catch {
    const localDir = path.resolve(__dirname, "..", "..", "shmakk");
    if (fs.existsSync(localDir)) return localDir;
    return path.resolve(process.cwd(), "shmakk");
  }
}

// ── Window controls ──────────────────────────────────────────────────────

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on("window:close", () => mainWindow?.close());

ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);

// ── Workspace ─────────────────────────────────────────────────────────────

let workspaceRoot = "";

ipcMain.handle("workspace:getRoot", () => {
  if (workspaceRoot) return workspaceRoot;
  const data = readJsonSafe(WORKSPACE_JSON);
  if (data && typeof data.root === "string") {
    workspaceRoot = data.root;
  }
  return workspaceRoot;
});

ipcMain.handle("workspace:setRoot", (_event, rootPath: string) => {
  workspaceRoot = rootPath;
  writeJsonSafe(WORKSPACE_JSON, { root: rootPath });
});

ipcMain.handle("workspace:listFiles", async (_event, dirPath?: string) => {
  const root = workspaceRoot || "";
  const target = resolveWorkspacePath(dirPath || "");
  if (!target || !fs.existsSync(target)) return [];

  const entries = fs.readdirSync(target, { withFileTypes: true });
  return entries
    .filter((d) => !d.name.startsWith(".") && !d.name.startsWith("node_modules"))
    .map((d) => ({
      name: d.name,
      path: path.relative(root, path.join(target, d.name)),
      isDirectory: d.isDirectory(),
    }));
});

ipcMain.handle("workspace:readFile", (_event, filePath: string) => {
  const fullPath = resolveWorkspacePath(filePath);
  if (!fullPath) return null;
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf-8");
});

ipcMain.handle("workspace:writeFile", (_event, filePath: string, content: string) => {
  const fullPath = resolveWorkspacePath(filePath);
  if (!fullPath) return false;
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
  return true;
});

ipcMain.handle("workspace:deleteFile", (_event, filePath: string) => {
  const fullPath = resolveWorkspacePath(filePath);
  if (!fullPath) return false;
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) fs.rmSync(fullPath, { recursive: true });
    else fs.unlinkSync(fullPath);
    return true;
  }
  return false;
});

ipcMain.handle("workspace:renameFile", (_event, oldPath: string, newName: string) => {
  const root = workspaceRoot || "";
  const oldFull = resolveWorkspacePath(oldPath);
  const newFull = resolveWorkspacePath(path.join(path.dirname(oldPath), path.basename(newName)));
  if (!oldFull || !newFull) return false;
  if (fs.existsSync(oldFull) && !fs.existsSync(newFull)) {
    fs.renameSync(oldFull, newFull);
    return true;
  }
  return false;
});

ipcMain.handle("workspace:getProjectFiles", async () => {
  const root = workspaceRoot || "";
  if (!root || !fs.existsSync(root)) return [];

  const results: { path: string; status: string }[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "dist-electron") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        results.push({
          path: path.relative(root, fullPath),
          status: "unchanged",
        });
      }
    }
  };
  walk(root);
  return results;
});

// ── Dialog ────────────────────────────────────────────────────────────────

ipcMain.handle("dialog:selectDirectory", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ── Sessions (SQLite) ─────────────────────────────────────────────────────

function openSessionsDb() {
  try {
    return new DatabaseSync(SESSIONS_DB, { open: true, readOnly: true });
  } catch {
    return null;
  }
}

ipcMain.handle("sessions:list", (_event, mode?: string) => {
  try {
    // Migration: ensure mode column exists
    const dbw = new DatabaseSync(SESSIONS_DB, { open: true });
    try { dbw.exec("ALTER TABLE sessions ADD COLUMN mode TEXT DEFAULT 'chat'"); } catch { /* exists */ }

    const query = mode
      ? `SELECT s.id, s.started_at, s.ended_at, s.workspace, s.summary, s.mode,
                (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.id) as turn_count,
                (SELECT MAX(t.ts) FROM turns t WHERE t.session_id = s.id) as last_active
         FROM sessions s WHERE s.mode = ?1
         ORDER BY s.started_at DESC LIMIT 200`
      : `SELECT s.id, s.started_at, s.ended_at, s.workspace, s.summary, s.mode,
                (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.id) as turn_count,
                (SELECT MAX(t.ts) FROM turns t WHERE t.session_id = s.id) as last_active
         FROM sessions s
         ORDER BY s.started_at DESC LIMIT 200`;

    const rows = mode ? dbw.prepare(query).all(mode) : dbw.prepare(query).all();
    dbw.close();
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      startedAt: r.started_at as number,
      endedAt: r.ended_at as number | null,
      workspace: r.workspace as string,
      summary: r.summary as string,
      mode: (r.mode as string) || "chat",
      turnCount: r.turn_count as number,
    }));
  } catch {
    return [];
  }
});

ipcMain.handle("sessions:get", (_event, sessionId: string) => {
  const db = openSessionsDb();
  if (!db) return null;
  try {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
    if (!session) return null;

    const turns = db.prepare(
      "SELECT id, ts, role, content FROM turns WHERE session_id = ? ORDER BY ts ASC",
    ).all(sessionId);

    return {
      id: session.id as string,
      startedAt: session.started_at as number,
      endedAt: session.ended_at as number | null,
      workspace: session.workspace as string,
      summary: session.summary as string,
      turns: (turns as Array<Record<string, unknown>>).map((t) => ({
        id: String(t.id),
        ts: t.ts as number,
        role: t.role as string,
        content: t.content as string,
      })),
    };
  } finally {
    db.close();
  }
});

ipcMain.handle("sessions:current", () => {
  const db = openSessionsDb();
  if (!db) return null;
  try {
    const row = db.prepare(
      "SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1",
    ).get() as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      startedAt: row.started_at as number,
      summary: row.summary as string,
    };
  } finally {
    db.close();
  }
});

ipcMain.handle("sessions:rename", (_event, sessionId: string, newSummary: string) => {
  try {
    const db = new DatabaseSync(SESSIONS_DB, { open: true });
    try {
      db.prepare("UPDATE sessions SET summary = ? WHERE id = ?").run(newSummary, sessionId);
      return true;
    } finally { db.close(); }
  } catch { return false; }
});

ipcMain.handle("sessions:fork", (_event, sessionId: string) => {
  try {
    const db = new DatabaseSync(SESSIONS_DB, { open: true });
    try {
      const orig = db.prepare("SELECT summary, workspace, mode FROM sessions WHERE id = ?").get(sessionId) as any;
      if (!orig) return null;
      const newId = crypto.randomUUID?.() || require("crypto").randomUUID();
      const now = Date.now();
      db.prepare("INSERT INTO sessions (id, summary, workspace, mode, started_at, ended_at) VALUES (?, ?, ?, ?, ?, null)").run(
        newId, orig.summary + " (fork)", orig.workspace, orig.mode, now
      );
      const turns = db.prepare("SELECT role, content FROM turns WHERE session_id = ? ORDER BY ts ASC").all(sessionId) as Array<{ role: string; content: string }>;
      const insert = db.prepare("INSERT INTO turns (id, session_id, ts, role, content) VALUES (?, ?, ?, ?, ?)");
      for (const t of turns) {
        insert.run(require("crypto").randomUUID(), newId, Date.now(), t.role, t.content);
      }
      return { id: newId, startedAt: now, summary: orig.summary + " (fork)", workspace: orig.workspace, mode: orig.mode };
    } finally { db.close(); }
  } catch (e) { console.error("fork error", e); return null; }
});

ipcMain.handle("sessions:delete", (_event, sessionId: string) => {
  try {
    const db = new DatabaseSync(SESSIONS_DB, { open: true });
    try {
      db.prepare("DELETE FROM turns WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
});

ipcMain.handle("sessions:create", (_event, summary: string, workspace: string, mode?: string) => {
  try {
    const db = new DatabaseSync(SESSIONS_DB, { open: true });
    try {
      // Migration: add mode column if it doesn't exist
      try { db.exec("ALTER TABLE sessions ADD COLUMN mode TEXT DEFAULT 'chat'"); } catch { /* already exists */ }

      const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = Date.now();
      const sessionMode = mode || "chat";
      db.prepare(
        "INSERT INTO sessions (id, started_at, workspace, summary, mode) VALUES (?, ?, ?, ?, ?)",
      ).run(id, startedAt, workspace, summary, sessionMode);
      return { id, startedAt, summary, workspace, mode: sessionMode };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
});

// ── Session files ─────────────────────────────────────────────────────

const SESSION_FILES_DIR = path.join(SHMAKK_DIR, "session-files");

ipcMain.handle("session-files:list", (_event, sessionId: string) => {
  const dir = resolveInsideRoot(SESSION_FILES_DIR, sessionId);
  if (!dir) return { files: [] };
  if (!fs.existsSync(dir)) return { files: [] };
  const files: Array<{ name: string; size: number }> = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile()) {
      try {
        const st = fs.statSync(path.join(dir, e.name));
        files.push({ name: e.name, size: st.size });
      } catch { /* skip */ }
    }
  }
  return { files };
});

ipcMain.handle("session-files:read", (_event, sessionId: string, fileName: string) => {
  const sessionDir = resolveInsideRoot(SESSION_FILES_DIR, sessionId);
  const filePath = sessionDir ? resolveInsideRoot(sessionDir, fileName) : null;
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
});

ipcMain.handle("session-files:saveCopy", (_event, sessionId: string, fileName: string, content: string) => {
  const dir = resolveInsideRoot(SESSION_FILES_DIR, sessionId);
  if (!dir) return { path: "" };
  fs.mkdirSync(dir, { recursive: true });
  const safeName = safeFileName(fileName);
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, content, "utf-8");
  return { path: filePath };
});

ipcMain.handle("session-files:promoteToArtifacts", (_event, sessionId: string, fileName: string) => {
  const sessionDir = resolveInsideRoot(SESSION_FILES_DIR, sessionId);
  const srcPath = sessionDir ? resolveInsideRoot(sessionDir, fileName) : null;
  if (!srcPath) return false;
  if (!fs.existsSync(srcPath)) return false;
  const artifactsDir = path.join(SHMAKK_DIR, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  const destPath = resolveInsideRoot(artifactsDir, safeFileName(fileName));
  if (!destPath) return false;
  fs.copyFileSync(srcPath, destPath);
  return true;
});

// Copy agent-tracked edits to session directory
function copyEditsToSession(sessionId: string) {
  try {
    const { getEdits } = require(path.join(SHMAKK_SRC, "edit-tracker"));
    const tracked = getEdits();
    if (!tracked || tracked.length === 0) return;
    const dir = path.join(SESSION_FILES_DIR, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    for (const e of tracked) {
      if (!e.newContent && !e.oldContent) continue;
      const content = e.newContent || e.oldContent || "";
      const safeName = path.basename(e.filePath).replace(/[<>:"/\\|?*]/g, "_") || "file.txt";
      const dest = path.join(dir, safeName);
      // Deduplicate: append number if name exists
      let finalPath = dest;
      let n = 1;
      while (fs.existsSync(finalPath)) {
        const ext = path.extname(safeName);
        const base = safeName.slice(0, -ext.length);
        finalPath = path.join(dir, `${base}-${n}${ext}`);
        n++;
      }
      fs.writeFileSync(finalPath, content, "utf-8");
    }
  } catch { /* edits tracking optional */ }
}

ipcMain.handle("sessions:addTurn", (_event, sessionId: string, role: string, content: string) => {
  try {
    const db = new DatabaseSync(SESSIONS_DB, { open: true });
    try {
      const ts = Date.now();
      db.prepare(
        "INSERT INTO turns (session_id, ts, role, content) VALUES (?, ?, ?, ?)",
      ).run(sessionId, ts, role, content);
      db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(ts, sessionId);
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
});

// ── Projects ──────────────────────────────────────────────────────────────

// Initialize projects tables
const initProjectsDb = () => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        rules TEXT DEFAULT '',
        settings_json TEXT DEFAULT '{}',
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS project_sessions (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        PRIMARY KEY (project_id, session_id)
      );
    `);
  } finally { db.close(); }
};
initProjectsDb();

ipcMain.handle("projects:list", () => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    const rows = db.prepare("SELECT id, name, description, rules, settings_json, created_at FROM projects ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string, name: r.name as string, description: r.description as string,
      rules: r.rules as string, settings: parseSettings(r.settings_json),
      createdAt: r.created_at as number,
    }));
  } finally { db.close(); }
});

ipcMain.handle("projects:create", (_e, name: string, description?: string) => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    const id = require("crypto").randomUUID();
    const createdAt = Date.now();
    const settings = defaultProjectSettings();
    db.prepare("INSERT INTO projects (id, name, description, settings_json, created_at) VALUES (?, ?, ?, ?, ?)").run(id, name, description || "", JSON.stringify(settings), createdAt);
    return { id, name, description: description || "", rules: "", settings, createdAt };
  } finally { db.close(); }
});

ipcMain.handle("projects:update", (_e, id: string, data: { name?: string; description?: string; rules?: string; settings?: Record<string, unknown> }) => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    if (data.name) db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(data.name, id);
    if (data.description !== undefined) db.prepare("UPDATE projects SET description = ? WHERE id = ?").run(data.description, id);
    if (data.rules !== undefined) db.prepare("UPDATE projects SET rules = ? WHERE id = ?").run(data.rules, id);
    if (data.settings) {
      const row = db.prepare("SELECT settings_json FROM projects WHERE id = ?").get(id) as { settings_json?: string } | undefined;
      const merged = defaultProjectSettings({ ...parseSettings(row?.settings_json), ...data.settings });
      db.prepare("UPDATE projects SET settings_json = ? WHERE id = ?").run(JSON.stringify(merged), id);
    }
    return true;
  } finally { db.close(); }
});

ipcMain.handle("projects:delete", (_e, id: string) => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    db.prepare("DELETE FROM project_sessions WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return true;
  } finally { db.close(); }
});

ipcMain.handle("projects:addSession", (_e, projectId: string, sessionId: string) => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    db.prepare("INSERT OR IGNORE INTO project_sessions (project_id, session_id) VALUES (?, ?)").run(projectId, sessionId);
    return true;
  } finally { db.close(); }
});

ipcMain.handle("projects:removeSession", (_e, projectId: string, sessionId: string) => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    db.prepare("DELETE FROM project_sessions WHERE project_id = ? AND session_id = ?").run(projectId, sessionId);
    return true;
  } finally { db.close(); }
});

ipcMain.handle("projects:getSessions", (_e, projectId: string) => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    const rows = db.prepare(`
      SELECT s.id, s.started_at, s.ended_at, s.workspace, s.summary, s.mode,
        (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.id) as turn_count
      FROM sessions s JOIN project_sessions ps ON s.id = ps.session_id
      WHERE ps.project_id = ? ORDER BY s.started_at DESC
    `).all(projectId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id, startedAt: r.started_at, endedAt: r.ended_at,
      workspace: r.workspace, summary: r.summary, turnCount: r.turn_count as number,
      mode: r.mode as string,
    }));
  } finally { db.close(); }
});

ipcMain.handle("projects:getForSession", (_e, sessionId: string) => {
  const db = new DatabaseSync(SESSIONS_DB, { open: true });
  try {
    const rows = db.prepare(`
      SELECT p.id, p.name, p.description, p.rules, p.settings_json, p.created_at
      FROM projects p JOIN project_sessions ps ON p.id = ps.project_id
      WHERE ps.session_id = ? ORDER BY p.created_at DESC
    `).all(sessionId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: r.description as string,
      rules: r.rules as string,
      settings: parseSettings(r.settings_json),
      createdAt: r.created_at as number,
    }));
  } finally { db.close(); }
});

// ── Skills ────────────────────────────────────────────────────────────────

ipcMain.handle("skills:list", () => {
  const registry = readJsonSafe(SKILLS_REGISTRY_JSON);
  const regSkills: Record<string, Record<string, unknown>> =
    registry && registry.skills && typeof registry.skills === "object"
      ? (registry.skills as Record<string, Record<string, unknown>>)
      : {};
  const seen = new Set<string>();
  const skills: Array<Record<string, unknown>> = [];

  const addSkill = (skillName: string, filePath: string) => {
    if (seen.has(skillName)) return;
    seen.add(skillName);
    const regEntry = regSkills[skillName];
    const meta = readSkillMetadata(filePath, skillName);
    skills.push({
      id: skillName,
      name: meta.name,
      version: regEntry?.version || "1",
      author: (regEntry?.author as string) || "shmakk",
      description: (regEntry?.description as string) || meta.description,
      category: (regEntry?.category as string) || guessCategory(`${skillName} ${meta.description}`),
      installed: true,
      enabled: regEntry ? regEntry.active === true : false,
      source: regEntry?.source || filePath,
    });
  };

  if (fs.existsSync(SKILLS_DIR)) {
    const walkSkills = (dir: string, prefix = "") => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFile = path.join(dir, entry.name, "SKILL.md");
          if (fs.existsSync(skillFile)) {
            addSkill(prefix + entry.name, skillFile);
          }
          walkSkills(path.join(dir, entry.name), prefix + entry.name + "/");
        } else if (entry.name.endsWith(".md")) {
          const skillName = prefix + entry.name.replace(/\.md$/, "");
          if (entry.name === "SKILL.md" && prefix) continue;
          addSkill(skillName, path.join(dir, entry.name));
        }
      }
    };
    walkSkills(SKILLS_DIR);
  }

  for (const [name, entry] of Object.entries(regSkills)) {
    if (!seen.has(name)) {
      skills.push({
        id: name,
        name: name,
        version: entry.version || "unknown",
        author: "shmakk",
        description: "",
        category: guessCategory(name),
        installed: true,
        enabled: entry.active === true,
        source: entry.source || "",
      });
    }
  }

  return skills;
});

function readSkillMetadata(filePath: string, fallbackName: string): { name: string; description: string } {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const heading = lines.find((line) => line.startsWith("# "));
    const description = lines.find((line) => !line.startsWith("#") && !line.startsWith("---")) || "";
    return {
      name: heading ? heading.replace(/^#\s+/, "").trim() : fallbackName,
      description: description.slice(0, 220),
    };
  } catch {
    return { name: fallbackName, description: "" };
  }
}

ipcMain.handle("skills:read", (_event, skillId: string) => {
  const registry = readJsonSafe(SKILLS_REGISTRY_JSON);
  if (registry && registry.skills && typeof registry.skills === "object") {
    const reg = registry.skills as Record<string, Record<string, unknown>>;
    const entry = reg[skillId];
    if (entry && entry.localPath && typeof entry.localPath === "string") {
      try {
        return fs.readFileSync(entry.localPath, "utf-8");
      } catch { /* fall through */ }
    }
  }

  const skillPath = path.join(SKILLS_DIR, `${skillId}.md`);
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, "utf-8");
  }
  return null;
});

function guessCategory(name: string): string {
  const cats: Record<string, string[]> = {
    "Development": ["code", "dev", "test", "git", "lint", "refactor"],
    "Design": ["ui", "design", "css", "style", "ux", "frontend"],
    "System": ["linux", "arch", "debian", "fedora", "centos", "sys", "tmux", "window"],
    "Backend": ["db", "api", "server", "backend", "sql"],
    "DevOps": ["deploy", "docker", "ci", "cd", "pipeline"],
    "Documentation": ["docs", "readme", "doc"],
    "Security": ["security", "auth", "audit", "compliance"],
    "Productivity": ["task", "plan", "calendar", "reminder", "email", "notes"],
  };
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(cats)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return "General";
}

// ── Skills: toggle ────────────────────────────────────────────────────────

ipcMain.handle("skills:toggle", (_event, skillId: string, enabled: boolean) => {
  const registry = readJsonSafe(SKILLS_REGISTRY_JSON) || {};
  if (!registry.skills || typeof registry.skills !== "object") {
    registry.skills = {};
  }

  const skills = registry.skills as Record<string, Record<string, unknown>>;
  if (!skills[skillId]) {
    skills[skillId] = {
      active: enabled,
      source: findSkillSource(skillId) || "",
      version: "1",
    };
  } else {
    skills[skillId].active = enabled;
  }
  return writeJsonSafe(SKILLS_REGISTRY_JSON, registry);
});

function findSkillSource(skillId: string): string | null {
  const direct = path.join(SKILLS_DIR, `${skillId}.md`);
  const nested = path.join(SKILLS_DIR, skillId, "SKILL.md");
  if (fs.existsSync(nested)) return nested;
  if (fs.existsSync(direct)) return direct;
  return null;
}

// ── Rules ─────────────────────────────────────────────────────────────────

ipcMain.handle("rules:get", () => {
  if (!fs.existsSync(RULES_MD)) return "";
  return fs.readFileSync(RULES_MD, "utf-8");
});

ipcMain.handle("rules:set", (_event, content: string) => {
  fs.writeFileSync(RULES_MD, content, "utf-8");
  return true;
});

// ── Config / Endpoints ────────────────────────────────────────────────────

ipcMain.handle("config:status", () => {
  const endpoints = readJsonSafe(ENDPOINTS_JSON);
  const def = endpoints && typeof endpoints.default === "string" ? endpoints.default : null;
  const providers = endpoints && typeof endpoints === "object"
    ? Object.entries(endpoints as Record<string, unknown>)
        .filter(([k]) => k !== "default")
        .map(([k, v]) => ({
          id: k,
          name: k,
          url: (v as Record<string, unknown>)?.base_url || "",
          type: detectProviderType((v as Record<string, unknown>)?.base_url as string || ""),
        }))
    : [];

  if (def && endpoints) {
    const defData = (endpoints as Record<string, unknown>)[def] as Record<string, unknown> | undefined;
    return {
      endpoint: defData?.base_url || "",
      model: defData?.model || "",
      connected: true,
      provider: def,
      providers,
      defaultProvider: def,
    };
  }

  return {
    endpoint: "http://localhost:3917",
    model: "",
    connected: false,
    provider: null,
    providers,
    defaultProvider: null,
  };
});

ipcMain.handle("settings:getEndpoints", () => {
  const endpoints = readJsonSafe(ENDPOINTS_JSON);
  if (!endpoints) return [];
  return Object.entries(endpoints as Record<string, unknown>)
    .filter(([k]) => k !== "default")
    .map(([k, v]) => ({
      id: k,
      name: k,
      url: (v as Record<string, unknown>)?.base_url || "",
      type: detectProviderType((v as Record<string, unknown>)?.base_url as string || ""),
    }));
});

ipcMain.handle("settings:addEndpoint", (_event, id: string, name: string, url: string, apiKey: string) => {
  const endpoints = readJsonSafe(ENDPOINTS_JSON) || {};
  (endpoints as Record<string, unknown>)[id] = {
    base_url: url,
    api_key: apiKey,
    model: "",
  };
  writeJsonSafe(ENDPOINTS_JSON, endpoints);
  return true;
});

ipcMain.handle("settings:deleteEndpoint", (_event, id: string) => {
  const endpoints = readJsonSafe(ENDPOINTS_JSON);
  if (!endpoints || !(endpoints as Record<string, unknown>)[id]) return false;
  delete (endpoints as Record<string, unknown>)[id];
  if ((endpoints as Record<string, unknown>).default === id) {
    delete (endpoints as Record<string, unknown>).default;
  }
  writeJsonSafe(ENDPOINTS_JSON, endpoints);
  return true;
});

function detectProviderType(url: string): string {
  if (url.includes("anthropic")) return "anthropic";
  if (url.includes("openai")) return "openai";
  if (url.includes("deepseek")) return "openai";
  return "openai";
}

// ── Chat / AI — Bridge to shmakk agent ────────────────────────────────────

function seedShmakkEnv() {
  const endpoints = readJsonSafe(ENDPOINTS_JSON);
  if (!endpoints) return;

  const defKey = typeof endpoints.default === "string" ? endpoints.default : null;
  const cfg = defKey
    ? (endpoints as Record<string, unknown>)[defKey] as Record<string, unknown> | undefined
    : null;

  if (cfg) {
    if (cfg.base_url && !process.env.SHMAKK_BASE_URL)
      process.env.SHMAKK_BASE_URL = cfg.base_url as string;
    if (cfg.api_key && !process.env.SHMAKK_API_KEY)
      process.env.SHMAKK_API_KEY = cfg.api_key as string;
    if (cfg.model && !process.env.SHMAKK_MODEL)
      process.env.SHMAKK_MODEL = cfg.model as string;
  }
}

seedShmakkEnv();

const SHMAKK_BASE_DIR = resolveShmakkBaseDir();
const SHMAKK_SRC = path.join(SHMAKK_BASE_DIR, "src");
let runAgent: Function | null = null;
let clearTaskJournal: Function | null = null;
let isConfigured: (() => boolean) | null = null;

try {
  // Add shmakk's node_modules to the resolution path so it finds 'openai'
  const shmakkNodeModules = path.join(SHMAKK_BASE_DIR, "node_modules");
  if (fs.existsSync(shmakkNodeModules)) {
    (module.paths as string[]).unshift(shmakkNodeModules);
  }

  const agent = require(path.join(SHMAKK_SRC, "agent"));
  runAgent = agent.runAgent;
  clearTaskJournal = agent.clearTaskJournal;
  console.log("[shmakk-desktop] Loaded shmakk agent bridge");
} catch (e) {
  console.error("[shmakk-desktop] Failed to load shmakk agent:", e);
}

try {
  const llm = require(path.join(SHMAKK_SRC, "llm"));
  isConfigured = llm.isConfigured;
} catch {
  isConfigured = () => !!(process.env.SHMAKK_BASE_URL);
}

// ── Voice bridge ─────────────────────────────────────────────────────

let voiceTTS: {
  speakStreaming: (text: string, opts?: { voice?: string; speed?: number }) => Promise<void>;
  stopSpeaking: () => void;
  listVoices: () => Promise<Array<{ id: string; name: string; language: string; gender: string }>>;
  isCached: () => boolean;
  generate: (text: string, opts?: Record<string, unknown>) => Promise<{ audioPath: string; voice: string }>;
  playAudio: (audioPath: string) => Promise<boolean>;
} | null = null;

let voiceSTT: {
  transcribe: (audioPath: string, opts?: Record<string, unknown>) => Promise<string>;
  isCached: () => boolean;
} | null = null;

let voiceInput: {
  recordAndTranscribe: (opts?: Record<string, unknown>) => Promise<string>;
  detectRecorder: () => { cmd: string; ext: string; label: string; vad: boolean } | null;
  isAvailable: () => boolean;
  testMicrophone: () => Promise<{ ok: boolean; recorder: string | null; fileSize: number | null; error: string | null }>;
  preloadSTT: () => void;
} | null = null;

try { voiceTTS = require(path.join(SHMAKK_SRC, "services", "tts")); } catch (e) { console.error("[shmakk-desktop] Failed to load TTS:", e); }
try { voiceSTT = require(path.join(SHMAKK_SRC, "services", "stt")); } catch (e) { console.error("[shmakk-desktop] Failed to load STT:", e); }
try { voiceInput = require(path.join(SHMAKK_SRC, "services", "voice")); } catch (e) { console.error("[shmakk-desktop] Failed to load voice input:", e); }

// ── Team bridge (for Cowork multi-agent) ────────────────────────────

let runTeam: Function | null = null;
let loadWorkflows: Function | null = null;

try {
  const team = require(path.join(SHMAKK_SRC, "team"));
  runTeam = team.runTeam;
} catch (e) { console.error("[shmakk-desktop] Failed to load team:", e); }

try {
  const wf = require(path.join(SHMAKK_SRC, "workflows"));
  loadWorkflows = wf.loadWorkflows;
} catch { /* optional */ }

// Chat state: one session at a time (no tab support yet)
let chatAbortController: AbortController | null = null;
const toolConfirmResolvers = new Map<string, { resolve: (approved: boolean) => void }>();
let conversationHistory: Array<{ role: string; content: string }> = [];

ipcMain.handle("chat:send", async (_event, providerId: string, model: string, messages: Array<{ role: string; content: string }>, sessionId?: string) => {
  // Apply endpoint override
  const endpoints = readJsonSafe(ENDPOINTS_JSON);
  if (endpoints && providerId) {
    const cfg = (endpoints as Record<string, unknown>)[providerId] as Record<string, unknown> | undefined;
    if (cfg) {
      if (cfg.base_url) process.env.SHMAKK_BASE_URL = cfg.base_url as string;
      if (cfg.api_key) process.env.SHMAKK_API_KEY = cfg.api_key as string;
      if (cfg.model) process.env.SHMAKK_MODEL = cfg.model as string;
    }
  }
  if (model) {
    process.env.SHMAKK_MODEL = model;
  }

  if (!isConfigured || !isConfigured()) {
    return { error: "No AI provider configured. Add an endpoint in Settings." };
  }

  if (!runAgent) {
    // Fallback: use raw HTTP fetch when agent isn't available
    const baseUrl = process.env.SHMAKK_BASE_URL;
    const apiKey = process.env.SHMAKK_API_KEY;
    const actualModel = model || process.env.SHMAKK_MODEL || "default";

    if (!baseUrl || !apiKey) {
      return { error: "Missing API key or endpoint URL" };
    }

    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: actualModel,
          messages: messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
          max_tokens: 4096,
          stream: true,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { error: `API error ${resp.status}: ${errText}` };
      }

      // Stream the response
      let fullContent = "";
      const reader = resp.body?.getReader();
      if (!reader) {
        const data = await resp.json();
        return { content: data.choices?.[0]?.message?.content || "" };
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              sendToRenderer("chat:token", { text: delta });
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      }

      return { content: fullContent };
    } catch (err) {
      return { error: `Request failed: ${String(err)}` };
    }
  }

  // ── Use shmakk agent ──────────────────────────────────────────────────

  if (chatAbortController) chatAbortController.abort();
  chatAbortController = new AbortController();

  const userMessage = messages.length > 0 ? messages[messages.length - 1].content : "";
  const history = messages.slice(0, -1);

  const workspaceRoots = [workspaceRoot || process.cwd()];

  try {
    clearTaskJournal?.(workspaceRoots[0]);
  } catch { /* ok if not available */ }

  // Buffer for accumulating partial writes from agent
  let writeBuffer = "";

  try {
    const updatedHistory = await runAgent({
      input: userMessage,
      roots: workspaceRoots,
      glossary: null,
      confirmTool: async ({ name, args, safety, description }: {
        name: string;
        args: unknown;
        safety: string;
        description: string;
      }) => {
        if (chatAbortController?.signal.aborted) return false;

        const toolId = `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

        // Auto-approve safe tools — only prompt for uncertain/unsafe ones
        if (safety === "safe") {
          sendToRenderer("chat:toolAutoApproved", {
            tool: {
              id: toolId,
              name,
              args: typeof args === "string" ? args : JSON.stringify(args),
              safety,
              description,
            },
          });
          return true;
        }

        // Prompt the user for uncertain/unsafe tools
        sendToRenderer("chat:toolConfirm", {
          tool: {
            id: toolId,
            name,
            args: typeof args === "string" ? args : JSON.stringify(args),
            safety,
            description,
          },
        });

        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            toolConfirmResolvers.delete(toolId);
            resolve(false);
          }, 60000);

          toolConfirmResolvers.set(toolId, {
            resolve: (approved: boolean) => {
              clearTimeout(timeout);
              toolConfirmResolvers.delete(toolId);
              // Don't send auto-approved for manual approvals
              resolve(approved);
            },
          });
        });
      },
      write: (text: string) => {
        // Strip ANSI escape codes
        const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
        if (!clean) return;

        writeBuffer += clean;
        const lines = writeBuffer.split("\n");
        writeBuffer = lines.pop() || "";

        const outputLines: string[] = [];
        for (const line of lines) {
          const real = line.includes("\r") ? line.slice(line.lastIndexOf("\r") + 1) : line;
          const trimmed = real.trim();
          if (trimmed && !/^[\s⠀-⣿]+$/.test(trimmed)) {
            outputLines.push(trimmed);
          }
        }

        if (outputLines.length > 0) {
          sendToRenderer("chat:token", { text: outputLines.join("\n") + "\n" });
        }
      },
      signal: chatAbortController.signal,
      history,
      profile: "balanced",
      colors: false,
      voiceMode: false,
      specialistHint: null,
      mcpManager: null,
    });

    conversationHistory = Array.isArray(updatedHistory)
      ? updatedHistory.slice(-30)
      : history;

    const lastMsg = conversationHistory[conversationHistory.length - 1];
    const reply = lastMsg?.role === "assistant" ? (lastMsg.content || "") : "";

    // Copy agent-created files to session directory
    if (sessionId) copyEditsToSession(sessionId);

    return { ok: true, reply };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { error: "cancelled" };
    }
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    chatAbortController = null;
    for (const [, entry] of toolConfirmResolvers) {
      entry.resolve(false);
    }
    toolConfirmResolvers.clear();
  }
});

ipcMain.on("chat:cancel", () => {
  if (chatAbortController) chatAbortController.abort();
  for (const [, entry] of toolConfirmResolvers) {
    entry.resolve(false);
  }
  toolConfirmResolvers.clear();
});

ipcMain.handle("chat:respondToolConfirm", (_event, toolId: string, approved: boolean) => {
  const entry = toolConfirmResolvers.get(toolId);
  if (entry) {
    entry.resolve(approved);
    return true;
  }
  return false;
});

ipcMain.handle("chat:setProfile", (_event, profile: string) => {
  const endpoints = readJsonSafe(ENDPOINTS_JSON) || {};
  (endpoints as Record<string, unknown>).default = profile;
  writeJsonSafe(ENDPOINTS_JSON, endpoints);
});

ipcMain.handle("chat:getProfile", () => {
  const endpoints = readJsonSafe(ENDPOINTS_JSON);
  return endpoints && typeof endpoints.default === "string" ? endpoints.default : "balanced";
});

// ── Plugins ───────────────────────────────────────────────────────────────

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function deleteDirRecursive(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      deleteDirRecursive(full);
    } else {
      fs.unlinkSync(full);
    }
  }
  fs.rmdirSync(dir);
}

interface PluginManifest {
  name: string;
  description?: string;
  version?: string;
  author?: { name?: string; email?: string };
}

function findPluginManifest(pluginDir: string): string | null {
  const newPath = path.join(pluginDir, ".shmakk-plugin", "plugin.json");
  if (fs.existsSync(newPath)) return newPath;
  const oldPath = path.join(pluginDir, ".claude-plugin", "plugin.json");
  if (fs.existsSync(oldPath)) return oldPath;
  return null;
}

function scanPluginSkills(pluginDir: string): string[] {
  const skills: string[] = [];
  const skillsSrcDir = path.join(pluginDir, "skills");
  if (!fs.existsSync(skillsSrcDir)) return skills;
  const entries = fs.readdirSync(skillsSrcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(skillsSrcDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    let skillName = entry.name;
    try {
      const raw = fs.readFileSync(skillMd, "utf-8");
      const fmMatch = /^---\n([\s\S]*?)\n---/.exec(raw);
      if (fmMatch) {
        const nameMatch = /^name\s*:\s*(.+)$/m.exec(fmMatch[1]);
        if (nameMatch) skillName = nameMatch[1].trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
      }
      const skillDestDir = path.join(SKILLS_DIR, skillName);
      if (!fs.existsSync(skillDestDir)) {
        fs.mkdirSync(skillDestDir, { recursive: true });
        fs.copyFileSync(skillMd, path.join(skillDestDir, "SKILL.md"));
      }
      skills.push(skillName);
    } catch { /* skip broken skill */ }
  }
  return skills;
}

function registerPluginSkills(skillNames: string[], manifest: PluginManifest, pluginName: string) {
  const registry = readJsonSafe(SKILLS_REGISTRY_JSON) || { skills: {} };
  const skills = (registry.skills || {}) as Record<string, Record<string, unknown>>;
  for (const name of skillNames) {
    if (!skills[name]) {
      skills[name] = { name, active: true, version: manifest.version || "1", source: "plugin", plugin: pluginName };
    }
  }
  registry.skills = skills;
  registry.updatedAt = new Date().toISOString();
  writeJsonSafe(SKILLS_REGISTRY_JSON, registry);
}

function buildPluginResult(name: string, manifest: PluginManifest, dir: string, skillNames: string[]): InstalledPlugin {
  const commands: string[] = [];
  const cmdDir = path.join(dir, "commands");
  if (fs.existsSync(cmdDir)) commands.push(...fs.readdirSync(cmdDir).filter((f: string) => f.endsWith(".md")).map((f: string) => f.replace(/\.md$/, "")));
  const agents: string[] = [];
  const agDir = path.join(dir, "agents");
  if (fs.existsSync(agDir)) agents.push(...fs.readdirSync(agDir).filter((f: string) => f.endsWith(".md")).map((f: string) => f.replace(/\.md$/, "")));
  return {
    name,
    description: manifest.description || "",
    version: manifest.version || "1.0.0",
    author: manifest.author?.name || "Unknown",
    installPath: dir,
    installedAt: new Date().toISOString(),
    skills: skillNames,
    commands,
    agents,
  };
}

interface InstalledPlugin {
  name: string;
  description: string;
  version: string;
  author: string;
  installPath: string;
  installedAt: string;
  skills: string[];
  commands: string[];
  agents: string[];
}

ipcMain.handle("plugins:installFromFolder", async () => {
  if (!mainWindow) return { error: "No window" };

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select plugin folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { error: "Cancelled" };
  }

  const srcDir = result.filePaths[0];
  const manifestPath = findPluginManifest(srcDir);

  if (!manifestPath) {
    return { error: "Invalid plugin: missing .shmakk-plugin/plugin.json (or .claude-plugin/plugin.json)" };
  }

  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return { error: "Invalid plugin: failed to parse plugin.json" };
  }

  if (!manifest.name || typeof manifest.name !== "string") {
    return { error: "Invalid plugin: plugin.json missing required 'name' field" };
  }

  const pluginName = manifest.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const destDir = path.join(PLUGINS_DIR, pluginName);

  if (fs.existsSync(destDir)) {
    deleteDirRecursive(destDir);
  }

  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  copyDirRecursive(srcDir, destDir);

  const installedSkills: string[] = [];
  const skillsSrcDir = path.join(destDir, "skills");
  if (fs.existsSync(skillsSrcDir)) {
    const skillEntries = fs.readdirSync(skillsSrcDir, { withFileTypes: true });
    for (const entry of skillEntries) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsSrcDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;

      try {
        const raw = fs.readFileSync(skillMd, "utf-8");
        const fmMatch = /^---\n([\s\S]*?)\n---/.exec(raw);
        let skillName = entry.name;
        if (fmMatch) {
          const nameMatch = /^name\s*:\s*(.+)$/m.exec(fmMatch[1]);
          if (nameMatch) skillName = nameMatch[1].trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
        }

        const skillDestDir = path.join(SKILLS_DIR, skillName);
        if (!fs.existsSync(skillDestDir)) {
          fs.mkdirSync(skillDestDir, { recursive: true });
          fs.copyFileSync(skillMd, path.join(skillDestDir, "SKILL.md"));
        }

        installedSkills.push(skillName);
      } catch {
        // Skip broken skill
      }
    }
  }

  const installedCommands: string[] = [];
  const commandsDir = path.join(destDir, "commands");
  if (fs.existsSync(commandsDir)) {
    const cmdEntries = fs.readdirSync(commandsDir);
    for (const entry of cmdEntries) {
      if (entry.endsWith(".md")) {
        installedCommands.push(entry.replace(/\.md$/, ""));
      }
    }
  }

  const installedAgents: string[] = [];
  const agentsDir = path.join(destDir, "agents");
  if (fs.existsSync(agentsDir)) {
    const agentEntries = fs.readdirSync(agentsDir);
    for (const entry of agentEntries) {
      if (entry.endsWith(".md")) {
        installedAgents.push(entry.replace(/\.md$/, ""));
      }
    }
  }

  const registry = readJsonSafe(SKILLS_REGISTRY_JSON) || { skills: {} };
  const skills = (registry.skills || {}) as Record<string, Record<string, unknown>>;
  for (const skillName of installedSkills) {
    if (!skills[skillName]) {
      skills[skillName] = {
        name: skillName,
        active: true,
        version: manifest.version || "1",
        source: "plugin",
        plugin: pluginName,
      };
    }
  }
  registry.skills = skills;
  registry.updatedAt = new Date().toISOString();
  writeJsonSafe(SKILLS_REGISTRY_JSON, registry);

  const installed: InstalledPlugin = {
    name: pluginName,
    description: manifest.description || "",
    version: manifest.version || "1.0.0",
    author: manifest.author?.name || manifest.author?.email || "Unknown",
    installPath: destDir,
    installedAt: new Date().toISOString(),
    skills: installedSkills,
    commands: installedCommands,
    agents: installedAgents,
  };

  return { installed };
});

ipcMain.handle("plugins:list", () => {
  if (!fs.existsSync(PLUGINS_DIR)) return [];

  const plugins: InstalledPlugin[] = [];
  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = findPluginManifest(path.join(PLUGINS_DIR, entry.name));
    if (!manifestPath) continue;

    try {
      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const pluginDir = path.join(PLUGINS_DIR, entry.name);

      const skills: string[] = [];
      const skillsDir = path.join(pluginDir, "skills");
      if (fs.existsSync(skillsDir)) {
        const sEntries = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const s of sEntries) {
          if (s.isDirectory() && fs.existsSync(path.join(skillsDir, s.name, "SKILL.md"))) {
            skills.push(s.name);
          }
        }
      }

      const commands: string[] = [];
      const commandsDir = path.join(pluginDir, "commands");
      if (fs.existsSync(commandsDir)) {
        commands.push(...fs.readdirSync(commandsDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")));
      }

      const agents: string[] = [];
      const agentsDir = path.join(pluginDir, "agents");
      if (fs.existsSync(agentsDir)) {
        agents.push(...fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")));
      }

      plugins.push({
        name: entry.name,
        description: manifest.description || "",
        version: manifest.version || "1.0.0",
        author: manifest.author?.name || "Unknown",
        installPath: pluginDir,
        installedAt: "",
        skills,
        commands,
        agents,
      });
    } catch {
      // Skip broken plugins
    }
  }

  return plugins;
});

ipcMain.handle("plugins:uninstall", (_event, pluginName: string) => {
  const safeName = pluginName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const pluginDir = path.join(PLUGINS_DIR, safeName);

  if (!fs.existsSync(pluginDir)) return false;

  const registry = readJsonSafe(SKILLS_REGISTRY_JSON);
  if (registry?.skills) {
    const skills = registry.skills as Record<string, Record<string, unknown>>;
    for (const [skillName, skillData] of Object.entries(skills)) {
      if (skillData.plugin === safeName) {
        delete skills[skillName];
        const skillDest = path.join(SKILLS_DIR, skillName);
        if (fs.existsSync(skillDest)) {
          deleteDirRecursive(skillDest);
        }
      }
    }
    writeJsonSafe(SKILLS_REGISTRY_JSON, registry);
  }

  deleteDirRecursive(pluginDir);
  return true;
});

// ── Voice IPC ─────────────────────────────────────────────────────────

ipcMain.handle("voice:listVoices", async () => {
  if (!voiceTTS) return { error: "TTS not available" };
  try {
    const voices = await voiceTTS.listVoices();
    return { voices };
  } catch (e) { return { error: String(e) }; }
});

ipcMain.handle("voice:speak", async (_event, text: string, opts?: { voice?: string; speed?: number }) => {
  if (!voiceTTS) return { error: "TTS not available" };
  try {
    await voiceTTS.speakStreaming(text, opts);
    return { ok: true };
  } catch (e) { return { error: String(e) }; }
});

ipcMain.handle("voice:stopSpeaking", () => {
  voiceTTS?.stopSpeaking();
  return true;
});

ipcMain.handle("voice:transcribe", async (_event, audioPath: string) => {
  if (!voiceSTT) return { error: "STT not available" };
  try {
    const text = await voiceSTT.transcribe(audioPath);
    return { text };
  } catch (e) { return { error: String(e) }; }
});

ipcMain.handle("voice:recordAndTranscribe", async (_event, opts?: { language?: string; maxDurationSec?: number }) => {
  if (!voiceInput) return { error: "Voice input not available" };
  try {
    const text = await voiceInput.recordAndTranscribe(opts);
    return { text };
  } catch (e) { return { error: String(e) }; }
});

ipcMain.handle("voice:checkAvailability", () => {
  return {
    ttsAvailable: !!voiceTTS,
    sttAvailable: !!voiceSTT,
    microphoneAvailable: voiceInput?.isAvailable() ?? false,
    recorder: voiceInput?.detectRecorder()?.label ?? null,
  };
});

ipcMain.handle("voice:testMicrophone", async () => {
  if (!voiceInput) return { ok: false, error: "Voice input not loaded" };
  return voiceInput.testMicrophone();
});

ipcMain.handle("voice:preloadSTT", () => {
  voiceInput?.preloadSTT();
  return true;
});

ipcMain.handle("voice:isTTSCached", () => {
  return { cached: voiceTTS?.isCached() ?? false };
});

ipcMain.handle("voice:isSTTCached", () => {
  return { cached: voiceSTT?.isCached() ?? false };
});

// ── STS (speech-to-speech) loop ─────────────────────────────────────

let stsActive = false;
let stsTtsBreak = false; // set when user interrupts TTS

ipcMain.handle("voice:startSTS", async () => {
  if (!voiceInput || !voiceTTS) {
    return { error: "Voice stack not available" };
  }

  stsActive = true;
  stsTtsBreak = false;

  // Run the STS loop asynchronously
  (async () => {
    sendToRenderer("chat:stsState", { state: "listening" });

    while (stsActive) {
      try {
        // Kill any active TTS from previous turn
        voiceTTS!.stopSpeaking();

        // Record with VAD — blocks until silence detected
        sendToRenderer("chat:stsState", { state: "listening" });
        const text = await voiceInput!.recordAndTranscribe({
          language: "english",
          maxDurationSec: 30,
        });

        if (!stsActive) break;

        const trimmed = text.trim();
        if (!trimmed) continue;

        // Check stop words — end the session
        if (/^(stop|quiet|shut up|silence|enough|cancel|goodbye|bye)$/i.test(trimmed)) {
          stsActive = false;
          voiceTTS!.stopSpeaking();
          sendToRenderer("chat:stsState", { state: "off" });
          sendToRenderer("chat:stsTranscription", { text: trimmed });
          break;
        }

        // Send transcription to renderer for display + agent processing
        sendToRenderer("chat:stsTranscription", { text: trimmed });
        sendToRenderer("chat:stsState", { state: "thinking" });

        // Run the agent — use the same agent call pattern as chat:send
        if (runAgent) {
          chatAbortController = new AbortController();

          let agentReply = "";
          let ttsBuffer = "";

          try {
            clearTaskJournal?.(workspaceRoot || process.cwd());

            const updatedHistory = await runAgent({
              input: trimmed,
              roots: [workspaceRoot || process.cwd()],
              glossary: null,
              confirmTool: async ({ name, args, safety, description }: {
                name: string; args: unknown; safety: string; description: string;
              }) => {
                if (chatAbortController?.signal.aborted || !stsActive) return false;
                // In STS mode, auto-approve safe operations, deny dangerous ones
                if (safety === "safe" || safety === "uncertain") {
                  sendToRenderer("chat:toolAutoApproved", {
                    tool: { id: `tool-${Date.now()}`, name, args, safety, description },
                  });
                  return true;
                }
                return false;
              },
              write: (raw: string) => {
                if (!stsActive) return;
                const clean = raw.replace(/\x1b\[[0-9;]*m/g, "");
                if (!clean) return;

                // Stream tokens to renderer
                sendToRenderer("chat:token", { text: clean });

                // Buffer for TTS — accumulate into sentences
                ttsBuffer += clean;
                if (voiceTTS && stsActive && !stsTtsBreak) {
                  // Check for sentence boundaries
                  const match = /^([\s\S]*?[.!?]\s+)/.exec(ttsBuffer);
                  if (match) {
                    const sentence = match[1];
                    ttsBuffer = ttsBuffer.slice(sentence.length);
                    // Fire-and-forget speak — don't block agent streaming
                    voiceTTS.speakStreaming(sentence.trim(), {
                      voice: "af_heart",
                      speed: 1.5,
                    }).catch(() => {});
                  }
                }
              },
              signal: chatAbortController.signal,
              history: conversationHistory.slice(-10),
              profile: "balanced",
              colors: false,
              voiceMode: true,
              specialistHint: null,
              mcpManager: null,
            });

            conversationHistory = Array.isArray(updatedHistory)
              ? updatedHistory.slice(-30)
              : conversationHistory;

            const lastMsg = conversationHistory[conversationHistory.length - 1];
            agentReply = lastMsg?.role === "assistant" ? (lastMsg.content || "") : "";

            // Speak any remaining buffered text
            if (ttsBuffer.trim() && voiceTTS && stsActive && !stsTtsBreak) {
              await voiceTTS.speakStreaming(ttsBuffer.trim(), {
                voice: "af_heart",
                speed: 1.5,
              });
            }

            // Store the turn in conversation history
            conversationHistory.push({ role: "user", content: trimmed });
            if (agentReply) {
              conversationHistory.push({ role: "assistant", content: agentReply });
            }
          } catch (err: unknown) {
            if (err instanceof Error && err.name === "AbortError") {
              // User interrupted — that's fine, loop back
            } else {
              console.error("[shmakk-desktop] STS agent error:", err);
            }
            if (ttsBuffer.trim() && voiceTTS && stsActive && !stsTtsBreak) {
              try {
                await voiceTTS.speakStreaming(ttsBuffer.trim(), {
                  voice: "af_heart",
                  speed: 1.5,
                });
              } catch { /* ignore */ }
            }
          } finally {
            chatAbortController = null;
            stsTtsBreak = false;
          }
        }
      } catch (err: unknown) {
        console.error("[shmakk-desktop] STS loop error:", err);
        // If recording fails (e.g., mic disconnected), wait a bit then retry
        if (stsActive) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    // Cleanup
    voiceTTS?.stopSpeaking();
    sendToRenderer("chat:stsState", { state: "off" });
  })();

  return { ok: true };
});

ipcMain.on("voice:stopSTS", () => {
  stsActive = false;
  stsTtsBreak = true;
  chatAbortController?.abort();
  voiceTTS?.stopSpeaking();
  sendToRenderer("chat:stsState", { state: "off" });
});

ipcMain.on("voice:interruptSTS", () => {
  // User started speaking — interrupt current agent + TTS
  stsTtsBreak = true;
  chatAbortController?.abort();
  voiceTTS?.stopSpeaking();
  sendToRenderer("chat:stsState", { state: "listening" });
});

// ── Cowork ─────────────────────────────────────────────────────────────

const coworkRuns = new Map<string, {
  abortController: AbortController;
  history: Array<{ role: string; content: string }>;
  edits: Array<{ path: string; status: string; content: string }>;
}>();

ipcMain.handle("cowork:execute", async (_event, opts: {
  runId: string;
  prompt: string;
  profile?: string;
  autoApprove?: boolean;
  skills?: string[];
  topology?: string;
}) => {
  if (!runAgent) return { error: "Agent not available" };

  const { runId, prompt, profile = "balanced", autoApprove = false, skills } = opts;
  const roots = [workspaceRoot || process.cwd()];

  const abortController = new AbortController();
  let history: Array<{ role: string; content: string }> = [];
  const edits: Array<{ path: string; status: string; content: string }> = [];

  coworkRuns.set(runId, { abortController, history, edits });

  let writeBuffer = "";

  try {
    clearTaskJournal?.(roots[0]);

    const writeOutput = (text: string) => {
      const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
      if (!clean) return;
      writeBuffer += clean;
      const lines = writeBuffer.split("\n");
      writeBuffer = lines.pop() || "";
      for (const line of lines) {
        const real = line.includes("\r") ? line.slice(line.lastIndexOf("\r") + 1) : line;
        const trimmed = real.trim();
        if (trimmed && !/^[\s⠀-⣿]+$/.test(trimmed)) {
          sendToRenderer("cowork:activity", {
            runId,
            time: new Date().toLocaleTimeString(),
            agent: "shmakk",
            action: "think",
            detail: trimmed,
          });
        }
      }
    };

    const result = await runAgent({
      input: prompt,
      roots,
      glossary: null,
      confirmTool: async ({ name, args, safety, description }: {
        name: string; args: unknown; safety: string; description: string;
      }) => {
        if (abortController.signal.aborted) return false;
        if (autoApprove && safety !== "unsafe") {
          sendToRenderer("cowork:activity", {
            runId,
            time: new Date().toLocaleTimeString(),
            agent: "shmakk",
            action: "tool",
            detail: `${name} (auto-approved)`,
          });
          return true;
        }
        // Non-auto-approve: still auto-approve safe, deny rest in cowork mode
        if (safety === "safe") return true;
        sendToRenderer("cowork:activity", {
          runId,
          time: new Date().toLocaleTimeString(),
          agent: "shmakk",
          action: "tool",
          detail: `${name} (denied — ${safety})`,
        });
        return false;
      },
      write: writeOutput,
      signal: abortController.signal,
      history: [],
      profile,
      colors: false,
      voiceMode: false,
      specialistHint: skills?.join(", ") || null,
      mcpManager: null,
    });

    history = Array.isArray(result) ? result.slice(-30) : [];
    const lastMsg = history[history.length - 1];
    const reply = lastMsg?.role === "assistant" ? (lastMsg.content || "") : "";

    // Read edits from the tracker
    try {
      const { getEdits, clearEdits } = require(path.join(SHMAKK_SRC, "edit-tracker"));
      const trackedEdits = getEdits();
      for (const e of trackedEdits) {
        edits.push({
          path: e.filePath,
          status: e.oldContent === null ? "added" : "modified",
          content: e.newContent || "",
        });
      }
      clearEdits();
    } catch { /* edits tracking optional */ }

    sendToRenderer("cowork:done", { runId, reply, edits });
    return { ok: true, reply, edits };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      sendToRenderer("cowork:done", { runId, cancelled: true });
      return { ok: true, cancelled: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    sendToRenderer("cowork:error", { runId, error: msg });
    return { error: msg };
  } finally {
    coworkRuns.delete(runId);
  }
});

ipcMain.on("cowork:cancel", (_event, runId: string) => {
  const run = coworkRuns.get(runId);
  if (run) {
    run.abortController.abort();
  }
});

// ── Schedules ───────────────────────────────────────────────────────────

const SCHEDULES_JSON = path.join(SHMAKK_DIR, "schedules.json");

interface Schedule {
  id: string;
  name: string;
  when: string;       // natural language: "every Monday at 9am"
  cron: string;       // computed: "0 9 * * 1"
  prompt: string;
  profile: string;
  enabled: boolean;
  lastRun: number | null;
  nextRun: number | null;
  createdAt: number;
}

function naturalToCron(when: string): string {
  const s = when.toLowerCase().trim();

  // "every day at 9am" / "daily at 9am" / "every day at 14:00"
  if (/(?:every\s+)?(?:day|daily)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.test(s)) {
    const m = s.match(/(?:every\s+)?(?:day|daily)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)!;
    let hour = parseInt(m[1]);
    if (m[3] === "pm" && hour < 12) hour += 12;
    if (m[3] === "am" && hour === 12) hour = 0;
    const min = m[2] ? parseInt(m[2]) : 0;
    return `${min} ${hour} * * *`;
  }

  // "every monday at 9am" / "mondays at 10:30"
  const dayNames: Record<string, string> = {
    sunday: "0", monday: "1", tuesday: "2", wednesday: "3",
    thursday: "4", friday: "5", saturday: "6",
    sun: "0", mon: "1", tue: "2", wed: "3", thu: "4", fri: "5", sat: "6",
  };
  for (const [name, num] of Object.entries(dayNames)) {
    const re = new RegExp(`(?:every\\s+)?${name}(?:s)?(?:day)?\\s+(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?`, "i");
    if (re.test(s)) {
      const m = s.match(re)!;
      let hour = parseInt(m[1]);
      if (m[3] === "pm" && hour < 12) hour += 12;
      if (m[3] === "am" && hour === 12) hour = 0;
      const min = m[2] ? parseInt(m[2]) : 0;
      return `${min} ${hour} * * ${num}`;
    }
  }

  // "every weekday at 8am"
  if (/(?:every\s+)?weekday(?:s)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.test(s)) {
    const m = s.match(/(?:every\s+)?weekday(?:s)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)!;
    let hour = parseInt(m[1]);
    if (m[3] === "pm" && hour < 12) hour += 12;
    if (m[3] === "am" && hour === 12) hour = 0;
    const min = m[2] ? parseInt(m[2]) : 0;
    return `${min} ${hour} * * 1-5`;
  }

  // "every weekend at 10am"
  if (/(?:every\s+)?weekend(?:s)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.test(s)) {
    const m = s.match(/(?:every\s+)?weekend(?:s)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)!;
    let hour = parseInt(m[1]);
    if (m[3] === "pm" && hour < 12) hour += 12;
    if (m[3] === "am" && hour === 12) hour = 0;
    const min = m[2] ? parseInt(m[2]) : 0;
    return `${min} ${hour} * * 6,0`;
  }

  // "every 1st of month at 9am"
  if (/(?:every\s+)?1st(?:\s+of\s+month)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.test(s)) {
    const m = s.match(/(?:every\s+)?1st(?:\s+of\s+month)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)!;
    let hour = parseInt(m[1]);
    if (m[3] === "pm" && hour < 12) hour += 12;
    if (m[3] === "am" && hour === 12) hour = 0;
    const min = m[2] ? parseInt(m[2]) : 0;
    return `${min} ${hour} 1 * *`;
  }

  // "every hour" / "hourly"
  if (/every\s+hour|hourly/i.test(s)) return "0 * * * *";

  // If already looks like cron, return as-is
  if (/^\d{1,2}\s+\d{1,2}\s+[\d*,]+\s+[\d*,]+\s+[\d*,-]+/.test(s)) return s;

  // Fallback: treat as "daily at 9am"
  return "0 9 * * *";
}

function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;
  const h = parseInt(hour);
  const m = parseInt(min);
  const timeStr = `${h}:${m.toString().padStart(2, "0")}`;

  if (dom === "1" && dow === "*") return `monthly on the 1st at ${timeStr}`;
  if (dow === "1-5") return `every weekday at ${timeStr}`;
  if (dow === "6,0") return `every weekend at ${timeStr}`;
  if (dow === "*" && dom === "*") return `daily at ${timeStr}`;
  const dayNames: Record<string, string> = {
    "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday",
    "4": "Thursday", "5": "Friday", "6": "Saturday",
  };
  if (dow in dayNames) return `every ${dayNames[dow]} at ${timeStr}`;
  return cron;
}

function loadSchedules(): Schedule[] {
  const data = readJsonSafe(SCHEDULES_JSON);
  if (data && Array.isArray(data.schedules)) return data.schedules as Schedule[];
  return [];
}

function saveSchedules(schedules: Schedule[]) {
  writeJsonSafe(SCHEDULES_JSON, { schedules, updatedAt: new Date().toISOString() });
}

function parseCronNext(cron: string): number | null {
  // Simple cron parser for "min hour dom mon dow" format
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [min, hour] = parts.map(Number);
  if (isNaN(min) || isNaN(hour)) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

ipcMain.handle("schedules:list", () => loadSchedules());

ipcMain.handle("schedules:create", (_event, data: {
  name: string; when: string; prompt: string; profile: string;
}) => {
  const cron = naturalToCron(data.when);
  const schedules = loadSchedules();
  const schedule: Schedule = {
    id: `sch-${Date.now()}`,
    name: data.name,
    when: data.when,
    cron,
    prompt: data.prompt,
    profile: data.profile || "balanced",
    enabled: true,
    lastRun: null,
    nextRun: parseCronNext(cron),
    createdAt: Date.now(),
  };
  schedules.push(schedule);
  saveSchedules(schedules);
  return { schedule };
});

ipcMain.handle("schedules:delete", (_event, id: string) => {
  let schedules = loadSchedules();
  schedules = schedules.filter((s) => s.id !== id);
  saveSchedules(schedules);
  return true;
});

ipcMain.handle("schedules:update", (_event, id: string, data: { name?: string; when?: string; prompt?: string; profile?: string }) => {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  if (data.name !== undefined) schedules[idx].name = data.name;
  if (data.prompt !== undefined) schedules[idx].prompt = data.prompt;
  if (data.profile !== undefined) schedules[idx].profile = data.profile;
  if (data.when !== undefined) {
    schedules[idx].when = data.when;
    schedules[idx].cron = naturalToCron(data.when);
    schedules[idx].nextRun = parseCronNext(schedules[idx].cron);
  }
  saveSchedules(schedules);
  return true;
});

ipcMain.handle("schedules:toggle", (_event, id: string, enabled: boolean) => {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  schedules[idx].enabled = enabled;
  schedules[idx].nextRun = enabled ? parseCronNext(schedules[idx].cron) : null;
  saveSchedules(schedules);
  return true;
});

// Schedule runner: check every 60 seconds
let scheduleInterval: ReturnType<typeof setInterval> | null = null;

function startScheduleRunner() {
  if (scheduleInterval) return;
  scheduleInterval = setInterval(async () => {
    const schedules = loadSchedules().filter((s) => s.enabled);
    const now = Date.now();
    for (const sch of schedules) {
      const next = sch.nextRun || parseCronNext(sch.cron);
      if (next && next <= now && runAgent) {
        // Update last/next run times
        sch.lastRun = now;
        sch.nextRun = parseCronNext(sch.cron);
        const all = loadSchedules();
        const idx = all.findIndex((s) => s.id === sch.id);
        if (idx >= 0) {
          all[idx].lastRun = sch.lastRun;
          all[idx].nextRun = sch.nextRun;
          saveSchedules(all);
        }
        // Execute the schedule
        try {
          await runAgent({
            input: sch.prompt,
            roots: [workspaceRoot || process.cwd()],
            glossary: null,
            confirmTool: async () => true,
            write: () => {},
            signal: new AbortController().signal,
            history: [],
            profile: sch.profile || "balanced",
            colors: false,
            voiceMode: false,
            specialistHint: null,
            mcpManager: null,
          });
        } catch (e) {
          console.error("[shmakk-desktop] Schedule run failed:", sch.name, e);
        }
      }
    }
  }, 60000);
}

startScheduleRunner();

// ── Plugin scaffolding ─────────────────────────────────────────────────

ipcMain.handle("plugins:scaffold", async (_event, description: string, pluginName?: string) => {
  try {
    const { makeClient, modelFor } = require(path.join(SHMAKK_SRC, "llm"));
    const client = makeClient();
    const model = modelFor();

    const systemPrompt = `You are a plugin generator for an AI coding assistant. Based on the user's description, create a complete plugin.

Output each file using this format:

\`\`\`file:.shmakk-plugin/plugin.json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "...",
  "author": { "name": "User" }
}
\`\`\`

\`\`\`file:skills/example/SKILL.md
---
name: example
version: 1
---

# Skill instructions here
\`\`\`

\`\`\`file:commands/example.md
---
name: example
description: What this command does
args:
  - name: input
    description: The input
    required: true
---

# Command instructions here
\`\`\`

\`\`\`file:agents/example.md
---
name: example
role: developer
skill: code
---

# Agent instructions here
\`\`\`

Generate a complete, working plugin. Include at least one skill, one command, and one agent where it makes sense. Make the SKILL.md files detailed with actual instructions. Use proper YAML frontmatter everywhere.`;

    const userMsg = pluginName
      ? `Create a plugin named "${pluginName}": ${description}`
      : `Create a plugin: ${description}`;

    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      max_tokens: 4096,
    });

    const reply = resp.choices?.[0]?.message?.content || "";

    // Parse files from response
    const files: Array<{ path: string; content: string }> = [];
    const fileRegex = /```file:([^\n]+)\n([\s\S]*?)```/g;
    let match;
    while ((match = fileRegex.exec(reply)) !== null) {
      files.push({ path: match[1].trim(), content: match[2].trim() });
    }

    // Save to ~/.config/shmakk/plugins/<name>/
    const { mkdirSync, writeFileSync } = require("node:fs");
    const safeName = (pluginName || description).slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "") || "plugin";
    const pluginDestDir = path.join(PLUGINS_DIR, safeName);

    // Remove existing if any
    if (fs.existsSync(pluginDestDir)) {
      deleteDirRecursive(pluginDestDir);
    }

    mkdirSync(pluginDestDir, { recursive: true });
    mkdirSync(path.join(pluginDestDir, ".shmakk-plugin"), { recursive: true });

    for (const file of files) {
      const fullPath = path.join(pluginDestDir, file.path);
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
    }

    return { ok: true, pluginName: safeName, pluginDir: pluginDestDir, files };
  } catch (e) {
    return { error: String(e) };
  }
});

ipcMain.handle("commands:list", () => {
  const commands: Array<{ name: string; plugin: string; description: string }> = [];

  // Scan all installed plugins for commands
  if (fs.existsSync(PLUGINS_DIR)) {
    const pluginDirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
    for (const entry of pluginDirs) {
      if (!entry.isDirectory()) continue;
      const commandsDir = path.join(PLUGINS_DIR, entry.name, "commands");
      if (!fs.existsSync(commandsDir)) continue;
      const cmdFiles = fs.readdirSync(commandsDir).filter((f: string) => f.endsWith(".md"));
      for (const file of cmdFiles) {
        const cmdName = file.replace(/\.md$/, "");
        let description = "";
        try {
          const raw = fs.readFileSync(path.join(commandsDir, file), "utf-8");
          const fmMatch = /^---\n([\s\S]*?)\n---/.exec(raw);
          if (fmMatch) {
            const descMatch = /^description\s*:\s*(.+)$/m.exec(fmMatch[1]);
            if (descMatch) description = descMatch[1].trim();
          }
        } catch { /* skip */ }
        commands.push({ name: cmdName, plugin: entry.name, description });
      }
    }
  }

  // Also scan shmakk's built-in skills for commands
  if (fs.existsSync(SKILLS_DIR)) {
    const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const entry of skillDirs) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(SKILLS_DIR, entry.name, "SKILL.md");
      if (fs.existsSync(skillMd)) {
        commands.push({ name: entry.name, plugin: "built-in", description: "skill" });
      }
    }
  }

  return { commands };
});

ipcMain.handle("plugins:readFiles", (_event, pluginName: string) => {
  const safeName = pluginName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const pluginDir = path.join(PLUGINS_DIR, safeName);
  if (!fs.existsSync(pluginDir)) return { error: "Plugin not found" };

  const files: Array<{ path: string; content: string }> = [];
  function walk(dir: string, prefix: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = prefix + e.name;
      if (e.isDirectory()) { walk(path.join(dir, e.name), rel + "/"); }
      else {
        try { files.push({ path: rel, content: fs.readFileSync(path.join(dir, e.name), "utf-8") }); }
        catch { /* skip binary */ }
      }
    }
  }
  walk(pluginDir, "");
  return { files };
});

ipcMain.handle("plugins:writeFile", (_event, pluginName: string, filePath: string, content: string) => {
  const safeName = pluginName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const pluginDir = path.join(PLUGINS_DIR, safeName);
  const fullPath = path.join(pluginDir, filePath);
  if (!fullPath.startsWith(pluginDir)) return false; // path traversal guard
  try {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    return true;
  } catch { return false; }
});

ipcMain.handle("plugins:installScaffolded", async (_event, pluginDir: string) => {
  if (!fs.existsSync(pluginDir)) return { error: "Plugin directory not found" };
  const manifestPath = findPluginManifest(pluginDir);
  if (!manifestPath) return { error: "Invalid plugin: missing manifest" };

  let manifest: PluginManifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")); }
  catch { return { error: "Failed to parse plugin.json" }; }

  if (!manifest.name) return { error: "Plugin name missing" };

  const safeName = manifest.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const destDir = path.join(PLUGINS_DIR, safeName);

  // Already installed — skip copy
  if (path.resolve(pluginDir) === path.resolve(destDir)) {
    // Just register skills
    const installedSkills = scanPluginSkills(destDir);
    registerPluginSkills(installedSkills, manifest, safeName);
    return { installed: buildPluginResult(safeName, manifest, destDir, installedSkills) };
  }

  if (fs.existsSync(destDir)) deleteDirRecursive(destDir);
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  copyDirRecursive(pluginDir, destDir);

  const installedSkills = scanPluginSkills(destDir);
  registerPluginSkills(installedSkills, manifest, safeName);

  return { installed: buildPluginResult(safeName, manifest, destDir, installedSkills) };
});

// ── Code ──────────────────────────────────────────────────────────────

ipcMain.handle("code:chat", async (_event, opts: { filePath: string; fullFile: string; selection: string; action: string }) => {
  if (!runAgent) return { error: "Agent not available" };
  const labels: Record<string, string> = {
    fix: "Fix bugs, add error handling, and improve safety in this code",
    explain: "Explain what this code does, its edge cases, and risk surface",
    generate: "Generate improvements or new code based on this context",
  };
  const systemPrompt = opts.action === "fix"
    ? `You are a code fixer. Only modify the SELECTED CODE, not the entire file. For each change, output:
FILE: relative/path
FIND: <exact text to find>
REPLACE: <exact replacement>
---
Separate multiple changes with --- alone on a line.
After all changes, add ==== on its own line followed by a brief explanation.
The FIND text must match exactly including whitespace. Only ONE change per block. Do NOT use unified diff format.
CRITICAL: Only change what was selected. If you need context from the full file, use it to understand, but only output changes for the selected code.`
    : opts.action === "explain"
    ? `Explain this code concisely. What it does, edge cases, risks. Keep it short.`
    : `Generate code based on the context. Output ONLY the code, no explanations.`;
  try {
    const result = await runAgent({
      input: `File: ${opts.filePath}\n\nSelected code:\n\`\`\`\n${opts.selection}\n\`\`\`\n\nFull file:\n\`\`\`\n${opts.fullFile.slice(0, 4000)}\n\`\`\``,
      roots: [workspaceRoot || process.cwd()],
      glossary: null, confirmTool: async () => true, write: () => {},
      signal: new AbortController().signal,
      history: [{ role: "system", content: systemPrompt }],
      profile: "balanced", colors: false, voiceMode: false,
      specialistHint: null, mcpManager: null,
    });
    const reply = Array.isArray(result) && result.length > 0
      ? (result[result.length - 1] as { content?: string })?.content || ""
      : "";

    // Extract changes for fix action
    let diff: string | undefined;
    let explanation: string | undefined;
    if (opts.action === "fix") {
      const parts = reply.split(/^====+\s*$/m, 2);
      if (parts.length === 2) {
        diff = parts[0].trim();
        explanation = parts[1].trim();
      } else {
        diff = reply.trim();
      }
    }
    return { ok: true, reply: explanation || reply, diff };
  } catch (e) { return { error: String(e) }; }
});

// ── Preview (dev server) ──────────────────────────────────────────────

let devServerProc: ReturnType<typeof import("child_process").spawn> | null = null;
let devServerUrl = "";

ipcMain.handle("preview:startDevServer", async (_event, packageJsonPath: string) => {
  // Kill any existing server first
  if (devServerProc) {
    devServerProc.kill();
    devServerProc = null;
    devServerUrl = "";
  }

  const absolutePath = path.join(workspaceRoot, packageJsonPath);
  const projectDir = path.dirname(absolutePath);
  let pkg: Record<string, unknown>;
  try { pkg = JSON.parse(fs.readFileSync(absolutePath, "utf-8")); }
  catch { return { error: "Failed to read package.json: " + absolutePath }; }

  const scripts = (pkg.scripts || {}) as Record<string, string>;
  let scriptName = "";
  if (scripts.dev) scriptName = "dev";
  else if (scripts.start) scriptName = "start";
  else if (scripts.serve) scriptName = "serve";
  else {
    for (const [k] of Object.entries(scripts)) {
      if (k.includes("dev") || k.includes("start")) { scriptName = k; break; }
    }
  }
  if (!scriptName) return { error: "No dev/start/serve script found in package.json" };

  const hasYarn = fs.existsSync(path.join(projectDir, "yarn.lock"));
  const hasPnpm = fs.existsSync(path.join(projectDir, "pnpm-lock.yaml"));
  const cmd = hasPnpm ? "pnpm" : hasYarn ? "yarn" : "npm";
  const args = hasPnpm || hasYarn ? [scriptName] : ["run", scriptName];

  const { spawn } = require("child_process");
  // Strip env vars that might trigger Electron or browser opening
  const cleanEnv = { ...process.env };
  delete cleanEnv.VITE_DEV_SERVER_URL;
  delete cleanEnv.BROWSER;
  cleanEnv.BROWSER = "none";

  devServerProc = spawn(cmd, args, {
    cwd: projectDir, shell: true, stdio: ["ignore", "pipe", "pipe"],
    env: cleanEnv,
  });
  devServerUrl = "";

  const tryDetectUrl = (text: string) => {
    const match = text.match(/(https?:\/\/\S+:\d{4,5})/);
    if (match && !devServerUrl) {
      devServerUrl = match[1].replace(/[.,;]$/, "");
      sendToRenderer("preview:serverReady", { url: devServerUrl });
    }
  };

  let outBuffer = "";
  devServerProc?.stdout?.on("data", (chunk: Buffer) => {
    outBuffer += chunk.toString();
    tryDetectUrl(outBuffer);
  });

  let errBuffer = "";
  devServerProc?.stderr?.on("data", (chunk: Buffer) => {
    errBuffer += chunk.toString();
    tryDetectUrl(errBuffer);
  });

  devServerProc?.on("exit", (code: number | null) => {
    devServerProc = null;
    if (!devServerUrl && code !== 0) {
      sendToRenderer("preview:serverError", { error: `Exited with code ${code}${errBuffer ? ". " + errBuffer.slice(-200) : ""}` });
    }
  });

  devServerProc?.on("error", (e: Error) => {
    sendToRenderer("preview:serverError", { error: e.message });
    devServerProc = null;
    devServerUrl = "";
  });

  setTimeout(() => {
    if (!devServerUrl) {
      const defaults = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"];
      for (const u of defaults) {
        devServerUrl = u;
        sendToRenderer("preview:serverReady", { url: u });
        break;
      }
    }
  }, 10000);

  return { ok: true, scriptName: `${cmd} ${args.join(" ")}` };
});

ipcMain.handle("preview:stopDevServer", () => {
  if (devServerProc) { devServerProc.kill(); devServerProc = null; devServerUrl = ""; }
  return true;
});

ipcMain.handle("preview:getDevServerUrl", () => {
  return { url: devServerUrl, running: !!devServerProc };
});

// ── File watcher ─────────────────────────────────────────────────────────

let fileWatcher: ReturnType<typeof import("fs").watch> | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;

ipcMain.handle("workspace:watchFiles", () => {
  if (fileWatcher) return true;
  const root = workspaceRoot;
  if (!root) return false;
  try {
    fileWatcher = fs.watch(root, { recursive: true }, () => {
      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        sendToRenderer("workspace:filesChanged", {});
      }, 500);
    });
    return true;
  } catch { return false; }
});

ipcMain.handle("workspace:unwatchFiles", () => {
  if (fileWatcher) { fileWatcher.close(); fileWatcher = null; }
  return true;
});

// ── Git ──────────────────────────────────────────────────────────────────

function git(args: string[]): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  return new Promise((resolve) => {
    const { execFile } = require("child_process");
    execFile("git", args, { cwd: workspaceRoot, maxBuffer: 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), ok: !err });
    });
  });
}

ipcMain.handle("git:branches", async () => {
  const r = await git(["branch", "-a"]);
  const branches = r.stdout.split("\n")
    .map((l) => l.replace(/^\*\s*/, "").replace(/remotes\/origin\//, "").trim())
    .filter((b) => b && !b.includes("HEAD") && !b.startsWith("origin/HEAD"));
  const unique = [...new Set(branches)];
  const current = r.stdout.match(/^\*\s+(.+)/m)?.[1]?.trim() || "";
  return { current, branches: unique };
});

ipcMain.handle("git:status", async () => {
  const r = await git(["status", "--porcelain"]);
  const files = r.stdout.split("\n").filter(Boolean).map((l) => {
    const statusCode = l.slice(0, 2).trim();
    let status: string;
    if (statusCode === "M" || statusCode === "MM") status = "modified";
    else if (statusCode === "A" || statusCode === "AM") status = "added";
    else if (statusCode === "D" || statusCode === "MD") status = "deleted";
    else if (statusCode === "??") status = "untracked";
    else if (statusCode === "R") status = "renamed";
    else status = "modified";
    const filePath = l.slice(3).trim();
    return { path: filePath, status };
  });
  return { files };
});

ipcMain.handle("git:log", async () => {
  const r = await git(["log", "--oneline", "-20", "--format=%h|%s|%an|%ad", "--date=relative"]);
  const commits = r.stdout.split("\n").filter(Boolean).map((l) => {
    const [hash, message, author, date] = l.split("|");
    return { hash, message, author, date };
  });
  return { commits };
});

ipcMain.handle("git:checkout", async (_e, branch: string) => {
  const r = await git(["checkout", branch]);
  return { ok: r.ok, error: r.stderr };
});

ipcMain.handle("git:createBranch", async (_e, name: string) => {
  const r = await git(["checkout", "-b", name]);
  return { ok: r.ok, error: r.stderr };
});

ipcMain.handle("git:diff", async (_e, file?: string) => {
  const args = ["diff"];
  if (file) args.push("--", file);
  else args.push("--staged");
  const r = await git(args);
  return { diff: r.stdout, error: r.stderr };
});

ipcMain.handle("git:stage", async (_e, files: string[]) => {
  const r = await git(["add", ...files]);
  return { ok: r.ok, error: r.stderr };
});

ipcMain.handle("git:commit", async (_e, message: string) => {
  const r = await git(["commit", "-m", message]);
  return { ok: r.ok, error: r.stderr };
});

ipcMain.handle("git:merge", async (_e, branch: string) => {
  const r = await git(["merge", branch]);
  return { ok: r.ok, error: r.stderr };
});

ipcMain.handle("git:unstage", async (_e, files: string[]) => {
  const r = await git(["reset", "HEAD", ...files]);
  return { ok: r.ok, error: r.stderr };
});

// ── App lifecycle ────────────────────────────────────────────────────────

// Clean up dev server on app quit
app.on("will-quit", () => {
  if (devServerProc) { devServerProc.kill(); devServerProc = null; }
});

// ── Design ────────────────────────────────────────────────────────────

ipcMain.handle("design:generate", async (_event, prompt: string, designType: string) => {
  if (!runAgent) return { error: "Agent not available" };

  const typeHints: Record<string, string> = {
    custom: "Create a design that follows the user's prompt and preserves the existing layout and visual direction when the prompt is a revision. Keep the output focused and avoid introducing an unrelated page type unless the prompt clearly asks for one.",
    // Renamed types (v2 DesignView)
    dashboard: "Create a dashboard layout with sidebar navigation, header stats cards, and a main content area with charts/tables. Use a professional data-visualization color palette.",
    landing: "Create a modern SaaS landing page with hero section, feature grid, testimonials, pricing cards, and a CTA footer. Use clean typography and generous whitespace.",
    page: "Create a complete full-page website design with navigation, multiple sections, and a footer. Think through the full user journey.",
    // Legacy names (backward compatible)
    "landing-page": "Create a modern SaaS landing page with hero section, feature grid, testimonials, pricing cards, and a CTA footer. Use clean typography and generous whitespace.",
    "mobile-app": "Create a mobile app screen design (375px width) with a top navigation bar, scrollable content area, and bottom tab bar. Use mobile-friendly touch targets (min 44px).",
    "full-page": "Create a complete full-page website design with navigation, multiple sections, and a footer. Think through the full user journey.",
    // Unchanged types
    presentation: "Create presentation slides with bold headings, supporting points, and visual elements. Use a slide-by-slide layout with consistent branding.",
    form: "Create a form layout with labeled inputs, validation states, checkboxes/radios, and a submit button. Use clean spacing and accessible labels.",
    component: "Create a reusable UI component with hover states, focus states, and variants. Include a usage example showing the component in context.",
    wireframe: "Create a low-fidelity wireframe with placeholder boxes, lorem ipsum text, and basic layout structure. Focus on information architecture and flow.",
  };

  const typeHint = typeHints[designType] || typeHints.custom;

  const systemPrompt = `You are a senior UI/UX designer. Your ONLY job is to output a single, complete, self-contained HTML document. Do NOT explain, plan, describe, or use any tools. Rules:

- Output the HTML immediately inside one \`\`\`html code block — nothing before or after
- Use modern CSS (Grid, Flexbox, custom properties)
- Clean, cohesive color palette defined as CSS custom properties on :root
- Responsive design (mobile-first where appropriate)
- Subtle animations/transitions on interactive elements
- Include all CSS in a <style> tag, no external files
- Use semantic HTML5 elements
- Make it visually polished and production-ready
- ${typeHint}

Begin now. Output ONLY the \`\`\`html code block.`;

  const abortController = new AbortController();
  let fullHtml = "";
  let writeBuffer = "";

  try {
    const result = await runAgent({
      input: prompt,
      roots: [workspaceRoot || process.cwd()],
      glossary: null,
      confirmTool: async () => true,
      write: (text: string) => {
        const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
        if (!clean) return;
        writeBuffer += clean;
        const lines = writeBuffer.split("\n");
        writeBuffer = lines.pop() || "";
        for (const line of lines) {
          const real = line.includes("\r") ? line.slice(line.lastIndexOf("\r") + 1) : line;
          if (real.trim()) {
            fullHtml += real + "\n";
            sendToRenderer("design:token", { text: real + "\n", done: false });
          }
        }
      },
      signal: abortController.signal,
      history: [{ role: "system", content: systemPrompt }],
      profile: "builder",
      colors: false,
      voiceMode: false,
      specialistHint: "design frontend ux-ui",
      mcpManager: null,
    });

    // Extract HTML from response — search all assistant messages, not just the last one.
    // The agent may have used tools before producing the final HTML output.
    let html = "";
    if (Array.isArray(result)) {
      for (let i = result.length - 1; i >= 0; i--) {
        const msg = result[i] as { role?: string; content?: string } | undefined;
        if (!msg || msg.role !== "assistant" || !msg.content) continue;
        const htmlMatch = /```html\s*\n([\s\S]*?)```/i.exec(msg.content);
        if (htmlMatch) {
          html = htmlMatch[1].trim();
          break;
        }
      }
    }

    // Validate that the extracted content looks like HTML
    if (!html || !/<(html|body|div|head|style|script|meta|link|span|p|h[1-6]|section|header|nav|main|footer|article|table|form|input|button|a|img|svg|canvas|ul|ol|li)/i.test(html)) {
      const errMsg = "Agent did not produce valid HTML. Try rephrasing your prompt or selecting a different design type.";
      sendToRenderer("design:token", { text: "", done: true, error: errMsg });
      return { error: errMsg };
    }

    sendToRenderer("design:token", { text: "", done: true, html });
    return { ok: true, html };
  } catch (e) {
    sendToRenderer("design:token", { text: "", done: true, error: String(e) });
    return { error: String(e) };
  } finally {
    if (writeBuffer.trim()) {
      fullHtml += writeBuffer;
      sendToRenderer("design:token", { text: writeBuffer + "\n", done: false });
    }
  }
});

// ── Artifacts ──────────────────────────────────────────────────────────

const ARTIFACTS_DIR = path.join(SHMAKK_DIR, "artifacts");
const PROJECT_ARTIFACTS_DIR = path.join(SHMAKK_DIR, "project-artifacts");

type ArtifactScope = { type?: "global" | "project"; projectId?: string };

function artifactRoot(scope?: ArtifactScope): string | null {
  if (scope?.type === "project") {
    if (!scope.projectId) return null;
    return resolveInsideRoot(PROJECT_ARTIFACTS_DIR, scope.projectId);
  }
  return ARTIFACTS_DIR;
}

ipcMain.handle("artifacts:list", (_event, scope?: ArtifactScope) => {
  const root = artifactRoot(scope);
  if (!root || !fs.existsSync(root)) return { files: [] };
  const files: Array<{ name: string; size: number; mtime: number }> = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile()) {
      try {
        const st = fs.statSync(path.join(root, e.name));
        files.push({ name: e.name, size: st.size, mtime: st.mtimeMs });
      } catch { /* skip */ }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return { files };
});

ipcMain.handle("artifacts:read", (_event, fileName: string, scope?: ArtifactScope) => {
  const root = artifactRoot(scope);
  const p = root ? resolveInsideRoot(root, safeFileName(fileName)) : null;
  if (!p || !fs.existsSync(p)) return null;
  return { content: fs.readFileSync(p, "utf-8"), name: path.basename(p) };
});

ipcMain.handle("artifacts:delete", (_event, fileName: string, scope?: ArtifactScope) => {
  const root = artifactRoot(scope);
  const p = root ? resolveInsideRoot(root, safeFileName(fileName)) : null;
  if (!p || !fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
});

ipcMain.handle("artifacts:save", (_event, fileName: string, content: string, scope?: ArtifactScope) => {
  const root = artifactRoot(scope);
  if (!root) return { path: "" };
  fs.mkdirSync(root, { recursive: true });
  const p = resolveInsideRoot(root, safeFileName(fileName));
  if (!p) return { path: "" };
  fs.writeFileSync(p, content, "utf-8");
  return { path: p };
});

// ── App lifecycle ─────────────────────────────────────────────────────────

if (IS_CLI_MODE) {
  app.whenReady().then(runCliMode);
} else {
  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
