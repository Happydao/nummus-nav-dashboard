export function attachChartInteractions(root: ParentNode = document): void {
  for (const chart of root.querySelectorAll<HTMLElement>(".interactive-chart")) {
    const dataNode = chart.querySelector<HTMLScriptElement>(".chart-data");
    const capture = chart.querySelector<SVGRectElement>(".hover-capture");
    const crosshair = chart.querySelector<SVGLineElement>(".crosshair");
    const hoverDot = chart.querySelector<SVGCircleElement>(".hover-dot");
    const tooltip = chart.querySelector<HTMLElement>(".chart-tooltip");
    if (!dataNode || !capture || !crosshair || !hoverDot || !tooltip) continue;

    const parsed = JSON.parse(dataNode.textContent ?? "{}") as {
      points: Array<{
        date: string;
        dateLabel?: string;
        value: number;
        label: string;
        x: number;
        y: number;
        series?: Array<{ name: string; label: string; kind: "primary" | "secondary" | "neutral" }>;
      }>;
    };
    const points = parsed.points;
    if (points.length === 0) continue;

    capture.addEventListener("mousemove", (event) => {
      const svg = capture.ownerSVGElement;
      if (!svg) return;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const cursor = point.matrixTransform(svg.getScreenCTM()?.inverse());
      const nearest = points.reduce((best, item) =>
        Math.abs(item.x - cursor.x) < Math.abs(best.x - cursor.x) ? item : best
      );

      crosshair.setAttribute("x1", String(nearest.x));
      crosshair.setAttribute("x2", String(nearest.x));
      hoverDot.setAttribute("cx", String(nearest.x));
      hoverDot.setAttribute("cy", String(nearest.y));
      chart.classList.add("hovering");
      const series = nearest.series?.length
        ? nearest.series
            .map((item) => `<span class="tooltip-row ${item.kind}"><em>${item.name}</em><b>${item.label}</b></span>`)
            .join("")
        : `<span>${nearest.label}</span>`;
      tooltip.innerHTML = `<strong>${nearest.dateLabel ?? nearest.date}</strong>${series}`;
      tooltip.style.left = `${Math.min(Math.max(nearest.x, 90), 650)}px`;
      tooltip.style.top = `${Math.max(nearest.y - 52, 12)}px`;
    });

    capture.addEventListener("mouseleave", () => {
      chart.classList.remove("hovering");
    });
  }
}
