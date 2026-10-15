"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Lets a viewer upload (or replace) their own profile photo from their
 * dashboard. The file goes to the public "viewer-photos" bucket under the
 * viewer's own user-id folder, then the viewers row is updated through the
 * set_my_viewer_photo() database function (which can only change the photo,
 * nothing else on the row).
 */
export default function ViewerPhotoUpload({
  userId,
  name,
  initialPhotoUrl,
}: {
  userId: string;
  name: string;
  initialPhotoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ ok: false, text: "Please choose an image file (JPG, PNG, WebP)." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ ok: false, text: "That image is over 5 MB. Please choose a smaller one." });
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("viewer-photos")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setBusy(false);
      setMessage({ ok: false, text: "Upload failed. Please try again." });
      return;
    }

    const { error: rpcError } = await supabase.rpc("set_my_viewer_photo", { p_path: path });
    if (rpcError) {
      setBusy(false);
      setMessage({ ok: false, text: "Could not save your photo. Please try again." });
      return;
    }

    const { data } = supabase.storage.from("viewer-photos").getPublicUrl(path);
    setPhotoUrl(data.publicUrl);
    setBusy(false);
    setMessage({ ok: true, text: "Photo updated." });
    router.refresh();
  }

  return (
    <div className="card flex items-center gap-4 mb-6">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="w-16 h-16 rounded-full object-cover border border-slate-800 shrink-0" />
      ) : (
        <span className="w-16 h-16 rounded-full bg-brand-900/50 text-brand-300 text-lg font-bold flex items-center justify-center shrink-0">
          {initials(name)}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-sm">{name}</p>
        <p className="text-xs text-slate-500 mb-2">Your profile photo</p>
        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-secondary text-xs">
          {busy ? "Uploading..." : photoUrl ? "Change photo" : "Upload photo"}
        </button>
        {message && (
          <p className={`text-xs mt-2 ${message.ok ? "text-green-500" : "text-red-400"}`}>{message.text}</p>
        )}
      </div>
    </div>
  );
}
