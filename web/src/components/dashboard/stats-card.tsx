interface StatsCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatsCard({ label, value, change, trend = "neutral" }: StatsCardProps) {
  const trendColor =
    trend === "up"
      ? "#22c55e"
      : trend === "down"
        ? "#ef4444"
        : "#64748b";

  return (
    <div className="card">
      <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px" }}>
        {label}
      </p>
      <p style={{ fontSize: "32px", fontWeight: 700, color: "#f1f5f9" }}>
        {value}
      </p>
      {change && (
        <p style={{ fontSize: "12px", color: trendColor, marginTop: "4px" }}>
          {change}
        </p>
      )}
    </div>
  );
}
