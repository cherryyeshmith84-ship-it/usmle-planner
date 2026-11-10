import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import TestimonialsAdmin, { type Testimonial } from "@/components/TestimonialsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminTestimonialsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("testimonials")
    .select("*")
    .order("sort_order", { ascending: true });

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Testimonials</h1>
        <p className="text-sm text-slate-400 mb-6">
          Student photos and comments shown on the landing page. Click Add, upload the photo, fill in the
          details, then Save.
        </p>
        <TestimonialsAdmin items={(data ?? []) as Testimonial[]} />
      </main>
    </div>
  );
}
