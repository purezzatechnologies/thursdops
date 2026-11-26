import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  badge,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav className="mb-2 flex items-center gap-1 text-xs text-text-tertiary">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {c.to ? (
                  <Link to={c.to} className="hover:text-text-primary">
                    {c.label}
                  </Link>
                ) : (
                  <span>{c.label}</span>
                )}
                {i < crumbs.length - 1 && <span className="text-border">/</span>}
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-bold tracking-tight text-text-primary">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
