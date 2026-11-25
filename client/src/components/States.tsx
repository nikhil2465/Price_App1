import { AlertTriangle, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl border border-red-100 bg-white p-10 text-center shadow-card">
      <AlertTriangle className="text-red-500" size={36} aria-hidden="true" />
      <p className="mt-3 font-semibold">Something went wrong</p>
      <p className="mt-1 max-w-md text-sm text-ink-500">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-5 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white p-12 text-center shadow-card">
      <SearchX className="text-ink-300" size={44} aria-hidden="true" />
      <p className="mt-4 text-lg font-semibold">{title}</p>
      <div className="mt-1 max-w-md text-sm text-ink-500">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}
