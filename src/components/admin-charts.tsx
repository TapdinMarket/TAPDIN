'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function MonthlyOrdersChart({ data, label }: { data: { month: string; orders: number }[]; label: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="#e5e3db" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6c6e67' }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6c6e67' }} />
          <Tooltip
            cursor={{ fill: 'rgba(18,19,17,0.04)' }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e5e3db', boxShadow: 'none', fontSize: 13 }}
            formatter={(value) => [value, label]}
          />
          <Bar dataKey="orders" fill="#1e4d3b" radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
