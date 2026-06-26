export function usd(value: number | null): string {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 2 : 6
  }).format(value);
}

export function numberCompact(value: number | null): string {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 3
  }).format(value);
}

export function percent(value: number | null): string {
  if (value === null) return "n/a";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

export function ratio(value: number | null): string {
  if (value === null) return "n/a";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value)}x`;
}
