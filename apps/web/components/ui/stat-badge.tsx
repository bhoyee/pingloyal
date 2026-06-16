export function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {label}
      <span className="font-semibold">{value}</span>
    </span>
  );
}
