import type { ReportRow } from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";

const WIDTH = 700;
const HEIGHT = 190;
const TOP = 18;
const BOTTOM = 16;

type Point = { x: number; y: number };

/**
 * The overview metric is the year's net savings, so the trend is the running
 * total of each month's net savings. Keep this bigint-based until rendering so
 * normalising a high-value ledger does not lose precision.
 */
export function cumulativeSavings(rows: readonly ReportRow[]): bigint[] {
  let total = 0n;
  return rows.map((row) => {
    total += row.netSavings;
    return total;
  });
}

export function overviewTrendPaths(values: readonly bigint[]): {
  line: string;
  area: string;
} {
  if (!values.length) return { line: "", area: "" };
  const minimum = values.reduce((lowest, value) =>
    value < lowest ? value : lowest,
  );
  const maximum = values.reduce((highest, value) =>
    value > highest ? value : highest,
  );
  const drawableHeight = HEIGHT - TOP - BOTTOM;
  const spread = maximum - minimum;
  const points: Point[] = values.map((value, index) => ({
    x: values.length === 1 ? WIDTH / 2 : (WIDTH * index) / (values.length - 1),
    y:
      spread === 0n
        ? TOP + drawableHeight / 2
        : TOP +
          drawableHeight -
          (Number(value - minimum) / Number(spread)) * drawableHeight,
  }));
  const line = points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1]!;
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
  }, "");
  return {
    line,
    area: `${line} L ${points.at(-1)!.x} ${HEIGHT} L ${points[0]!.x} ${HEIGHT} Z`,
  };
}

export function OverviewTrendChart({ rows }: { rows: readonly ReportRow[] }) {
  const { line, area } = overviewTrendPaths(cumulativeSavings(rows));
  if (!line) return null;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="finance-overview-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bdd6ca" stopOpacity=".7" />
          <stop offset="1" stopColor="#bdd6ca" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#finance-overview-area)" />
      <path className="finance-chart-line" d={line} />
    </svg>
  );
}
