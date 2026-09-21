"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-white">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-center backdrop-blur-xl">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-400/10 text-rose-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-400">
              An unexpected error occurred. Our team has been notified.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-slate-500">
                Error ID: {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
