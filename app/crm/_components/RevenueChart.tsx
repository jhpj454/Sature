"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RevenueChartProps {
  data: { month: string; won_revenue: number }[];
}

function shortMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-US", { month: "short" });
}

function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value}`;
}

function formatTooltip(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function RevenueChart({ data }: RevenueChartProps) {
  const chartData = data.map((d) => ({
    label: shortMonth(d.month),
    won_revenue: d.won_revenue,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3762e3" stopOpacity={0.20} />
            <stop offset="95%" stopColor="#3762e3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "hsl(0,0%,50%)", fontFamily: "var(--font-instrument-sans)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 12, fill: "hsl(0,0%,50%)", fontFamily: "var(--font-instrument-sans)" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          formatter={(value) => [typeof value === "number" ? formatTooltip(value) : "$0", "Won Revenue"]}
          contentStyle={{
            background: "rgba(30,35,50,0.95)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            fontSize: 13,
            fontFamily: "var(--font-instrument-sans)",
            color: "hsl(0,0%,100%)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
          labelStyle={{ color: "hsl(0,0%,50%)" }}
          cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1, strokeDasharray: "4 2" }}
        />
        <Area
          type="monotone"
          dataKey="won_revenue"
          stroke="#3762e3"
          strokeWidth={2}
          fill="url(#revenueGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#3762e3", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
