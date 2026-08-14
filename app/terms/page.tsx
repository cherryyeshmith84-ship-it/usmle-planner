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
          <h1 className="text-2xl font-bold text-slate-100 mb-1">Terms of Service</h1>
          <p className="text-slate-500">Last updated: August 2026</p>
        </div>

        <p>
          These Terms of Service (&quot;Terms&quot;) form a binding agreement between you
          (&quot;you&quot; or &quot;User&quot;) and Master Grid (&quot;Master Grid,&quot;
          &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) governing your access to and use of
          the Master Grid website, application, and all related features (the
          &quot;Service&quot;). By creating an account, logging in, or otherwise using the
          Service, you confirm that you have read, understood, and agree to be bound by these
          Terms and our{" "}
          <Link href="/privacy" className="text-brand-400 hover:text-brand-300">
            Privacy Policy
          </Link>
          . If you do not agree, do not use the Service.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">1. What Master Grid is</h2>
          <p>
            Master Grid is an independent educational study platform for exam preparation,
            including a question bank, self-assessments, performance analytics, an AI-assisted
            study planner, and an optional peer mentorship program. Master Grid is not
            affiliated with, endorsed by, or sponsored by the NBME, USMLE, UWorld, or any medical
            school or licensing body. All references to those names are for identification
            purposes only.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">2. Eligibility</h2>
          <p>
            The Service is intended for medical students and other adult learners. By using the
            Service you represent that you are at least 18 years old and legally capable of
            entering into a binding agreement. Accounts created with false or misleading
            information may be suspended or terminated.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">
            3. Not medical advice, and no guaranteed outcomes
          </h2>
          <p className="mb-2">
            Content on Master Grid is provided solely for educational and exam-preparation
            purposes. It is not medical advice, is not a substitute for your medical school
            curriculum or licensed instruction, and must not be relied on for clinical
            decision-making or patient care.
          </p>
          <p>
            Master Grid makes no promise, guarantee, or warranty - express or implied - regarding
            exam scores, exam outcomes, residency match results, academic performance, or any
            other result from using the Service. Any performance statistics, mastery scores, or
            &quot;readiness&quot; indicators shown in the app are estimates for self-study
            purposes only and are not predictive of your actual exam performance.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">
            4. AI-generated content
          </h2>
          <p>
            Some content - including practice questions, explanations, the AI Helper, the AI
            coach, and targeted practice generated from your Error Notes - is created or assisted
            by third-party AI models. AI-generated content may contain errors, omissions, or
            inaccuracies despite our efforts to review it. You are responsible for independently
            verifying any information before relying on it, and Master Grid disclaims liability
            for decisions made based on AI-generated content.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">5. Your account</h2>
          <p className="mb-2">
            You&apos;re responsible for maintaining the confidentiality of your account
            credentials and for all activity that happens under your account, whether or not
            authorized by you. Notify us immediately of any unauthorized use.
          </p>
          <p>
            You agree to provide accurate information when creating your account and to use the
            Service only for its intended purpose of personal exam preparation, not for resale,
            redistribution, or on behalf of any third party without our written consent.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">6. Mentorship program</h2>
          <p className="mb-2">
            Mentors on Master Grid are independent, unpaid volunteers - current or former
            students who offer informal peer guidance. Mentors are not employees, agents,
            contractors, or representatives of Master Grid, and nothing in the Service or these
            Terms creates an employment, agency, partnership, or joint-venture relationship
            between Master Grid and any mentor.
          </p>
          <p className="mb-2">
            Mentor guidance is peer support only, not professional academic advising, counseling,
            or medical advice, and reflects the personal opinions of the individual mentor, not
            Master Grid. We do not vet, credential, supervise, or guarantee the accuracy,
            availability, or quality of any mentor&apos;s guidance, and we are not liable for any
            advice given, session missed, or outcome resulting from a mentor-student interaction.
          </p>
          <p>
            Both mentors and students agree to communicate respectfully and in good faith. Master
            Grid reserves the right to remove any mentor or student from the mentorship program
            at its sole discretion, including for inactivity, misconduct, or violation of these
            Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">7. Acceptable use</h2>
          <p className="mb-2">You agree not to:</p>
          <p className="mb-2">Copy, scrape, redistribute, publicly post, or resell any question content, explanations, or other platform material without our prior written permission.</p>
          <p className="mb-2">Attempt to disrupt, reverse-engineer, decompile, probe, or gain unauthorized access to the Service, its data, or its underlying systems.</p>
          <p className="mb-2">Use automated tools (bots, scrapers) to access the Service, or share your account/login with others.</p>
          <p className="mb-2">Upload or transmit content that is unlawful, harassing, defamatory, or infringes another person&apos;s rights.</p>
          <p>Use the Service in any way that violates applicable law, including the Indian Information Technology Act, 2000.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">8. Content ownership and license</h2>
          <p className="mb-2">
            All question content, explanations, branding, software, and other platform materials
            are the exclusive property of Master Grid or its licensors and are protected by
            applicable intellectual property laws. No rights are transferred to you except a
            limited, revocable, non-transferable license to use the Service for personal exam
            preparation.
          </p>
          <p>
            Your own study data (answers, notes, logs, and similar inputs) belongs to you. By
            submitting it, you grant Master Grid a non-exclusive, worldwide, royalty-free license
            to use, store, and process that data solely to operate, maintain, and improve the
            Service, as described in our Privacy Policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">9. Service availability and changes</h2>
          <p>
            Master Grid is provided on an &quot;as is&quot; and &quot;as available&quot; basis.
            We do not guarantee the Service will be uninterrupted, timely, secure, or error-free.
            We may modify, suspend, or discontinue any part of the Service, temporarily or
            permanently, with or without notice, and without liability to you.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">10. Disclaimer of warranties</h2>
          <p>
            To the fullest extent permitted by applicable law, the Service is provided without
            warranties of any kind, whether express, implied, or statutory, including implied
            warranties of merchantability, fitness for a particular purpose, accuracy, and
            non-infringement. Master Grid does not warrant that the Service will meet your
            requirements or that any errors will be corrected.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">11. Limitation of liability</h2>
          <p className="mb-2">
            To the fullest extent permitted by applicable law, Master Grid, its founders, and any
            affiliated individuals will not be liable for any indirect, incidental, special,
            consequential, exemplary, or punitive damages, or any loss of data, revenue,
            opportunity, or goodwill, arising from or related to your use of (or inability to
            use) the Service - including exam outcomes, academic or career performance, mentor
            interactions, or reliance on AI-generated content - even if advised of the
            possibility of such damages.
          </p>
          <p>
            To the extent any liability is found despite the foregoing, Master Grid&apos;s total
            aggregate liability to you for all claims arising out of or relating to the Service
            will not exceed the total amount, if any, that you paid to Master Grid in the twelve
            (12) months preceding the claim, or ₹0 given that the Service is currently provided
            free of charge.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">12. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless Master Grid and its founders from
            any claims, damages, losses, liabilities, and expenses (including reasonable legal
            fees) arising out of or related to your use of the Service, your violation of these
            Terms, your interactions with other users (including mentors or students), or your
            violation of any law or third-party right.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">13. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time, with or without
            cause or notice, including for suspected violation of these Terms. You may stop using
            the Service and request deletion of your account at any time. Sections of these Terms
            that by their nature should survive termination (including Sections 8, 10, 11, 12,
            and 14) will survive.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">
            14. Governing law and dispute resolution
          </h2>
          <p className="mb-2">
            These Terms are governed by the laws of India, without regard to conflict-of-law
            principles. Any dispute arising out of or relating to these Terms or the Service will
            first be attempted to be resolved informally by contacting us at the email below.
          </p>
          <p>
            If a dispute cannot be resolved informally within 30 days, it will be referred to and
            finally resolved by arbitration in accordance with the Arbitration and Conciliation
            Act, 1996, with a sole arbitrator appointed by mutual agreement, seated in India, with
            proceedings conducted in English. Subject to the foregoing, the courts of India will
            have exclusive jurisdiction over any matter not subject to arbitration.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">15. Severability and entire agreement</h2>
          <p>
            If any provision of these Terms is found unenforceable, the remaining provisions will
            remain in full force and effect. These Terms, together with our Privacy Policy and
            Refund Policy, constitute the entire agreement between you and Master Grid regarding
            the Service and supersede any prior agreements.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">16. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Service after
            changes are posted means you accept the updated Terms. If changes are material, we
            will update the &quot;Last updated&quot; date above and, where practical, notify
            users.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">17. Contact us</h2>
          <p>
            Questions about these Terms can be sent to{" "}
            <a href="mailto:mastergridsupport@gmail.com" className="text-brand-400 hover:text-brand-300">
              mastergridsupport@gmail.com
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
