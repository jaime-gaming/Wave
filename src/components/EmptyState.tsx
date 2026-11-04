import type { ReactNode } from 'react';

/**
 * The one shape an empty or failed view takes.
 *
 * Every screen says the same thing in the same order — symbol, what happened,
 * what the listener can do — instead of each panel inventing its own wording and
 * spacing. `announce` marks the block as a live status for views that appear in
 * response to an action, such as a search that found nothing.
 */
export function EmptyState({
  icon,
  symbolClassName = 'empty-symbol',
  title,
  description,
  hint,
  actions,
  level = 2,
  announce = false,
  className,
}: {
  icon?: ReactNode;
  /** Class for the symbol box, so a panel can keep its own proportion. */
  symbolClassName?: string;
  title: string;
  description?: string;
  hint?: string;
  actions?: ReactNode;
  /** Heading level: 3 inside a panel that already has its own heading. */
  level?: 2 | 3;
  announce?: boolean;
  className?: string;
}) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <div
      className={`empty-state${className ? ` ${className}` : ''}`}
      role={announce ? 'status' : undefined}
    >
      {icon != null && (
        <div className={symbolClassName} aria-hidden="true">
          {icon}
        </div>
      )}
      <Heading>{title}</Heading>
      {description && <p>{description}</p>}
      {hint && <span>{hint}</span>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}
