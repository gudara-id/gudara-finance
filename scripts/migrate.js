const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config();

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env and update the connection string.");
  }

  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    await client.query(schemaSql);
    console.log("Database migration completed successfully.");
  } finally {
    await client.end();
  }
}

migrate().catch((error) => {
  console.error("Database migration failed.");
  console.error(error.message);
  process.exit(1);
});
