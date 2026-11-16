'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function MonthlyOrdersChart({ data, label }: { data: { month: string; orders: number }[]; label: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="#20201e" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8b8a84' }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8b8a84' }} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ borderRadius: 12, border: '1px solid #33332f', boxShadow: 'none', fontSize: 13, background: '#171716' }}
            labelStyle={{ color: '#8b8a84' }}
            itemStyle={{ color: '#f4f2ec' }}
            formatter={(value) => [value, label]}
          />
          <Bar dataKey="orders" fill="#ff5a1f" radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
