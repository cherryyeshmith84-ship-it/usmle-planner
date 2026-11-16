"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ImageUploadField from "@/components/ImageUploadField";

export type Testimonial = {
  id: string;
  name: string;
  info: string | null;
  comment: string;
  image_url: string | null;
  sort_order: number;
  active: boolean;
  passed_step1: boolean;
  passed_step2: boolean;
  passed_step3: boolean;
  university: string | null;
};

function Row({ t }: { t: Testimonial }) {
  const router = useRouter();
  const [name, setName] = useState(t.name);
  const [info, setInfo] = useState(t.info ?? "");
  const [university, setUniversity] = useState(t.university ?? "");
  const [step1, setStep1] = useState(t.passed_step1);
  const [step2, setStep2] = useState(t.passed_step2);
  const [step3, setStep3] = useState(t.passed_step3);
  const [comment, setComment] = useState(t.comment);
  const [image, setImage] = useState<string | null>(t.image_url);
  const [order, setOrder] = useState(String(t.sort_order));
  const [active, setActive] = useState(t.active);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await createClient()
      .from("testimonials")
      .update({
        name: name.trim(),
        info: info.trim() || null,
        university: university.trim() || null,
        passed_step1: step1,
        passed_step2: step2,
        passed_step3: step3,
        comment: comment.trim(),
        image_url: image,
        sort_order: parseInt(order) || 0,
        active,
      })
      .eq("id", t.id);
    setBusy(false);
    setMsg(error ? error.message : "Saved");
    if (!error) router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this testimonial?")) return;
    setBusy(true);
    const { error } = await createClient().from("testimonials").delete().eq("id", t.id);
    setBusy(false);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  return (
    <div className="card mb-4">
      <ImageUploadField label="Student photo" value={image} onChange={setImage} bucket="testimonial-photos" />
      <label className="label">Name</label>
      <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="label">Exams passed</label>
      <div className="flex items-center gap-5 flex-wrap mb-1">
        <label className="text-sm flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={step1} onChange={(e) => setStep1(e.target.checked)} className="w-4 h-4" />
          Step 1
        </label>
        <label className="text-sm flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={step2} onChange={(e) => setStep2(e.target.checked)} className="w-4 h-4" />
          Step 2
        </label>
        <label className="text-sm flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={step3} onChange={(e) => setStep3(e.target.checked)} className="w-4 h-4" />
          Step 3
        </label>
      </div>
      <p className="text-xs text-slate-500 mb-3">Each ticked step shows on the landing page in green, e.g. &ldquo;Passed Step 1&rdquo;.</p>

      <label className="label">University</label>
      <input
        className="input mb-3"
        value={university}
        onChange={(e) => setUniversity(e.target.value)}
        placeholder="e.g. St Martinus University"
      />

      <label className="label">Extra info (optional)</label>
      <input className="input mb-3" value={info} onChange={(e) => setInfo(e.target.value)} />

      <label className="label">Comment</label>
      <textarea className="input mb-3" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex items-center gap-4 flex-wrap mb-3">
        <label className="text-sm flex items-center gap-2">
          Order
          <input className="input w-20 py-1" value={order} onChange={(e) => setOrder(e.target.value)} />
        </label>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Show on landing page
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="btn-primary text-sm">
          {busy ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={remove} disabled={busy} className="text-sm text-red-400 hover:text-red-300">
          Delete
        </button>
        {msg && <span className="text-xs text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}

export default function TestimonialsAdmin({ items }: { items: Testimonial[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const next = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 1;
    // Starts hidden so the placeholder text never shows on the landing page
    // before the admin fills it in and ticks "Show on landing page".
    const { error: err } = await createClient()
      .from("testimonials")
      .insert({ name: "New student", comment: "Write the student's comment here", sort_order: next, active: false });
    setBusy(false);
    if (err) setError(err.message);
    else router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={add} disabled={busy} className="btn-primary mb-4">
        {busy ? "Adding..." : "+ Add testimonial"}
      </button>
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      {items.length === 0 && <p className="text-sm text-slate-500">No testimonials yet.</p>}
      {items.map((t) => (
        <Row key={t.id} t={t} />
      ))}
    </div>
  );
}
