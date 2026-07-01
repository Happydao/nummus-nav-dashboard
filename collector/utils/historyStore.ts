import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DailySnapshot, HistoryFile, HolderCursor } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HISTORY_PATH = resolve(__dirname, "../../data/history.json");
export const SNAPSHOTS_DIR = resolve(__dirname, "../../data/snapshots");
export const HOLDER_STATE_PATH = resolve(__dirname, "../../data/holder-state.json");

export async function readHistory(): Promise<HistoryFile> {
  if (!existsSync(HISTORY_PATH)) {
    return { generatedAt: null, records: [] };
  }

  return JSON.parse(await readFile(HISTORY_PATH, "utf8")) as HistoryFile;
}

export async function readHolderState(): Promise<HolderCursor | null> {
  if (!existsSync(HOLDER_STATE_PATH)) return null;
  return JSON.parse(await readFile(HOLDER_STATE_PATH, "utf8")) as HolderCursor;
}

export async function commitSnapshot(
  snapshot: DailySnapshot,
  history: HistoryFile,
  holderState: HolderCursor
): Promise<void> {
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await mkdir(SNAPSHOTS_DIR, { recursive: true });

  const snapshotPath = resolve(SNAPSHOTS_DIR, `${snapshot.date}.json`);
  const snapshotTempPath = `${snapshotPath}.tmp`;
  const historyTempPath = `${HISTORY_PATH}.tmp`;
  const holderStateTempPath = `${HOLDER_STATE_PATH}.tmp`;

  await writeFile(snapshotTempPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(historyTempPath, `${JSON.stringify(history, null, 2)}\n`);
  await writeFile(holderStateTempPath, `${JSON.stringify(holderState)}\n`);

  // history.json is the dashboard's commit marker, so publish it last.
  await rename(snapshotTempPath, snapshotPath);
  await rename(holderStateTempPath, HOLDER_STATE_PATH);
  await rename(historyTempPath, HISTORY_PATH);
}

export async function writeHistory(history: HistoryFile): Promise<void> {
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`);
}
