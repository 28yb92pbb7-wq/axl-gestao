"use client";
import { ArrowUpRight } from "lucide-react";
export function Metric({
  label,
  value,
  note,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <article
      className={onClick ? "metric clickable" : "metric"}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && ["Enter", " "].includes(e.key)) {
          e.preventDefault();
          onClick();
        }
      }}
    >
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
