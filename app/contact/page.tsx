import Link from "next/link";

export const metadata = {
  title: "Contact - Master Grid",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen">
      <header className="max-w-3xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-brand-300">
          Master Grid
        </Link>
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">
          &larr; Back home
        </Link>
      </header>

      <article className="max-w-3xl mx-auto w-full px-6 py-8 space-y-6 text-sm text-slate-300">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Contact us</h1>
          <p className="text-slate-500">Last updated: July 2026</p>
        </div>

        <p>
          Have a question, found a bug, or want to flag a question that looks wrong? We read
          every message that comes in and generally reply within a couple of days.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Email</h2>
          <p>
            The fastest way to reach us is{" "}
            <a
              href="mailto:cherryyeshmith84@gmail.com"
              className="text-brand-400 hover:text-brand-300"
            >
              cherryyeshmith84@gmail.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">What to include</h2>
          <p className="mb-2">
            If you&apos;re reporting a bug or a problem with a specific question, it helps a lot
            to include:
          </p>
          <p className="mb-2">The page or question you were on when it happened.</p>
          <p className="mb-2">What you expected to happen versus what actually happened.</p>
          <p>A screenshot, if you have one.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Account and data requests</h2>
          <p>
            For account deletion, data export, or other privacy-related requests, see our{" "}
            <Link href="/privacy" className="text-brand-400 hover:text-brand-300">
              Privacy Policy
            </Link>{" "}
            or email us directly - we handle these individually.
          </p>
        </section>
      </article>
    </main>
  );
}
