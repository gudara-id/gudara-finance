import { pbkdf2Sync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , email = "admin@gudara.id", password, fullName = "Gudara Admin", role = "admin"] = process.argv;

if (!password || password.length < 10) {
  console.error("Usage: node scripts/make-admin-sql.mjs admin@gudara.id StrongPassword123! \"Gudara Admin\" admin");
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

if (!["admin", "akuntan", "manajemen", "sales"].includes(role)) {
  console.error("Role must be admin, akuntan, manajemen, or sales.");
  process.exit(1);
}

const iterations = 100000; // Cloudflare Workers' crypto.subtle PBKDF2 caps at 100000 iterations
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const passwordHash = `pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
const sql = `INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES (${sqlString(fullName)}, ${sqlString(email)}, ${sqlString(passwordHash)}, ${sqlString(role)}, 1)
ON CONFLICT(email) DO UPDATE SET
  full_name = excluded.full_name,
  password_hash = excluded.password_hash,
  role = excluded.role,
  is_active = 1,
  updated_at = datetime('now');
`;

const output = resolve("seeds/admin-user.sql");
writeFileSync(output, sql);
console.log(`Wrote ${output}`);

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
