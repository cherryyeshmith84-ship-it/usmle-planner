"use client";

import { useEffect, useState } from "react";

/**
 * Small button that turns on browser push notifications for the current
 * device: registers /sw.js, asks the browser for Notification permission,
 * subscribes via the Push API using the VAPID public key, then saves that
 * subscription server-side via /api/push/subscribe. Once saved, the
 * message-sent route can push straight to this device even if the site
 * isn't open. Renders nothing if the browser doesn't support push at all
 * (e.g. some in-app browsers) so it never shows a broken button.
 */
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function EnablePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "enabled" | "denied" | "error">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
      if (!reg) return;
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setStatus("enabled");
      });
    });
  }, []);

  async function enable() {
    setStatus("loading");
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setStatus("error");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("enabled");
    } catch {
      setStatus("error");
    }
  }

  if (!supported || status === "enabled") return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 mb-4 flex items-center justify-between gap-3">
      <p className="text-sm text-slate-300">
        Get a phone notification when a student messages you, even when Master Grid isn't open.
      </p>
      <button type="button" onClick={enable} disabled={status === "loading"} className="btn-secondary shrink-0 text-sm">
        {status === "loading" ? "Enabling..." : status === "denied" ? "Blocked - check browser settings" : status === "error" ? "Try again" : "Enable notifications"}
      </button>
    </div>
  );
}
