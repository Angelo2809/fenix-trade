"use client";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { Dashboard, Account, accountName } from "@/lib/types";
import { money } from "@/lib/api";
const colors = ["#e9ba67", "#439edf", "#62bbab", "#8b92c9", "#c17d50"];
const tooltip = {
  background: "#0b1925",
  border: "1px solid #344553",
  borderRadius: 8,
  color: "#f5ead9",
  fontSize: 13,
};
const compact = (v: number) =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toLocaleString("pt-BR")} mil`
    : v.toLocaleString("pt-BR");
export function EvolutionChart({ data }: { data: Dashboard["evolution"] }) {
  const rows = data.map((x) => ({
    ...x,
    result: Number(x.result),
    balance: Number(x.balance),
    paid: Number(x.paid),
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label="Evolução diária do resultado acumulado e dos repasses"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={rows}
          margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient id="resultFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e9ba67" stopOpacity={0.23} />
              <stop offset="100%" stopColor="#e9ba67" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#20313d"
            strokeDasharray="2 3"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v) =>
              String(v).slice(5).split("-").reverse().join("/")
            }
            stroke="#7c8c9b"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            minTickGap={32}
          />
          <YAxis
            tickFormatter={compact}
            stroke="#7c8c9b"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={60}
          />
          <Tooltip
            contentStyle={tooltip}
            formatter={(value) => money(Number(value))}
            labelFormatter={(v) => String(v).split("-").reverse().join("/")}
          />
          <ReferenceLine y={0} stroke="#53636f" />
          <Area
            type="linear"
            dataKey="result"
            name="Resultado acumulado"
            stroke="#edbf70"
            strokeWidth={2}
            fill="url(#resultFill)"
            isAnimationActive={false}
            dot={rows.length === 1}
          />
          <Area
            type="stepAfter"
            dataKey="paid"
            name="Repasses recebidos"
            stroke="#439edf"
            strokeWidth={1.8}
            fill="none"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function MonthlyChart({ data }: { data: Dashboard["monthly"] }) {
  const rows = data.map((x) => ({ ...x, confirmed: Number(x.confirmed) }));
  return (
    <div
      className="chart monthly-chart"
      role="img"
      aria-label="Resultado mensal em reais, com eixo positivo e negativo"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#20313d"
            vertical={false}
            strokeDasharray="2 3"
          />
          <XAxis
            dataKey="month"
            stroke="#7c8c9b"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            tickFormatter={(v) =>
              `${String(v).slice(5)}/${String(v).slice(2, 4)}`
            }
          />
          <YAxis
            tickFormatter={compact}
            stroke="#7c8c9b"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={60}
          />
          <Tooltip contentStyle={tooltip} formatter={(v) => money(Number(v))} />
          <ReferenceLine y={0} stroke="#73828c" />
          <Bar
            dataKey="confirmed"
            name="Resultado confirmado"
            maxBarSize={36}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          >
            {rows.map((x, i) => (
              <Cell key={i} fill={x.confirmed < 0 ? "#e7756e" : "#50c397"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function AllocationChart({ accounts }: { accounts: Account[] }) {
  const data = accounts
    .filter((a) => a.initial_capital)
    .map((a) => ({ name: accountName(a), value: Number(a.initial_capital) }));
  return (
    <div className="allocation">
      <div className="donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="68%"
              outerRadius="93%"
              stroke="#091723"
              strokeWidth={3}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltip}
              formatter={(v) => money(Number(v))}
            />
          </PieChart>
        </ResponsiveContainer>
        <span>
          {data.length}
          <small>{data.length === 1 ? "mesa" : "mesas"}</small>
        </span>
      </div>
      <ul>
        {data.map((x, i) => (
          <li key={i}>
            <i style={{ background: colors[i % colors.length] }} />
            <span>{x.name}</span>
            <b>
              {(
                (x.value / data.reduce((s, d) => s + d.value, 0)) *
                100
              ).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              %
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
