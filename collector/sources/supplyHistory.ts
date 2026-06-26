import type { SupplyCursor, SupplySnapshot } from "../types.js";
import { BURN_WALLET, NUMMUS_MINT } from "../utils/constants.js";
import { round } from "../utils/math.js";
import { HeliusClient } from "./helius.js";

interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  transactionError: unknown;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount: number;
    mint: string;
  }>;
}

interface BurnEvent {
  signature: string;
  date: string;
  amount: number;
}

export async function collectSupplyHistory(
  currentSupply: number,
  existingHistory: SupplySnapshot[] = [],
  existingCursor?: SupplyCursor,
  helius = new HeliusClient()
): Promise<{ history: SupplySnapshot[]; cursor: SupplyCursor }> {
  const processedSignatures = new Set(existingCursor?.processedSignatures ?? []);
  const burnEvents = await collectNewBurnEvents(processedSignatures, Boolean(existingCursor), helius);
  const allProcessedSignatures = new Set([
    ...processedSignatures,
    ...burnEvents.map((event) => event.signature)
  ]);
  const totalBurned = round((existingCursor?.totalBurned ?? 0) + sumBurns(burnEvents)) ?? 0;

  if (existingCursor && burnEvents.length === 0) {
    return {
      history: existingHistory,
      cursor: {
        processedSignatures: [...allProcessedSignatures],
        totalBurned
      }
    };
  }

  const fullBurnEvents = await collectNewBurnEvents(new Set(), false, helius);
  return {
    history: rebuildSupplyHistoryFromCurrent(currentSupply, fullBurnEvents),
    cursor: {
      processedSignatures: [...new Set(fullBurnEvents.map((event) => event.signature))],
      totalBurned: sumBurns(fullBurnEvents)
    }
  };
}

async function collectNewBurnEvents(
  processedSignatures: Set<string>,
  stopAtKnown: boolean,
  helius: HeliusClient
): Promise<BurnEvent[]> {
  const events: BurnEvent[] = [];
  let before: string | undefined;

  for (let page = 0; page < 50; page += 1) {
    const batch = await helius.getEnhancedTransactionsByAddress<HeliusEnhancedTransaction>(
      BURN_WALLET,
      { limit: 100, before }
    );

    if (batch.length === 0) break;
    for (const tx of batch) {
      if (stopAtKnown && processedSignatures.has(tx.signature)) {
        return events;
      }

      const burnAmount = extractBurnAmount(tx);
      if (burnAmount !== null) {
        events.push({
          signature: tx.signature,
          date: new Date(tx.timestamp * 1000).toISOString().slice(0, 10),
          amount: burnAmount
        });
      }
    }

    before = batch.at(-1)?.signature;
    if (batch.length < 100) break;
  }

  return events;
}

function extractBurnAmount(tx: HeliusEnhancedTransaction): number | null {
  if (tx.transactionError !== null) return null;

  const burn = tx.tokenTransfers?.find(
    (transfer) =>
      transfer.mint === NUMMUS_MINT &&
      transfer.fromUserAccount === BURN_WALLET &&
      !transfer.toUserAccount
  );

  return burn?.tokenAmount ?? null;
}

function rebuildSupplyHistoryFromCurrent(
  currentSupply: number,
  burnEvents: BurnEvent[]
): SupplySnapshot[] {
  const chronological = [...burnEvents].sort((a, b) => a.date.localeCompare(b.date));
  const burnedByDate = new Map<string, number>();
  for (const event of chronological) {
    burnedByDate.set(event.date, (burnedByDate.get(event.date) ?? 0) + event.amount);
  }

  const dailyBurns = [...burnedByDate.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalBurned = sumBurns(dailyBurns);
  let cumulative = 0;

  return dailyBurns.map((burn) => {
    cumulative += burn.amount;
    return {
      date: burn.date,
      supply: round(currentSupply + totalBurned - cumulative) ?? currentSupply,
      burnedCumulative: round(cumulative) ?? cumulative
    };
  });
}

function sumBurns(events: Array<{ amount: number }>): number {
  return round(events.reduce((sum, event) => sum + event.amount, 0)) ?? 0;
}
