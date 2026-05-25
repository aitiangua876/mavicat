import express from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { hashPassword, makeId, paths, readDb, verifyPassword, writeDb } from "./store.js";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "4175", 10);

mkdirSync(paths.uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, paths.uploadsDir),
    filename: (_request, file, callback) => {
      const suffix = extname(file.originalname);
      callback(null, `${Date.now()}-${makeId("pkg")}${suffix}`);
    }
  }),
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(paths.uploadsDir));
app.use(express.static(join(paths.rootDir, "public")));

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) {
          return [part, ""];
        }
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function publicUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}

function getSessionUser(request) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies.mavicat_session;
  if (!token) {
    return null;
  }

  const db = readDb();
  const session = db.sessions.find((item) => item.token === token);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return null;
  }

  return db.users.find((user) => user.id === session.userId) ?? null;
}

function requireUser(request, response, next) {
  const user = getSessionUser(request);
  if (!user) {
    response.status(401).json({ message: "Please sign in first." });
    return;
  }
  request.user = user;
  next();
}

function requireAdmin(request, response, next) {
  requireUser(request, response, () => {
    if (request.user.role !== "admin") {
      response.status(403).json({ message: "Administrator access is required." });
      return;
    }
    next();
  });
}

function normalizeText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeVersionInput(body) {
  return {
    version: normalizeText(body.version),
    channel: normalizeText(body.channel, "stable"),
    title: normalizeText(body.title),
    releaseDate: normalizeText(body.releaseDate, new Date().toISOString().slice(0, 10)),
    notes: normalizeText(body.notes),
    published: Boolean(body.published)
  };
}

function validateVersionInput(input) {
  if (!input.version) {
    return "Version is required.";
  }
  if (!input.title) {
    return "Title is required.";
  }
  return null;
}

app.get("/api/me", (request, response) => {
  response.json({ user: publicUser(getSessionUser(request)) });
});

app.post("/api/auth/register", (request, response) => {
  const username = normalizeText(request.body.username);
  const password = normalizeText(request.body.password);

  if (username.length < 3 || password.length < 8) {
    response.status(400).json({ message: "Use at least 3 characters for username and 8 for password." });
    return;
  }

  const db = readDb();
  if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    response.status(409).json({ message: "Username already exists." });
    return;
  }

  const now = new Date().toISOString();
  const user = {
    id: makeId("usr"),
    username,
    passwordHash: hashPassword(password),
    role: "user",
    createdAt: now,
    updatedAt: now
  };
  db.users.push(user);
  writeDb(db);
  response.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", (request, response) => {
  const username = normalizeText(request.body.username);
  const password = normalizeText(request.body.password);
  const db = readDb();
  const user = db.users.find((item) => item.username.toLowerCase() === username.toLowerCase());

  if (!user || !verifyPassword(password, user.passwordHash)) {
    response.status(401).json({ message: "Invalid username or password." });
    return;
  }

  const now = Date.now();
  const token = makeId("ses");
  db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
  db.sessions.push({
    token,
    userId: user.id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString()
  });
  writeDb(db);

  response.cookie("mavicat_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
  response.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (request, response) => {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies.mavicat_session;
  if (token) {
    const db = readDb();
    db.sessions = db.sessions.filter((session) => session.token !== token);
    writeDb(db);
  }
  response.clearCookie("mavicat_session");
  response.json({ ok: true });
});

app.post("/api/auth/change-password", requireUser, (request, response) => {
  const currentPassword = normalizeText(request.body.currentPassword);
  const newPassword = normalizeText(request.body.newPassword);

  if (newPassword.length < 8) {
    response.status(400).json({ message: "New password must contain at least 8 characters." });
    return;
  }

  const db = readDb();
  const user = db.users.find((item) => item.id === request.user.id);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    response.status(401).json({ message: "Current password is incorrect." });
    return;
  }

  user.passwordHash = hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  writeDb(db);
  response.json({ ok: true });
});

app.get("/api/versions", (request, response) => {
  const user = getSessionUser(request);
  const versions = readDb().versions
    .filter((version) => version.published || user?.role === "admin")
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  response.json({ versions });
});

app.post("/api/admin/versions", requireAdmin, (request, response) => {
  const input = normalizeVersionInput(request.body);
  const error = validateVersionInput(input);
  if (error) {
    response.status(400).json({ message: error });
    return;
  }

  const db = readDb();
  const now = new Date().toISOString();
  const version = {
    id: makeId("ver"),
    ...input,
    packages: [],
    createdAt: now,
    updatedAt: now
  };
  db.versions.push(version);
  writeDb(db);
  response.status(201).json({ version });
});

app.put("/api/admin/versions/:id", requireAdmin, (request, response) => {
  const input = normalizeVersionInput(request.body);
  const error = validateVersionInput(input);
  if (error) {
    response.status(400).json({ message: error });
    return;
  }

  const db = readDb();
  const version = db.versions.find((item) => item.id === request.params.id);
  if (!version) {
    response.status(404).json({ message: "Version not found." });
    return;
  }

  Object.assign(version, input, { updatedAt: new Date().toISOString() });
  writeDb(db);
  response.json({ version });
});

app.delete("/api/admin/versions/:id", requireAdmin, (request, response) => {
  const db = readDb();
  const before = db.versions.length;
  db.versions = db.versions.filter((version) => version.id !== request.params.id);
  if (db.versions.length === before) {
    response.status(404).json({ message: "Version not found." });
    return;
  }
  writeDb(db);
  response.json({ ok: true });
});

app.post("/api/admin/versions/:id/packages", requireAdmin, upload.single("installer"), (request, response) => {
  const platform = normalizeText(request.body.platform);
  const arch = normalizeText(request.body.arch);
  const label = normalizeText(request.body.label, `${platform} ${arch}`);

  if (!request.file || !platform || !arch) {
    response.status(400).json({ message: "Installer file, platform, and architecture are required." });
    return;
  }

  const db = readDb();
  const version = db.versions.find((item) => item.id === request.params.id);
  if (!version) {
    response.status(404).json({ message: "Version not found." });
    return;
  }

  const pkg = {
    id: makeId("pkg"),
    platform,
    arch,
    label,
    originalName: request.file.originalname,
    fileName: request.file.filename,
    size: request.file.size,
    url: `/uploads/${request.file.filename}`,
    uploadedAt: new Date().toISOString()
  };
  version.packages.push(pkg);
  version.updatedAt = new Date().toISOString();
  writeDb(db);
  response.status(201).json({ package: pkg, version });
});

app.delete("/api/admin/versions/:versionId/packages/:packageId", requireAdmin, (request, response) => {
  const db = readDb();
  const version = db.versions.find((item) => item.id === request.params.versionId);
  if (!version) {
    response.status(404).json({ message: "Version not found." });
    return;
  }

  const before = version.packages.length;
  version.packages = version.packages.filter((pkg) => pkg.id !== request.params.packageId);
  if (version.packages.length === before) {
    response.status(404).json({ message: "Package not found." });
    return;
  }

  version.updatedAt = new Date().toISOString();
  writeDb(db);
  response.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Mavicat Open is running at http://localhost:${port}`);
});
