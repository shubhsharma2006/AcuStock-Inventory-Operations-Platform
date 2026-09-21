"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-rose-400/10 text-rose-400">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">Page Error</h2>
        <p className="mt-2 text-sm text-slate-400">
          {error.message || "Something went wrong loading this page."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
