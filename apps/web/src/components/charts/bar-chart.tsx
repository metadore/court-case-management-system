 "use client";

import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface BarChartProps {
  data: Record<string, string | number>[];
  bars: { dataKey: string; color: string; name?: string }[];
  title?: string;
  xAxisKey?: string;
}

export default function BarChart({ data, bars, title, xAxisKey = "month" }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-4">
        {title && <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>}
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">No data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      {title && <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>}
      <ResponsiveContainer width="100%" height={220}>
        <RBarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              fill={bar.color}
              name={bar.name ?? bar.dataKey}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}