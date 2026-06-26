import type { IsoDate } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const timestamp = new Date(`${date}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid ISO date: ${date}`);
  }

  return new Date(timestamp + days * DAY_MS).toISOString().slice(0, 10);
}

export function dateRangeEveryDays(
  startDate: IsoDate,
  endExclusive: IsoDate,
  intervalDays: number
): IsoDate[] {
  if (!Number.isInteger(intervalDays) || intervalDays <= 0) {
    throw new Error(`BACKFILL_INTERVAL_DAYS must be a positive integer, got ${intervalDays}`);
  }

  const dates: IsoDate[] = [];
  for (let date = startDate; date < endExclusive; date = addDays(date, intervalDays)) {
    dates.push(date);
  }

  return dates;
}
