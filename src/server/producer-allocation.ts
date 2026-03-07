import type { PoolClient } from "pg";

export type ProducerAllocationSuggestion = {
  split_id: string;
  producer_id: string;
  split_percent: number | null;
  split_flat: number | null;
  amount: number;
};

export type ProducerAllocationResult = {
  policy_transaction_id: string;
  policy_id: string;
  allocation_date: string;
  allocation_basis: "commission_delta" | "cash_delta";
  basis_amount: number;
  allocated_total: number;
  unallocated_amount: number;
  suggestions: ProducerAllocationSuggestion[];
};

export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationError";
  }
}

type PolicyTransactionRow = {
  id: string;
  policy_id: string;
  transaction_date: string;
  effective_date: string | null;
  status: string;
  revenue_event: string;
  commission_delta: number | string | null;
  cash_delta: number | string | null;
};

type CommissionSplitRow = {
  id: string;
  producer_id: string;
  split_percent: number | string | null;
  split_flat: number | string | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

export async function allocateTransactionToProducers(
  client: PoolClient,
  policyTransactionId: string,
): Promise<ProducerAllocationResult> {
  const txRes = await client.query<PolicyTransactionRow>(
    `
      SELECT
        id,
        policy_id,
        transaction_date,
        effective_date,
        status,
        revenue_event,
        commission_delta,
        cash_delta
      FROM policy_transactions
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [policyTransactionId],
  );

  const transaction = txRes.rows[0];

  if (!transaction) {
    throw new AllocationError("Policy transaction not found.");
  }

  if (transaction.status === "void") {
    throw new AllocationError("Cannot allocate a void transaction.");
  }

  const allocationDate = transaction.effective_date ?? transaction.transaction_date;
  const allocationBasis =
    transaction.revenue_event === "paid" ? "cash_delta" : "commission_delta";
  const basisAmount =
    allocationBasis === "cash_delta"
      ? toNumber(transaction.cash_delta)
      : toNumber(transaction.commission_delta);

  const splitsRes = await client.query<CommissionSplitRow>(
    `
      WITH ranked_splits AS (
        SELECT
          id,
          producer_id,
          split_percent,
          split_flat,
          effective_date,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY producer_id
            ORDER BY effective_date DESC, created_at DESC, id DESC
          ) AS rank_for_producer
        FROM commission_splits
        WHERE policy_id = $1
          AND deleted_at IS NULL
          AND status = 'active'
          AND effective_date <= $2::date
      )
      SELECT
        id,
        producer_id,
        split_percent,
        split_flat
      FROM ranked_splits
      WHERE rank_for_producer = 1
      ORDER BY producer_id ASC
    `,
    [transaction.policy_id, allocationDate],
  );

  if (splitsRes.rowCount === 0) {
    throw new AllocationError("No active commission splits found for this transaction date.");
  }

  const suggestions = splitsRes.rows.map((split) => {
    const splitPercent = split.split_percent === null ? null : toNumber(split.split_percent);
    const splitFlat = split.split_flat === null ? null : toNumber(split.split_flat);

    const calculatedAmount = roundCurrency(
      basisAmount * (splitPercent ?? 0) + (splitFlat ?? 0),
    );

    return {
      split_id: split.id,
      producer_id: split.producer_id,
      split_percent: splitPercent,
      split_flat: splitFlat,
      amount: calculatedAmount,
    } satisfies ProducerAllocationSuggestion;
  });

  const allocatedTotal = roundCurrency(
    suggestions.reduce((sum, suggestion) => sum + suggestion.amount, 0),
  );

  return {
    policy_transaction_id: transaction.id,
    policy_id: transaction.policy_id,
    allocation_date: allocationDate,
    allocation_basis: allocationBasis,
    basis_amount: roundCurrency(basisAmount),
    allocated_total: allocatedTotal,
    unallocated_amount: roundCurrency(basisAmount - allocatedTotal),
    suggestions,
  };
}
