import type { Metadata } from "next";
import "./globals.css";
import UsDateFormatter from "@/components/UsDateFormatter";

export const metadata: Metadata = {
  title: "Master Grid",
  description: "A daily study planner and AI coach for USMLE Step 1 prep.",
  verification: {
    google: "hBl-5vpRXlK2NvQnOD92-ZbDceU3Czn58AycJ-pqZnw",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <UsDateFormatter />
      </body>
    </html>
  );
}
