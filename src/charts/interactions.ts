export type ChartZoomAction = "in" | "out" | "reset";

interface ChartInteractionOptions {
  onZoom?: (chartId: string, action: ChartZoomAction, anchor: number) => void;
}

interface InteractivePoint {
  date: string;
  dateLabel?: string;
  value: number;
  label: string;
  x: number;
  y: number;
  series?: Array<{ name: string; label: string; kind: "primary" | "secondary" | "neutral" }>;
}

export function attachChartInteractions(
  root: ParentNode = document,
  options: ChartInteractionOptions = {}
): void {
  for (const chart of root.querySelectorAll<HTMLElement>(".interactive-chart")) {
    const dataNode = chart.querySelector<HTMLScriptElement>(".chart-data");
    const capture = chart.querySelector<SVGRectElement>(".hover-capture");
    const crosshair = chart.querySelector<SVGLineElement>(".crosshair");
    const hoverDot = chart.querySelector<SVGCircleElement>(".hover-dot");
    const tooltip = chart.querySelector<HTMLElement>(".chart-tooltip");
    const chartId = chart.dataset.chartId;
    if (!dataNode || !capture || !crosshair || !hoverDot || !tooltip || !chartId) continue;

    const parsed = JSON.parse(dataNode.textContent ?? "{}") as { points: InteractivePoint[] };
    const points = parsed.points;
    if (points.length === 0) continue;

    const showNearest = (clientX: number, clientY: number): void => {
      const svg = capture.ownerSVGElement;
      if (!svg) return;
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const cursor = point.matrixTransform(matrix.inverse());
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
            .map(
              (item) =>
                `<span class="tooltip-row ${item.kind}"><em>${item.name}</em><b>${item.label}</b></span>`
            )
            .join("")
        : `<span>${nearest.label}</span>`;
      tooltip.innerHTML = `<strong>${nearest.dateLabel ?? nearest.date}</strong>${series}`;
      tooltip.style.left = `${Math.min(Math.max(nearest.x, 90), 650)}px`;
      tooltip.style.top = `${Math.max(nearest.y - 52, 12)}px`;
    };

    capture.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" && !event.isPrimary) return;
      showNearest(event.clientX, event.clientY);
    });

    capture.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch") chart.classList.remove("hovering");
    });

    for (const button of chart.querySelectorAll<HTMLButtonElement>("[data-chart-zoom]")) {
      button.addEventListener("click", () => {
        const action = button.dataset.chartZoom as ChartZoomAction;
        options.onZoom?.(chartId, action, 0.5);
      });
    }

    capture.addEventListener(
      "wheel",
      (event) => {
        if (!options.onZoom) return;
        event.preventDefault();
        options.onZoom(chartId, event.deltaY < 0 ? "in" : "out", pointerAnchor(capture, event.clientX));
      },
      { passive: false }
    );

    let pinchDistance: number | null = null;
    capture.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length === 2) pinchDistance = touchDistance(event.touches);
      },
      { passive: true }
    );
    capture.addEventListener(
      "touchmove",
      (event) => {
        if (!options.onZoom || event.touches.length !== 2 || pinchDistance === null) return;
        event.preventDefault();
        const nextDistance = touchDistance(event.touches);
        const ratio = nextDistance / pinchDistance;
        if (ratio > 1.08 || ratio < 0.92) {
          const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
          options.onZoom(chartId, ratio > 1 ? "in" : "out", pointerAnchor(capture, centerX));
          pinchDistance = nextDistance;
        }
      },
      { passive: false }
    );
    capture.addEventListener("touchend", () => {
      pinchDistance = null;
    });
  }
}

function pointerAnchor(capture: SVGRectElement, clientX: number): number {
  const bounds = capture.getBoundingClientRect();
  if (bounds.width <= 0) return 0.5;
  return Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
}

function touchDistance(touches: TouchList): number {
  const x = touches[0].clientX - touches[1].clientX;
  const y = touches[0].clientY - touches[1].clientY;
  return Math.hypot(x, y);
}
