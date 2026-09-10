const { Client } = require("pg");
require("dotenv").config();

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function createDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env and update the connection string.");
  }

  const targetUrl = new URL(process.env.DATABASE_URL);
  const databaseName = targetUrl.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  const maintenanceUrl = new URL(process.env.DATABASE_URL);
  maintenanceUrl.pathname = "/postgres";

  const client = new Client({
    connectionString: maintenanceUrl.toString()
  });

  try {
    await client.connect();

    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );

    if (existing.rowCount > 0) {
      console.log(`Database "${databaseName}" already exists.`);
      return;
    }

    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`Database "${databaseName}" created successfully.`);
  } finally {
    await client.end();
  }
}

createDatabase().catch((error) => {
  console.error("Database creation failed.");
  console.error(error.message);
  process.exit(1);
});
