import crypto from "node:crypto";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const CARRIER_PREFIXES = [
  "Blue Harbor",
  "Summit Peak",
  "Redwood",
  "Northline",
  "Granite State",
  "Copper Hill",
  "Silver Oak",
  "Prairie Ridge",
  "Ironwood",
  "Clearwater",
  "Cedar Point",
  "Highland",
  "Evergreen",
  "Anchor Point",
  "Stonebridge",
  "Westfield",
  "Riverbend",
  "Broadview",
  "Fox Hollow",
  "Timberline",
];

const CARRIER_SUFFIXES = [
  "Insurance",
  "Casualty",
  "Mutual",
  "Indemnity",
  "Underwriters",
  "Insurance Group",
  "Property & Casualty",
  "Risk Partners",
];

const POLICY_PREFIX_BY_LOB = {
  gl: "GL",
  bop: "BOP",
  auto: "AUTO",
  wc: "WC",
  property: "PROP",
  umbrella: "UMB",
  home: "HOME",
  personal_auto: "AUTO",
  life: "LIFE",
  health: "HLTH",
};

const SYNTHETIC_CARRIER_PATTERNS = [
  /^ams_policy_carrier(?:_[a-z0-9]+)+$/i,
  /^api-carrier(?:_[a-z0-9]+)+$/i,
  /^carrier(?:_[a-z0-9]+)+$/i,
];

const SYNTHETIC_POLICY_PATTERNS = [
  /^ams_pol(?:_[a-z0-9]+)+$/i,
  /^pol(?:_[a-z0-9]+)+$/i,
  /^policy(?:_[a-z0-9]+)+$/i,
  /^pol-[a-z0-9_]+$/i,
];

function isSyntheticCarrierName(name) {
  return SYNTHETIC_CARRIER_PATTERNS.some((pattern) => pattern.test(name.trim()));
}

function isSyntheticPolicyNumber(value) {
  return SYNTHETIC_POLICY_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function hashParts(id) {
  const hash = crypto.createHash("sha256").update(id).digest("hex");
  return {
    a: Number.parseInt(hash.slice(0, 8), 16),
    b: Number.parseInt(hash.slice(8, 16), 16),
    c: Number.parseInt(hash.slice(16, 24), 16),
    shortCode: hash.slice(24, 28).toUpperCase(),
  };
}

function carrierNameForId(carrierId) {
  const { a, b } = hashParts(carrierId);
  return `${CARRIER_PREFIXES[a % CARRIER_PREFIXES.length]} ${CARRIER_SUFFIXES[b % CARRIER_SUFFIXES.length]}`;
}

function policyPrefixForLob(lob) {
  const normalized = String(lob ?? "").trim().toLowerCase();
  return POLICY_PREFIX_BY_LOB[normalized] ?? "INS";
}

function policyNumberForId(policyId, lob) {
  const { a, b } = hashParts(policyId);
  const major = String((a % 9000) + 1000);
  const minor = String((b % 9000) + 1000);
  return `${policyPrefixForLob(lob)}-${major}-${minor}`;
}

function printExamples(label, examples) {
  console.log(label);
  if (examples.length === 0) {
    console.log("(none)");
    return;
  }

  for (const example of examples) {
    console.log(`${example.id} | ${example.before} -> ${example.after}`);
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const carrierRes = await client.query(
      `
        SELECT id, agency_id, name
        FROM carriers
        ORDER BY created_at ASC
      `,
    );

    const carrierNamesByAgency = new Map();
    for (const row of carrierRes.rows) {
      const used = carrierNamesByAgency.get(row.agency_id) ?? new Set();
      used.add(String(row.name ?? "").trim());
      carrierNamesByAgency.set(row.agency_id, used);
    }

    const carrierExamples = [];
    let carriersRenamed = 0;

    for (const row of carrierRes.rows) {
      const currentName = String(row.name ?? "");
      if (!isSyntheticCarrierName(currentName)) {
        continue;
      }

      const used = carrierNamesByAgency.get(row.agency_id) ?? new Set();
      used.delete(currentName.trim());

      const { c, shortCode } = hashParts(row.id);
      let nextName = carrierNameForId(row.id);
      if (used.has(nextName)) {
        nextName = `${nextName} ${shortCode}${c % 9}`;
      }

      used.add(nextName);
      carrierNamesByAgency.set(row.agency_id, used);

      if (nextName === currentName) {
        continue;
      }

      await client.query(
        `
          UPDATE carriers
          SET name = $2
          WHERE id = $1
        `,
        [row.id, nextName],
      );

      carriersRenamed += 1;
      if (carrierExamples.length < 10) {
        carrierExamples.push({ id: row.id, before: currentName, after: nextName });
      }
    }

    const policyRes = await client.query(
      `
        SELECT id, agency_id, lob, policy_number
        FROM policies
        ORDER BY created_at ASC
      `,
    );

    const policyNumbersByAgency = new Map();
    for (const row of policyRes.rows) {
      const used = policyNumbersByAgency.get(row.agency_id) ?? new Set();
      used.add(String(row.policy_number ?? "").trim());
      policyNumbersByAgency.set(row.agency_id, used);
    }

    const policyExamples = [];
    let policiesRenamed = 0;

    for (const row of policyRes.rows) {
      const currentPolicyNumber = String(row.policy_number ?? "");
      if (!isSyntheticPolicyNumber(currentPolicyNumber)) {
        continue;
      }

      const used = policyNumbersByAgency.get(row.agency_id) ?? new Set();
      used.delete(currentPolicyNumber.trim());

      const { c, shortCode } = hashParts(row.id);
      let nextPolicyNumber = policyNumberForId(row.id, row.lob);
      if (used.has(nextPolicyNumber)) {
        nextPolicyNumber = `${nextPolicyNumber}-${shortCode}${c % 9}`;
      }

      used.add(nextPolicyNumber);
      policyNumbersByAgency.set(row.agency_id, used);

      if (nextPolicyNumber === currentPolicyNumber) {
        continue;
      }

      await client.query(
        `
          UPDATE policies
          SET policy_number = $2
          WHERE id = $1
        `,
        [row.id, nextPolicyNumber],
      );

      policiesRenamed += 1;
      if (policyExamples.length < 10) {
        policyExamples.push({
          id: row.id,
          before: currentPolicyNumber,
          after: nextPolicyNumber,
        });
      }
    }

    await client.query("COMMIT");

    console.log(`Policies scanned: ${policyRes.rowCount}`);
    console.log(`Policies renamed: ${policiesRenamed}`);
    printExamples("Policy examples:", policyExamples);
    console.log(`Carriers scanned: ${carrierRes.rowCount}`);
    console.log(`Carriers renamed: ${carriersRenamed}`);
    printExamples("Carrier examples:", carrierExamples);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to normalize dev policy and carrier names.");
  console.error(error);
  process.exit(1);
});
