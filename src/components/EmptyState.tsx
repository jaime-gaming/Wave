import type { ReactNode } from 'react';

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

  symbolClassName?: string;
  title: string;
  description?: string;
  hint?: string;
  actions?: ReactNode;

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
