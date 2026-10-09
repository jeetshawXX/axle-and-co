import { useId } from 'react';

export function Stars({ value, size = 16 }) {
  const full = Math.round(value || 0);
  return (
    <span className="stars" role="img" aria-label={`${value || 0} out of 5 stars`} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= full ? 'on' : ''} aria-hidden="true">★</span>)}
    </span>
  );
}

export function RatingInput({ value, onChange }) {
  return (
    <div className="rating-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

export function Qty({ value, max = 99, onChange, label = 'Quantity' }) {
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease quantity" onClick={() => onChange(value - 1)} disabled={value <= 0}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="Increase quantity" onClick={() => onChange(value + 1)} disabled={value >= max}>+</button>
    </div>
  );
}

export function Field({ label, error, hint, children, className = '' }) {
  const id = useId();
  const child = children({ id, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined });
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {child}
      {hint && !error && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="error-text" id={`${id}-err`}>{error}</p>}
    </div>
  );
}

export const Spinner = ({ label = 'Loading' }) => <div className="spinner" role="status" aria-label={label}><span /><span /><span /></div>;

export const Notice = ({ kind = 'info', children }) => <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;

export const Empty = ({ title, children }) => (
  <div className="empty"><h3>{title}</h3>{children}</div>
);
