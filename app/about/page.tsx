import Link from "next/link";

export const metadata = {
  title: "About - Master Grid",
};

export default function AboutPage() {
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
          <h1 className="text-2xl font-bold text-slate-100 mb-1">About Master Grid</h1>
          <p className="text-slate-500">Last updated: July 2026</p>
        </div>

        <p>
          Master Grid is a study platform built for Step 1 candidates studying at Caribbean and
          international medical schools. It grew out of a simple frustration: it&apos;s easy to
          rack up thousands of practice questions without ever seeing, in one place, which
          specific concepts keep tripping you up and why.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">What we&apos;re trying to do</h2>
          <p className="mb-2">
            Most question banks tell you whether you got something right or wrong. Master Grid
            goes one step further: every wrong answer is tagged with what kind of mistake it was
            (a knowledge gap, a mechanism mix-up, a diagnosis confusion, and so on) and which
            related concept it points back to. That tagging is what powers Error Notes, Smart
            Review, and the Master Grid performance map - three views of the same underlying
            question, built to answer &quot;what am I actually still missing, and why.&quot;
          </p>
          <p>
            The goal isn&apos;t to be another place to grind volume. It&apos;s to make sure the
            volume you already put in actually turns into fewer repeated mistakes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Who it&apos;s for</h2>
          <p>
            Master Grid is built with Caribbean and international medical students preparing for
            USMLE Step 1 specifically in mind - students who are often studying with less
            structured support around them than students at schools with dedicated Step 1
            advising, and who benefit most from a tool that tells them exactly where to focus
            next instead of just handing over more questions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Where things stand</h2>
          <p>
            Master Grid is an early, actively developed platform - new questions, features, and
            improvements are added regularly. It is independent and self-funded, not affiliated
            with, endorsed by, or sponsored by the NBME, USMLE, UWorld, or any medical school.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Get in touch</h2>
          <p>
            Questions, feedback, or something not working right? See our{" "}
            <Link href="/contact" className="text-brand-400 hover:text-brand-300">
              Contact page
            </Link>{" "}
            - we read everything that comes in.
          </p>
        </section>
      </article>
    </main>
  );
}
