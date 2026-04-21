import { RRule } from "rrule";

/**
 * Expand a RRULE string into concrete dates within [rangeStart, rangeEnd].
 *
 * @param ruleString  Standard RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE"
 * @param dtstart     The DTSTART for the rule (used as origin)
 * @param rangeStart  Inclusive range start
 * @param rangeEnd    Inclusive range end
 */
export function expandRRule(
  ruleString: string,
  dtstart: Date,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  try {
    const rule = RRule.fromString(ruleString.includes("DTSTART") ? ruleString : ruleString);
    // Build a new rule with the correct dtstart
    const opts = { ...RRule.parseString(ruleString), dtstart };
    const rrule = new RRule(opts);
    return rrule.between(rangeStart, rangeEnd, true /* inclusive */);
  } catch {
    return [];
  }
}

/**
 * Validate a RRULE string.
 */
export function validateRRule(ruleString: string): { valid: boolean; error?: string } {
  try {
    RRule.parseString(ruleString);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
