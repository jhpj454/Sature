import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const REQUIRED_PASSWORD = "SaturateDev123!";
const AGENCY = {
  name: "Demo Agency",
  timezone: "America/Chicago",
  plan: "saturate",
  status: "active",
};

const USERS = [
  {
    email: "admin@saturate.dev",
    display_name: "Admin User",
    role: "admin",
    status: "active",
  },
  {
    email: "csr@saturate.dev",
    display_name: "CSR User",
    role: "csr",
    status: "active",
  },
  {
    email: "producer@saturate.dev",
    display_name: "Producer User",
    role: "producer",
    status: "active",
  },
  {
    email: "marketing@saturate.dev",
    display_name: "Marketing User",
    role: "marketing",
    status: "active",
  },
];

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

async function getOrCreateAgency(client) {
  const existing = await client.query(
    `
      SELECT id
      FROM agencies
      WHERE name = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [AGENCY.name],
  );

  if (existing.rowCount && existing.rows[0]) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `
      INSERT INTO agencies (name, timezone, plan, status)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [AGENCY.name, AGENCY.timezone, AGENCY.plan, AGENCY.status],
  );

  return inserted.rows[0].id;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const agencyId = await getOrCreateAgency(client);

    await client.query("SELECT set_config('app.current_agency_id', $1, true)", [agencyId]);

    const passwordHash = await bcrypt.hash(REQUIRED_PASSWORD, 12);

    for (const user of USERS) {
      await client.query(
        `
          INSERT INTO users (
            agency_id,
            email,
            password_hash,
            display_name,
            role,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (agency_id, email) DO NOTHING
        `,
        [agencyId, user.email, passwordHash, user.display_name, user.role, user.status],
      );
    }

    await client.query("COMMIT");

    console.log("Saturate Dev Users Created");
    console.log("admin@saturate.dev");
    console.log("csr@saturate.dev");
    console.log("producer@saturate.dev");
    console.log("marketing@saturate.dev");
    console.log("Password for all users:");
    console.log("SaturateDev123!");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed dev users.");
  console.error(error);
  process.exit(1);
});
