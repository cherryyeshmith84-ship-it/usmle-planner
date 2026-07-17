import Link from "next/link";

export const metadata = {
  title: "Terms of Service - Master Grid",
};

export default function TermsPage() {
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
          <h1 className="text-2xl font-bold text-white mb-1">Terms of Service</h1>
          <p className="text-slate-500">Last updated: July 2026</p>
        </div>

        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of Master Grid (the
          &quot;Service&quot;). By creating an account or using the Service, you agree to these
          Terms.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. What Master Grid is</h2>
          <p>
            Master Grid is an independent educational study platform for exam preparation,
            including a question bank, self-assessments, performance analytics, and a study
            planner. Master Grid is not affiliated with, endorsed by, or sponsored by the NBME,
            USMLE, UWorld, or any other third-party organization.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Not medical advice</h2>
          <p>
            Content on Master Grid is provided solely for educational and exam-preparation
            purposes. It is not medical advice and should not be relied on for clinical
            decision-making or patient care, and it is not a substitute for your medical school
            curriculum or licensed instruction.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. Your account</h2>
          <p className="mb-2">
            You&apos;re responsible for maintaining the confidentiality of your account
            credentials and for all activity that happens under your account.
          </p>
          <p>
            You agree to provide accurate information when creating your account and to use the
            Service only for its intended purpose of personal exam preparation.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Acceptable use</h2>
          <p className="mb-2">You agree not to:</p>
          <p className="mb-2">Copy, redistribute, or resell any question content from the Service without permission.</p>
          <p className="mb-2">Attempt to disrupt, reverse-engineer, or gain unauthorized access to the Service.</p>
          <p>Use the Service in any way that violates applicable law.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Content ownership</h2>
          <p>
            All question content, explanations, and platform materials are the property of
            Master Grid or its licensors. Your own study data (answers, notes, logs) belongs to
            you, and we use it only to operate and improve your experience on the Service, as
            described in our Privacy Policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Service availability</h2>
          <p>
            Master Grid is provided on an &quot;as is&quot; and &quot;as available&quot; basis.
            We do not guarantee the Service will be uninterrupted or error-free, and features
            may change, be added, or be removed over time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, Master Grid is not liable for any indirect,
            incidental, or consequential damages arising from your use of the Service, including
            exam outcomes or academic performance.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Service after
            changes are posted means you accept the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">9. Contact us</h2>
          <p>
            Questions about these Terms can be sent to{" "}
            <a href="mailto:cherryyeshmith84@gmail.com" className="text-brand-400 hover:text-brand-300">
              cherryyeshmith84@gmail.com
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
