export type ChartZoomAction = "in" | "out" | "reset";

interface ChartInteractionOptions {
  onZoom?: (chartId: string, action: ChartZoomAction, anchor: number) => void;
  onPan?: (chartId: string, delta: number) => void;
}

interface InteractivePoint {
  date: string;
  dateLabel?: string;
  value: number;
  label: string;
  x: number;
  y: number;
  series?: Array<{
    name: string;
    label: string;
    kind: "primary" | "secondary" | "neutral";
    color?: string;
  }>;
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
    const resetButton = chart.querySelector<HTMLButtonElement>('[data-chart-zoom="reset"]');
    const isZoomed = (): boolean => Boolean(resetButton && !resetButton.disabled);

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
                `<span class="tooltip-row ${item.kind}">${item.color ? `<i class="tooltip-swatch" style="background:${item.color}"></i>` : ""}<em>${escapeHtml(item.name)}</em><b${item.color ? ` style="color:${item.color}"` : ""}>${escapeHtml(item.label)}</b></span>`
            )
            .join("")
        : `<span>${escapeHtml(nearest.label)}</span>`;
      tooltip.innerHTML = `<strong>${escapeHtml(nearest.dateLabel ?? nearest.date)}</strong>${series}`;
      const screenPoint = svg.createSVGPoint();
      screenPoint.x = nearest.x;
      screenPoint.y = nearest.y;
      const screenPosition = screenPoint.matrixTransform(matrix);
      const chartBounds = chart.getBoundingClientRect();
      const halfTooltipWidth = Math.min(tooltip.offsetWidth / 2, Math.max(0, chartBounds.width / 2 - 12));
      const left = Math.max(
        halfTooltipWidth + 12,
        Math.min(chartBounds.width - halfTooltipWidth - 12, screenPosition.x - chartBounds.left)
      );
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(screenPosition.y - chartBounds.top - 52, 12)}px`;
    };

    capture.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" && !event.isPrimary) return;
      if (chart.classList.contains("panning")) return;
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

    let wheelZoomDelta = 0;
    let wheelZoomAnchor = 0.5;
    let wheelPanDelta = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    const flushWheel = (): void => {
      if (wheelZoomDelta !== 0) {
        options.onZoom?.(chartId, wheelZoomDelta < 0 ? "in" : "out", wheelZoomAnchor);
      } else if (wheelPanDelta !== 0 && isZoomed()) {
        options.onPan?.(chartId, wheelPanDelta);
      }
      wheelZoomDelta = 0;
      wheelPanDelta = 0;
      wheelTimer = null;
    };

    capture.addEventListener(
      "wheel",
      (event) => {
        const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
        if ((event.ctrlKey || event.metaKey) && options.onZoom) {
          event.preventDefault();
          wheelZoomDelta += event.deltaY;
          wheelZoomAnchor = pointerAnchor(capture, event.clientX);
        } else if (horizontal && isZoomed() && options.onPan) {
          event.preventDefault();
          wheelPanDelta += event.deltaX / Math.max(1, capture.getBoundingClientRect().width);
        } else {
          return;
        }
        if (wheelTimer) clearTimeout(wheelTimer);
        wheelTimer = setTimeout(flushWheel, 70);
      },
      { passive: false }
    );

    let gesture:
      | { kind: "pinch"; startDistance: number; scale: number; centerX: number }
      | { kind: "pan"; startX: number; startY: number; deltaX: number; deltaY: number }
      | null = null;
    capture.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length === 2) {
          gesture = {
            kind: "pinch",
            startDistance: touchDistance(event.touches),
            scale: 1,
            centerX: (event.touches[0].clientX + event.touches[1].clientX) / 2
          };
        } else if (event.touches.length === 1 && isZoomed()) {
          gesture = {
            kind: "pan",
            startX: event.touches[0].clientX,
            startY: event.touches[0].clientY,
            deltaX: 0,
            deltaY: 0
          };
        }
      },
      { passive: true }
    );
    capture.addEventListener(
      "touchmove",
      (event) => {
        if (gesture?.kind === "pinch" && event.touches.length === 2) {
          event.preventDefault();
          gesture.scale = touchDistance(event.touches) / gesture.startDistance;
          chart.classList.add("panning");
        } else if (gesture?.kind === "pan" && event.touches.length === 1) {
          gesture.deltaX = event.touches[0].clientX - gesture.startX;
          gesture.deltaY = event.touches[0].clientY - gesture.startY;
          if (Math.abs(gesture.deltaX) > 8 && Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY)) {
            event.preventDefault();
            chart.classList.add("panning");
          }
        }
      },
      { passive: false }
    );
    capture.addEventListener("touchend", () => {
      if (gesture?.kind === "pinch" && options.onZoom) {
        if (gesture.scale > 1.05 || gesture.scale < 0.95) {
          options.onZoom(
            chartId,
            gesture.scale > 1 ? "in" : "out",
            pointerAnchor(capture, gesture.centerX)
          );
        }
      } else if (gesture?.kind === "pan" && options.onPan && chart.classList.contains("panning")) {
        options.onPan(
          chartId,
          -gesture.deltaX / Math.max(1, capture.getBoundingClientRect().width)
        );
      }
      gesture = null;
      chart.classList.remove("panning");
    });

    let mousePanStart: number | null = null;
    let mousePanDelta = 0;
    capture.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !isZoomed()) return;
      mousePanStart = event.clientX;
      mousePanDelta = 0;
      capture.setPointerCapture(event.pointerId);
      chart.classList.add("panning");
    });
    capture.addEventListener("pointermove", (event) => {
      if (mousePanStart === null || event.pointerType !== "mouse") return;
      mousePanDelta = event.clientX - mousePanStart;
    });
    const finishMousePan = (event: PointerEvent): void => {
      if (mousePanStart === null) return;
      if (Math.abs(mousePanDelta) > 3) {
        options.onPan?.(
          chartId,
          -mousePanDelta / Math.max(1, capture.getBoundingClientRect().width)
        );
      }
      mousePanStart = null;
      mousePanDelta = 0;
      chart.classList.remove("panning");
      if (capture.hasPointerCapture(event.pointerId)) capture.releasePointerCapture(event.pointerId);
    };
    capture.addEventListener("pointerup", finishMousePan);
    capture.addEventListener("pointercancel", finishMousePan);
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
