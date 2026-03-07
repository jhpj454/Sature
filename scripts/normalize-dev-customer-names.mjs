import crypto from "node:crypto";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const COMMERCIAL_PREFIXES = [
  "North Harbor",
  "Blue Ridge",
  "Cedar Point",
  "Summit Oak",
  "Silver Maple",
  "Red River",
  "Prairie Stone",
  "Iron Gate",
  "Clearwater",
  "Golden Field",
  "Pine Valley",
  "Lakeview",
  "Granite Peak",
  "Broadleaf",
  "Highland",
  "Stonebridge",
  "Riverton",
  "Evergreen",
  "Fox Hollow",
  "Westbrook",
  "Meadowline",
  "Timberline",
  "Horizon",
  "Anchor Point",
];

const COMMERCIAL_CORE = [
  "Logistics",
  "Builders",
  "Advisors",
  "Electric",
  "Mechanical",
  "Transport",
  "Dental",
  "Manufacturing",
  "Landscape",
  "Consulting",
  "Property",
  "Supply",
  "Foods",
  "Holdings",
  "Metalworks",
  "Glass",
  "Bakery",
  "Pharmacy",
  "Plumbing",
  "Packaging",
  "Cleaning",
  "Printing",
  "Software",
  "Contracting",
];

const COMMERCIAL_SUFFIXES = [
  "LLC",
  "Group",
  "Co.",
  "Inc.",
  "Services",
  "Partners",
  "Works",
  "Studio",
];

const PERSONAL_FIRST_NAMES = [
  "Olivia",
  "Ethan",
  "Maya",
  "Lucas",
  "Ava",
  "Noah",
  "Harper",
  "Miles",
  "Ella",
  "Logan",
  "Grace",
  "Jack",
  "Chloe",
  "Owen",
  "Lily",
  "Wyatt",
  "Zoe",
  "Levi",
  "Nora",
  "Caleb",
  "Ruby",
  "Isaac",
  "Hazel",
  "Gavin",
];

const PERSONAL_LAST_NAMES = [
  "Carter",
  "Bennett",
  "Ramirez",
  "Walker",
  "Mitchell",
  "Hayes",
  "Foster",
  "Brooks",
  "Simmons",
  "Perry",
  "Diaz",
  "Reed",
  "Jenkins",
  "Fisher",
  "Coleman",
  "Sanders",
  "Price",
  "Morris",
  "Ward",
  "Howard",
  "Powell",
  "Hughes",
  "Bryant",
  "Russell",
];

const PERSONAL_SUFFIXES = ["Household", "Family", "Residence", "Account"];

const GENERATED_NAME_PATTERNS = [
  /^ams_[a-z0-9_]+$/i,
  /^acct(?:_[a-z0-9]+)+$/i,
  /^account(?:_[a-z0-9]+)+$/i,
  /^test account\b/i,
  /^acct [a-z]$/i,
];

function isSyntheticAccountName(name) {
  return GENERATED_NAME_PATTERNS.some((pattern) => pattern.test(name.trim()));
}

function hashToIntParts(accountId) {
  const hash = crypto.createHash("sha256").update(accountId).digest("hex");
  return [
    Number.parseInt(hash.slice(0, 8), 16),
    Number.parseInt(hash.slice(8, 16), 16),
    Number.parseInt(hash.slice(16, 24), 16),
    hash.slice(24, 28).toUpperCase(),
  ];
}

function buildCommercialName(accountId) {
  const [a, b, c] = hashToIntParts(accountId);
  return `${COMMERCIAL_PREFIXES[a % COMMERCIAL_PREFIXES.length]} ${COMMERCIAL_CORE[b % COMMERCIAL_CORE.length]} ${COMMERCIAL_SUFFIXES[c % COMMERCIAL_SUFFIXES.length]}`;
}

function buildPersonalName(accountId) {
  const [a, b, c] = hashToIntParts(accountId);
  return `${PERSONAL_FIRST_NAMES[a % PERSONAL_FIRST_NAMES.length]} ${PERSONAL_LAST_NAMES[b % PERSONAL_LAST_NAMES.length]} ${PERSONAL_SUFFIXES[c % PERSONAL_SUFFIXES.length]}`;
}

function buildDeterministicName(accountId, accountType) {
  if (accountType === "personal") {
    return buildPersonalName(accountId);
  }

  return buildCommercialName(accountId);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        SELECT id, agency_id, account_type, account_name
        FROM accounts
        ORDER BY created_at ASC
      `,
    );

    const scanned = result.rows.length;
    const examples = [];
    const plannedByAgency = new Map();

    for (const row of result.rows) {
      const usedNames = plannedByAgency.get(row.agency_id) ?? new Set();
      usedNames.add(String(row.account_name ?? "").trim());
      plannedByAgency.set(row.agency_id, usedNames);
    }

    let renamed = 0;

    for (const row of result.rows) {
      const currentName = String(row.account_name ?? "");
      if (!isSyntheticAccountName(currentName)) {
        continue;
      }

      const baseName = buildDeterministicName(row.id, row.account_type);
      const agencyKey = row.agency_id;
      const usedNames = plannedByAgency.get(agencyKey) ?? new Set();
      usedNames.delete(currentName.trim());
      let nextName = baseName;

      if (usedNames.has(nextName)) {
        const [, , collisionSeed, shortCode] = hashToIntParts(row.id);
        nextName = `${baseName} ${shortCode}${collisionSeed % 9}`;
      }

      usedNames.add(nextName);
      plannedByAgency.set(agencyKey, usedNames);

      if (nextName === currentName) {
        continue;
      }

      await client.query(
        `
          UPDATE accounts
          SET account_name = $2
          WHERE id = $1
        `,
        [row.id, nextName],
      );

      renamed += 1;
      if (examples.length < 10) {
        examples.push({
          id: row.id,
          before: currentName,
          after: nextName,
        });
      }
    }

    await client.query("COMMIT");

    console.log(`Accounts scanned: ${scanned}`);
    console.log(`Accounts renamed: ${renamed}`);
    console.log("Examples:");
    if (examples.length === 0) {
      console.log("(none)");
    } else {
      for (const example of examples) {
        console.log(`${example.id} | ${example.before} -> ${example.after}`);
      }
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to normalize dev customer names.");
  console.error(error);
  process.exit(1);
});
