import { useEffect, useRef, type ReactNode } from 'react';
import type { Tone } from '../lib/derive';
import { navigate } from '../router';
import { IconX } from './icons';

export function Badge({ tone = 'neutral', children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge tone-${tone}`}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Link({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode; 'aria-current'?: 'page' | undefined }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Alert({ tone, children, onClose }: { tone: 'bad' | 'warn' | 'good' | 'info'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`alert tone-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <div>{children}</div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} aria-label="Dismiss">
          <IconX size={16} />
        </button>
      )}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <span className="skeleton" style={{ height: h, width: w }} aria-hidden="true" />;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** Accessible modal: focus moves in, Escape closes, focus returns to the opener. */
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <IconX size={18} />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}

export const Mono = ({ children }: { children: ReactNode }) => <code className="mono">{children}</code>;
