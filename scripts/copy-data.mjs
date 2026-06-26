import { mkdir, copyFile } from "node:fs/promises";

await mkdir("dist/data", { recursive: true });
await copyFile("data/history.json", "dist/data/history.json");
