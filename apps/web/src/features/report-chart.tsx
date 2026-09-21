import { theme } from "antd";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartRow = {
  name: string;
  income: number;
  expenses: number;
  netSavings: number;
  variance: number | null;
};
export function ReportChart({
  rows,
  kind,
  format,
}: {
  rows: ChartRow[];
  kind: "cashflow" | "savings" | "categories";
  format: (value: unknown) => string;
}) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const axes = (
    <>
      <CartesianGrid
        stroke={token.colorBorderSecondary}
        strokeDasharray="3 3"
        vertical={false}
      />
      <XAxis
        dataKey="name"
        tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        tickFormatter={format}
        tick={{ fill: token.colorTextSecondary, fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={80}
      />
      <Tooltip
        formatter={format}
        contentStyle={{
          background: token.colorBgElevated,
          borderColor: token.colorBorder,
          borderRadius: token.borderRadius,
        }}
      />
      <Legend iconType="circle" />
    </>
  );
  return (
    <ResponsiveContainer width="100%" height={280}>
      {kind === "savings" ? (
        <LineChart
          data={rows}
          accessibilityLayer
          margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
        >
          {axes}
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="netSavings"
            name={t("netSavings")}
            stroke={token.colorPrimary}
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="variance"
            name={t("variance")}
            stroke={token.colorSuccess}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        </LineChart>
      ) : (
        <BarChart
          data={rows}
          accessibilityLayer
          barCategoryGap="25%"
          margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
        >
          {axes}
          {kind !== "categories" && (
            <Bar
              isAnimationActive={false}
              dataKey="income"
              name={t("income")}
              fill={token.colorPrimary}
              radius={[4, 4, 0, 0]}
            />
          )}
          <Bar
            isAnimationActive={false}
            dataKey="expenses"
            name={t("expenses")}
            fill={token.colorInfoBorder}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
