export function kpi(label: string, value: string, details = "", change = ""): string {
  return `
    <section class="kpi${details ? " kpi-with-details" : ""}">
      <span>${label}</span>
      <div class="kpi-value-row"><strong>${value}</strong>${change}</div>
      ${details}
    </section>
  `;
}
