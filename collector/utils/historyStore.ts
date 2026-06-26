import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DailySnapshot, HistoryFile } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HISTORY_PATH = resolve(__dirname, "../../data/history.json");

export async function readHistory(): Promise<HistoryFile> {
  if (!existsSync(HISTORY_PATH)) {
    return { generatedAt: null, records: [] };
  }

  return JSON.parse(await readFile(HISTORY_PATH, "utf8")) as HistoryFile;
}

export async function upsertToday(snapshot: DailySnapshot): Promise<HistoryFile> {
  const history = await readHistory();
  const recordsByDate = new Map(history.records.map((record) => [record.date, record]));
  recordsByDate.set(snapshot.date, snapshot);

  const next: HistoryFile = {
    generatedAt: new Date().toISOString(),
    records: [...recordsByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    tbtcHistory: history.tbtcHistory ?? []
  };

  await writeHistory(next);
  return next;
}

export async function writeHistory(history: HistoryFile): Promise<void> {
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`);
}
