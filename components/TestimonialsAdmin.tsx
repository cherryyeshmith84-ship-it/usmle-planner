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
};

function Row({ t }: { t: Testimonial }) {
  const router = useRouter();
  const [name, setName] = useState(t.name);
  const [info, setInfo] = useState(t.info ?? "");
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
      <label className="label">Info (e.g. Step 1 score, university)</label>
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
    const { error: err } = await createClient()
      .from("testimonials")
      .insert({ name: "New student", comment: "Write the student's comment here", sort_order: next });
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
