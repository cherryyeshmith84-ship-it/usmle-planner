import Link from "next/link";

export const metadata = {
  title: "Privacy Policy - Master Grid",
};

export default function PrivacyPage() {
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
          <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
          <p className="text-slate-500">Last updated: July 2026</p>
        </div>

        <p>
          This Privacy Policy explains how Master Grid (&quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;) collects, uses, and protects information when you use our website and
          study platform (the &quot;Service&quot;).
        </p>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Information we collect</h2>
          <p className="mb-2">When you create an account and use Master Grid, we collect:</p>
          <p className="mb-2">
            Account information you provide directly, such as your name and email address.
          </p>
          <p className="mb-2">
            Study activity, including questions answered, test sessions, self-assessment
            results, planner tasks, daily logs, and any notes or reflections you write.
          </p>
          <p>
            Usage information such as pages visited and general activity within the Service,
            used to keep the platform working correctly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. How we use your information</h2>
          <p className="mb-2">We use the information we collect to:</p>
          <p className="mb-2">Provide and operate the Service, including your account, study data, and progress tracking.</p>
          <p className="mb-2">Generate the analytics you see in the app, such as Master Grid, Error Notes, and Smart Review - all computed from your own activity.</p>
          <p className="mb-2">Send account-related or study-reminder emails, where applicable.</p>
          <p>Maintain the security and reliability of the Service.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. How we store and protect data</h2>
          <p>
            Your data is stored using Supabase, a third-party database and authentication
            provider, with access controls in place so that your study data is only accessible
            to you and, where applicable, your assigned coach. We take reasonable steps to
            protect your information, but no method of electronic storage is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Sharing of information</h2>
          <p>
            We do not sell your personal information. We do not share your study data with
            third parties except: (a) service providers who help us operate the platform (such
            as our hosting and database providers), (b) if required by law, or (c) with your
            coach, where the platform is used in a coaching relationship.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Your choices</h2>
          <p>
            You can update your account information at any time from Settings. If you would
            like your account and associated data deleted, contact us using the email below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Children&apos;s privacy</h2>
          <p>
            Master Grid is intended for medical students and other adult learners. It is not
            directed at children under 13, and we do not knowingly collect information from
            children under 13.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make material changes,
            we will update the &quot;Last updated&quot; date above.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Contact us</h2>
          <p>
            If you have questions about this Privacy Policy, contact us at{" "}
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
