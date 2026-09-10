const bcrypt = require("bcryptjs");
const { Client } = require("pg");
require("dotenv").config();

const users = [
  {
    fullName: "Gudara Admin",
    email: "admin@gudara.id",
    role: "admin",
    password: process.env.SEED_ADMIN_PASSWORD
  },
  {
    fullName: "Gudara Akuntan",
    email: "akuntan@gudara.id",
    role: "akuntan",
    password: process.env.SEED_AKUNTAN_PASSWORD
  },
  {
    fullName: "Gudara Manajemen",
    email: "manajemen@gudara.id",
    role: "manajemen",
    password: process.env.SEED_MANAJEMEN_PASSWORD
  }
];

async function seedUsers() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  for (const user of users) {
    if (!user.password || user.password.length < 10) {
      throw new Error(`Seed password for ${user.email} must be at least 10 characters.`);
    }
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();

    for (const user of users) {
      const existing = await client.query("SELECT id FROM users WHERE lower(email) = lower($1)", [user.email]);

      if (existing.rowCount > 0) {
        console.log(`User ${user.email} already exists.`);
        continue;
      }

      const passwordHash = await bcrypt.hash(user.password, 12);

      await client.query(
        `
          INSERT INTO users (full_name, email, password_hash, role)
          VALUES ($1, $2, $3, $4)
        `,
        [user.fullName, user.email, passwordHash, user.role]
      );

      console.log(`User ${user.email} created.`);
    }
  } finally {
    await client.end();
  }
}

seedUsers().catch((error) => {
  console.error("User seeding failed.");
  console.error(error.message);
  process.exit(1);
});
