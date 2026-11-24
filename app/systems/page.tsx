import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Systems Covered is now the second section of the Analysis page. This route
 * only forwards old links and bookmarks there.
 */
export default function SystemsPage() {
  redirect("/history?view=systems");
}
