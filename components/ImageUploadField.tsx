"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Small reusable image-upload control - originally built for the Self
 * Assessment and Question Bank admin forms (uploading to the
 * "question-images" bucket), now also reused by UWorldBlockTracker.tsx to
 * let a student attach a screenshot of their block % result (uploading to
 * the separate "block-screenshots" bucket instead - see migration
 * add_block_screenshots). The `bucket` and `folder` props are what make
 * that reuse possible without duplicating this component: `bucket` picks
 * which Storage bucket the file goes to, and `folder` (when given) prefixes
 * the random filename with a path segment - for block screenshots this is
 * the student's own user id, which is what the bucket's RLS policies check
 * to decide who's allowed to read/write it.
 *
 * `readOnly` renders the image (if any) with no file input and no "Remove"
 * button - used when someone who can only VIEW this field (a mentor,
 * admin, or viewer looking at a student's page) shouldn't see edit
 * controls they have no permission to use anyway.
 *
 * Existing callers that don't pass `bucket`/`folder`/`readOnly` keep their
 * old behavior exactly (question-images bucket, no folder prefix, always
 * editable).
 */
export default function ImageUploadField({
  label,
  value,
  onChange,
  bucket = "question-images",
  folder,
  readOnly = false,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  bucket?: string;
  folder?: string;
  readOnly?: boolean;
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
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = folder ? `${folder}/${filename}` : filename;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    setUploading(false);
    onChange(data.publicUrl);
  }

  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {value ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="max-h-56 rounded-lg border border-slate-700 mb-1" />
          {!readOnly && (
            <div>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove image
              </button>
            </div>
          )}
        </div>
      ) : readOnly ? (
        <p className="text-xs text-slate-500">No image uploaded.</p>
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
