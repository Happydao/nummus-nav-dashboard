export function kpi(label: string, value: string, details = ""): string {
  return `
    <section class="kpi${details ? " kpi-with-details" : ""}">
      <span>${label}</span>
      <strong>${value}</strong>
      ${details}
    </section>
  `;
}
