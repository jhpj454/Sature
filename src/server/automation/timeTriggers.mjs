/**
 * Evaluate generic "N days before expiration" triggers.
 * Many AMS platforms support configurable renewal ticklers/suspenses at day offsets.
 */

function toUtcMidnightDate(value) {
  const asDate = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return new Date(Date.UTC(asDate.getUTCFullYear(), asDate.getUTCMonth(), asDate.getUTCDate()));
}

function daysBetweenUtc(startDate, endDate) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay);
}

export function normalizeServiceCasePriority(priority) {
  if (
    priority === "low" ||
    priority === "normal" ||
    priority === "high" ||
    priority === "urgent"
  ) {
    return priority;
  }

  // Defensive fallback for historical data; migration normalizes active rules.
  if (priority === "medium") {
    return "normal";
  }

  return "high";
}

/**
 * CRMs often trigger automation based on next expiration date and day-window touchpoints.
 */
export function evaluatePolicyExpirationOffsets({
  agencyId,
  policyId,
  expirationDate,
  offsetDaysList,
  referenceDate = new Date(),
}) {
  const refDate = toUtcMidnightDate(referenceDate);
  const expDate = toUtcMidnightDate(expirationDate);
  const daysUntilExpiration = daysBetweenUtc(refDate, expDate);

  const uniqueOffsets = [...new Set(offsetDaysList)]
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0);

  return uniqueOffsets
    .filter((offsetDays) => offsetDays === daysUntilExpiration)
    .map((offsetDays) => ({
      type: "POLICY_EXPIRATION_OFFSET",
      offsetDays,
      policyId,
      agencyId,
      effectiveDate: expDate.toISOString().slice(0, 10),
    }));
}
