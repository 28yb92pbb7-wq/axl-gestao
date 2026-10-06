"use client";
import { ArrowUpRight } from "lucide-react";
export function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: React.ReactNode;
}) {
  return (
    <article className="metric">
      <div className="metric-top">
        <small>{label}</small>
        {icon && <span>{icon}</span>}
      </div>
      <strong>{value}</strong>
      {note && <p>{note}</p>}
    </article>
  );
}
export function PanelHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: () => void;
}) {
  return (
    <header className="panel-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-button green-text" onClick={action}>
          Ver todos
          <ArrowUpRight size={14} />
        </button>
      )}
    </header>
  );
}
