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
          <h1 className="text-2xl font-bold text-slate-100 mb-1">Refund Policy</h1>
          <p className="text-slate-500">Last updated: November 2026</p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Payments are final</h2>
          <p>
            Once a payment for Master Grid mentorship has been made, it will not be refunded. This
            applies even if you do not pass your exam, do not reach your target score, or choose
            not to continue. Master Grid provides mentorship, planning, and performance tracking to
            support your preparation. We do not guarantee any exam result, and your result does not
            affect your payment.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">When you are eligible for a refund</h2>
          <p className="mb-2">
            The only exception is if you did not receive the mentorship you paid for. For example,
            if no mentor was assigned to you, or the mentorship sessions included in your plan were
            not provided.
          </p>
          <p>
            In that case, contact us and we will review your request and refund the amount for the
            mentorship that was not delivered.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Charged in error</h2>
          <p>
            If you believe you were charged in error, for example a duplicate charge, contact us
            and we will investigate and issue a refund where warranted.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">How to request one</h2>
          <p>
            Email{" "}
            <a
              href="mailto:mastergridsupport@gmail.com"
              className="text-brand-400 hover:text-brand-300"
            >
              mastergridsupport@gmail.com
            </a>{" "}
            with your account email and the payment you&apos;re asking about. See our{" "}
            <Link href="/contact" className="text-brand-400 hover:text-brand-300">
              Contact page
            </Link>{" "}
            for more.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Changes to this policy</h2>
          <p>
            We may update this Refund Policy from time to time. If we make material changes, we
            will update the &quot;Last updated&quot; date above.
          </p>
        </section>
      </article>
    </main>
  );
}
