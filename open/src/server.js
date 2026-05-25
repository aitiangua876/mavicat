import express from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { hashPassword, makeId, paths, readDb, verifyPassword, writeDb } from "./store.js";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "4175", 10);
const geoCache = new Map();

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

function normalizeToken(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function detectPlatform(userAgent = "") {
  const value = normalizeToken(userAgent);
  if (value.includes("macintosh") || value.includes("macos") || value.includes("macosx")) {
    return "macos";
  }
  if (value.includes("windows")) {
    return "windows";
  }
  if (value.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

function architectureHints(userAgent = "") {
  const value = normalizeToken(userAgent);
  const hints = [];
  if (value.includes("arm64") || value.includes("aarch64")) {
    hints.push("arm64", "aarch64", "apple", "silicon");
  }
  if (value.includes("x8664") || value.includes("x64") || value.includes("amd64") || value.includes("win64")) {
    hints.push("x64", "amd64", "x8664", "intel");
  }
  return hints;
}

function packageMatchesPlatform(pkg, platform) {
  const value = normalizeToken(`${pkg.platform} ${pkg.label} ${pkg.originalName}`);
  if (platform === "macos") {
    return value.includes("mac") || value.includes("darwin") || value.includes("dmg");
  }
  if (platform === "windows") {
    return value.includes("windows") || value.includes("win") || value.includes("exe") || value.includes("msi");
  }
  if (platform === "linux") {
    return value.includes("linux") || value.includes("deb") || value.includes("rpm") || value.includes("appimage");
  }
  return false;
}

function scorePackage(pkg, platform, hints = []) {
  if (!packageMatchesPlatform(pkg, platform)) {
    return -1;
  }

  const value = normalizeToken(`${pkg.arch} ${pkg.label} ${pkg.originalName}`);
  let score = 10;
  hints.forEach((hint, index) => {
    if (value.includes(hint)) {
      score += 20 - index;
    }
  });
  if (value.includes("universal")) {
    score += 5;
  }
  return score;
}

function sortedVisibleVersions(request) {
  const user = getSessionUser(request);
  return readDb().versions
    .filter((version) => version.published || user?.role === "admin")
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt ?? left.releaseDate ?? left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.updatedAt ?? right.releaseDate ?? right.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    });
}

function findLatestPackage(request, requestedPlatform) {
  const platform = requestedPlatform === "auto" ? detectPlatform(request.headers["user-agent"]) : requestedPlatform;
  const hints = architectureHints(request.headers["user-agent"]);

  for (const version of sortedVisibleVersions(request)) {
    const candidates = version.packages
      .map((pkg) => ({ pkg, score: scorePackage(pkg, platform, hints) }))
      .filter((candidate) => candidate.score >= 0)
      .sort((left, right) => right.score - left.score);

    if (candidates.length > 0) {
      return candidates[0].pkg;
    }
  }

  return null;
}

function getClientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const rawIp = forwardedIp?.split(",")[0]?.trim() || request.headers["x-real-ip"] || request.socket.remoteAddress || "";
  return String(rawIp).replace(/^::ffff:/, "");
}

function isPrivateIp(ip) {
  return (
    !ip ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

function parseDevice(userAgent = "") {
  const os = /Windows/i.test(userAgent)
    ? "Windows"
    : /Mac OS X|Macintosh/i.test(userAgent)
      ? "macOS"
      : /Android/i.test(userAgent)
        ? "Android"
        : /iPhone|iPad|iPod/i.test(userAgent)
          ? "iOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Chrome\//i.test(userAgent)
      ? "Chrome"
      : /Safari\//i.test(userAgent)
        ? "Safari"
        : /Firefox\//i.test(userAgent)
          ? "Firefox"
          : "Browser";
  return `${os} · ${browser}`;
}

async function lookupLocation(ip) {
  if (isPrivateIp(ip)) {
    return "本地网络";
  }
  if (geoCache.has(ip)) {
    return geoCache.get(ip);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,country,regionName,city`,
      { signal: controller.signal }
    );
    const payload = await response.json();
    const parts = [payload.country, payload.regionName, payload.city].filter(Boolean);
    const location = payload.status === "success" && parts.length > 0 ? parts.join(" · ") : "未知归属地";
    geoCache.set(ip, location);
    return location;
  } catch {
    return "未知归属地";
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeVersionInput(body) {
  const releaseDate = normalizeText(body.releaseDate);
  const parsedReleaseDate = releaseDate ? new Date(releaseDate) : new Date();
  return {
    version: normalizeText(body.version),
    channel: normalizeText(body.channel, "stable"),
    title: normalizeText(body.title),
    releaseDate: Number.isNaN(parsedReleaseDate.getTime())
      ? new Date().toISOString()
      : parsedReleaseDate.toISOString(),
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

function publicComment(comment) {
  return {
    id: comment.id,
    body: comment.body,
    authorName: comment.authorName,
    authorType: comment.authorType,
    device: comment.device,
    location: comment.location,
    createdAt: comment.createdAt
  };
}

app.get("/api/me", (request, response) => {
  response.json({ user: publicUser(getSessionUser(request)) });
});

app.get("/api/download/latest", (request, response) => {
  const requestedPlatform = normalizeToken(request.query.platform || "auto");
  const allowedPlatform = ["auto", "macos", "windows", "linux"].includes(requestedPlatform) ? requestedPlatform : "auto";
  const pkg = findLatestPackage(request, allowedPlatform);
  if (!pkg) {
    response.redirect(302, "/#versions");
    return;
  }
  response.redirect(302, pkg.url);
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
  response.json({ versions: sortedVisibleVersions(request) });
});

app.get("/api/comments", (_request, response) => {
  const comments = readDb().comments
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map(publicComment);
  response.json({ comments });
});

app.post("/api/comments", async (request, response) => {
  const body = normalizeText(request.body.body);
  if (body.length < 2 || body.length > 1000) {
    response.status(400).json({ message: "评论内容需为 2 到 1000 个字符。" });
    return;
  }

  const user = getSessionUser(request);
  const ipAddress = getClientIp(request);
  const now = new Date().toISOString();
  const comment = {
    id: makeId("cmt"),
    userId: user?.id ?? null,
    authorName: user?.username ?? "游客",
    authorType: user ? "user" : "guest",
    body,
    device: parseDevice(request.headers["user-agent"]),
    ipAddress,
    location: await lookupLocation(ipAddress),
    createdAt: now
  };

  const db = readDb();
  db.comments.push(comment);
  writeDb(db);
  response.status(201).json({ comment: publicComment(comment) });
});

app.delete("/api/admin/comments/:id", requireAdmin, (request, response) => {
  const db = readDb();
  const before = db.comments.length;
  db.comments = db.comments.filter((comment) => comment.id !== request.params.id);
  if (db.comments.length === before) {
    response.status(404).json({ message: "Comment not found." });
    return;
  }
  writeDb(db);
  response.json({ ok: true });
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

app.use(express.static(join(paths.rootDir, "public")));

app.listen(port, () => {
  console.log(`Mavicat Open is running at http://localhost:${port}`);
});
