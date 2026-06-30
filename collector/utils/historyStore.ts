import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DailySnapshot, HistoryFile } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HISTORY_PATH = resolve(__dirname, "../../data/history.json");
export const SNAPSHOTS_DIR = resolve(__dirname, "../../data/snapshots");

export async function readHistory(): Promise<HistoryFile> {
  if (!existsSync(HISTORY_PATH)) {
    return { generatedAt: null, records: [] };
  }

  return JSON.parse(await readFile(HISTORY_PATH, "utf8")) as HistoryFile;
}

export async function commitSnapshot(snapshot: DailySnapshot, history: HistoryFile): Promise<void> {
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await mkdir(SNAPSHOTS_DIR, { recursive: true });

  const snapshotPath = resolve(SNAPSHOTS_DIR, `${snapshot.date}.json`);
  const snapshotTempPath = `${snapshotPath}.tmp`;
  const historyTempPath = `${HISTORY_PATH}.tmp`;

  await writeFile(snapshotTempPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(historyTempPath, `${JSON.stringify(history, null, 2)}\n`);

  // history.json is the dashboard's commit marker, so publish it last.
  await rename(snapshotTempPath, snapshotPath);
  await rename(historyTempPath, HISTORY_PATH);
}

export async function writeHistory(history: HistoryFile): Promise<void> {
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`);
}
