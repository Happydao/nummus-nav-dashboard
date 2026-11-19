import { mkdir, readFile, writeFile } from "node:fs/promises";
import { frozenHistory, maintenance } from "../src/utils/maintenance.ts";

const history = JSON.parse(await readFile("data/history.json", "utf8"));
const published = frozenHistory(history);
if (maintenance.enabled) {
  published.maintenance = { frozenAsOf: maintenance.frozenDate, repeatedPointsAreObservations: false };
}
await mkdir("dist/data", { recursive: true });
await writeFile("dist/data/history.json", JSON.stringify(published, null, 2) + "\n");
