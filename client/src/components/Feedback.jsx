import { AlertCircle, LoaderCircle } from 'lucide-react';

export function LoadingState({ label = 'Loading' }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={18} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorMessage({ error, fallback = 'Something went wrong. Try again.' }) {
  if (!error) return null;
  const message = error.graphQLErrors?.[0]?.message || error.message || fallback;
  return (
    <div className="error-message" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, detail, action }) {
  return (
    <div className="empty-state">
      <div className="empty-mark" aria-hidden="true">+</div>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}
