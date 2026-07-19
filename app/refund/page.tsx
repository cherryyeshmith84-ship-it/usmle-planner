import Link from "next/link";

export const metadata = {
  title: "Refund Policy - Master Grid",
};

export default function RefundPage() {
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
          <h1 className="text-2xl font-bold text-white mb-1">Refund Policy</h1>
          <p className="text-slate-500">Last updated: July 2026</p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Currently free</h2>
          <p>
            Master Grid does not charge for any part of the Service at this time. There is
            nothing to refund because there is nothing to pay - every account, question, and
            feature described on this site is currently free to use.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">If paid plans launch</h2>
          <p className="mb-2">
            If we introduce a paid plan or one-time purchase in the future, this policy will be
            updated in advance, and the following will apply unless a specific offer states
            otherwise:
          </p>
          <p className="mb-2">
            Subscriptions may be cancelled at any time from Settings. Cancelling stops future
            billing but does not automatically refund the current billing period.
          </p>
          <p className="mb-2">
            If you believe you were charged in error - for example, a duplicate charge or a
            charge after you cancelled - contact us and we will investigate and issue a refund
            where warranted.
          </p>
          <p>
            We may, at our discretion, offer a refund within a limited window after a first-time
            purchase if the Service didn&apos;t work as described. This is evaluated case by
            case.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">How to request one</h2>
          <p>
            Email{" "}
            <a
              href="mailto:cherryyeshmith84@gmail.com"
              className="text-brand-400 hover:text-brand-300"
            >
              cherryyeshmith84@gmail.com
            </a>{" "}
            with your account email and, if applicable, the charge you&apos;re asking about. See
            our{" "}
            <Link href="/contact" className="text-brand-400 hover:text-brand-300">
              Contact page
            </Link>{" "}
            for more.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Changes to this policy</h2>
          <p>
            We may update this Refund Policy from time to time, particularly before introducing
            any paid features. If we make material changes, we will update the &quot;Last
            updated&quot; date above.
          </p>
        </section>
      </article>
    </main>
  );
}
