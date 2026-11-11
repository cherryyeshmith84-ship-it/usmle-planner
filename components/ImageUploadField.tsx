"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Small reusable image-upload control - originally built for the Self
 * Assessment and Question Bank admin forms (uploading to the
 * "question-images" bucket), also reused by UWorldBlockTracker.tsx for block
 * screenshots ("block-screenshots" bucket) and by onboarding for photos.
 * `bucket` picks the Storage bucket, `folder` prefixes the filename with a
 * path segment (the student's user id for block screenshots), and
 * `readOnly` hides the file input and Remove button for viewers.
 *
 * Besides "Choose File" there is a "Take photo" button: on a phone it opens
 * the camera app; on a computer it opens a live camera preview with a
 * Capture button (needs the browser's camera permission).
 *
 * Clicking the image (or "View full size") opens a full-screen viewer at the
 * image's actual size (scrollable if larger than the screen) with a Close
 * button. Esc or clicking the dark background also closes it.
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
  const [zoomed, setZoomed] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phoneCameraRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!zoomed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomed(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Start / stop the live preview with the modal.
  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    (async () => {
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setCameraError("Couldn't open the camera. Allow camera access in your browser, or use Choose File.");
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen]);

  async function uploadFile(file: File) {
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-picked later if needed
    if (!file) return;
    await uploadFile(file);
  }

  function openCamera() {
    const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (isTouch && phoneCameraRef.current) {
      // Phones/tablets: hand off to the native camera app.
      phoneCameraRef.current.click();
      return;
    }
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
    } else {
      setError("This browser can't open the camera. Use Choose File instead.");
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    setCameraOpen(false);
    if (!blob) {
      setError("Couldn't take the photo. Try again.");
      return;
    }
    await uploadFile(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }

  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {value ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Click to view full size"
            title="Click to view full size"
            onClick={() => setZoomed(true)}
            className="max-h-56 rounded-lg border border-slate-700 mb-1 cursor-zoom-in"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="text-xs text-brand-400 hover:underline"
            >
              View full size
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove image
              </button>
            )}
          </div>
        </div>
      ) : readOnly ? (
        <p className="text-xs text-slate-500">No image uploaded.</p>
      ) : (
        <div className="space-y-2">
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            disabled={uploading}
            className="text-sm text-slate-300"
          />
          <div>
            <button
              type="button"
              onClick={openCamera}
              disabled={uploading}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              📷 Take photo
            </button>
            {/* Hidden native-camera input used on phones/tablets. */}
            <input
              ref={phoneCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              className="hidden"
            />
          </div>
        </div>
      )}
      {uploading && <p className="text-xs text-slate-400 mt-1">Uploading...</p>}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

      {cameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl p-4 max-w-xl w-full">
            {cameraError ? (
              <p className="text-sm text-red-500 mb-3">{cameraError}</p>
            ) : (
              <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black mb-3" />
            )}
            <div className="flex items-center gap-3">
              {!cameraError && (
                <button type="button" onClick={capture} className="btn-primary text-sm">
                  Capture
                </button>
              )}
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {zoomed && value && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 overflow-auto"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="fixed top-4 right-4 z-[110] rounded-lg bg-white text-slate-900 font-semibold text-sm px-4 py-2 shadow-lg hover:bg-slate-200"
          >
            ✕ Close
          </button>
          <div className="min-h-full min-w-full flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Full size screenshot"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "none", width: "auto", height: "auto" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
