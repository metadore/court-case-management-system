"use client";

import { PieChart as RPieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { PieLabelRenderProps } from "recharts";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
];

interface PieChartProps {
  data: { name: string; value: number }[];
  title?: string;
}

const renderLabel = ({ name, percent }: PieLabelRenderProps) => {
  const pct = percent ? (percent * 100).toFixed(0) : "0";
  return `${name} ${pct}%`;
};

export default function PieChart({ data, title }: PieChartProps) {
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
        <RPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={70}
            fill="#8884d8"
            dataKey="value"
            label={renderLabel}
            labelLine={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </RPieChart>
      </ResponsiveContainer>
    </div>
  );
}
