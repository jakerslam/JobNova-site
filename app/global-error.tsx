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
      <body>
        <main className="grid min-h-screen place-items-center bg-[#ececec] px-6 text-center text-ink">
          <section className="max-w-md rounded-2xl bg-white p-8 shadow-soft">
            <p className="text-sm font-semibold text-violet">Something went wrong</p>
            <h1 className="mt-3 text-2xl font-semibold">JobNova could not load this view.</h1>
            <p className="mt-3 text-sm leading-6 text-muted">{error.message}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 h-11 rounded-full bg-ink px-6 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
