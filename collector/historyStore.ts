import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeneratedHistory, HistoryRecord } from "../src/utils/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HISTORY_PATH = resolve(__dirname, "../data/history.json");

export async function readHistory(): Promise<GeneratedHistory | null> {
  if (!existsSync(HISTORY_PATH)) {
    return null;
  }

  return JSON.parse(await readFile(HISTORY_PATH, "utf8")) as GeneratedHistory;
}

export async function writeHistory(history: GeneratedHistory): Promise<void> {
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`);
}

export function upsertRecords(existing: HistoryRecord[], updates: HistoryRecord[]): HistoryRecord[] {
  const byDate = new Map(existing.map((record) => [record.date, record]));
  for (const update of updates) {
    byDate.set(update.date, update);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function coverageFor(records: HistoryRecord[]): GeneratedHistory["coverage"] {
  return {
    from: records[0]?.date ?? null,
    to: records.at(-1)?.date ?? null,
    recordCount: records.length
  };
}
