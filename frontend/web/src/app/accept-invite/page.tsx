"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function AcceptInviteParamRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      router.replace(`/accept-invite/${encodeURIComponent(token)}`);
    }
  }, [token, router]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-amber-400/10 text-amber-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">No Invite Token Provided</h2>
          <p className="mt-2 text-sm text-slate-400">
            Please check the link in the invitation email you received. If you believe this is an error, contact your administrator.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
    </div>
  );
}

export default function AcceptInviteFallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </div>
    }>
      <AcceptInviteParamRedirect />
    </Suspense>
  );
}
