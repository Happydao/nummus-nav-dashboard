export function kpi(label: string, value: string): string {
  return `
    <section class="kpi">
      <span>${label}</span>
      <strong>${value}</strong>
    </section>
  `;
}
