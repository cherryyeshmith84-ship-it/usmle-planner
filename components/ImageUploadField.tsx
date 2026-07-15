"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Small reusable image-upload control used in both the Self Assessment and
 * Question Bank admin forms - lets an admin attach an image (a lab-value
 * table, X-ray, ECG, histology slide, etc.) to a question or its
 * explanation, for cases a plain-text paste can't represent well.
 *
 * Uploads straight to the "question-images" Supabase Storage bucket (see
 * supabase/schema_v17_question_images.sql) and stores the resulting public
 * URL via onChange - the parent form is responsible for saving that URL
 * string onto the question.
 */
export default function ImageUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-picked later if needed
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setUploading(true);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("question-images")
      .upload(path, file, { upsert: false });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("question-images").getPublicUrl(path);
    setUploading(false);
    onChange(data.publicUrl);
  }

  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {value ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="max-h-56 rounded-lg border border-slate-700 mb-1"
          />
          <div>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={uploading}
          className="text-sm text-slate-300"
        />
      )}
      {uploading && <p className="text-xs text-slate-400 mt-1">Uploading...</p>}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
