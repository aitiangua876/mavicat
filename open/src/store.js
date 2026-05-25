import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "storage", "data");
const dbPath = join(dataDir, "db.json");

const defaultAdminPassword = "Kailing@2026";

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const candidate = scryptSync(password, salt, 64);
  const saved = Buffer.from(hash, "hex");
  return saved.length === candidate.length && timingSafeEqual(saved, candidate);
}

function defaultDatabase() {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: "usr_admin",
        username: "admin",
        passwordHash: createPasswordHash(defaultAdminPassword),
        role: "admin",
        createdAt: now,
        updatedAt: now
      }
    ],
    sessions: [],
    versions: [
      {
        id: "ver_100",
        version: "1.0.0",
        channel: "stable",
        title: "Mavicat 1.0",
        releaseDate: now.slice(0, 10),
        notes: "Initial public release package placeholder. Upload installers from the admin console.",
        published: true,
        packages: [],
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

function ensureDatabase() {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, `${JSON.stringify(defaultDatabase(), null, 2)}\n`, "utf8");
  }
}

export function readDb() {
  ensureDatabase();
  return JSON.parse(readFileSync(dbPath, "utf8"));
}

export function writeDb(db) {
  ensureDatabase();
  const tmpPath = `${dbPath}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  renameSync(tmpPath, dbPath);
}

export function makeId(prefix) {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export function hashPassword(password) {
  return createPasswordHash(password);
}

export const paths = {
  rootDir,
  uploadsDir: join(rootDir, "storage", "uploads")
};
