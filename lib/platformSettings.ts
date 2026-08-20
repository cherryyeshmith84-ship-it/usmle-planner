import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = ReturnType<typeof createClient>;

/**
 * The single global "has the coach published student content yet" switch.
 * Lives in one row of platform_settings (id is always `true` - enforced by
 * a check constraint, so there's never more than one row). Admins bypass
 * this everywhere - this helper only tells you what a *student* should see,
 * so only call it once you already know the current user isn't an admin.
 */
export async function getContentPublished(supabase: SupabaseServerClient): Promise<boolean> {
  const { data } = await supabase
    .from("platform_settings")
    .select("content_published")
    .eq("id", true)
    .maybeSingle();
  return data?.content_published ?? false;
}

/**
 * Same idea as getContentPublished, but for Tutoring specifically - a
 * separate switch so Tutoring can stay hidden behind a "coming soon" while
 * tutors are still being set up, independent of whether the rest of the
 * student content is published. Defaults to false (not published) so
 * Tutoring stays "coming soon" until an admin explicitly flips it on.
 * Admins bypass this everywhere, same as getContentPublished - only call
 * this once you already know the current user isn't an admin.
 */
export async function getTutoringPublished(supabase: SupabaseServerClient): Promise<boolean> {
  const { data } = await supabase
    .from("platform_settings")
    .select("tutoring_published")
    .eq("id", true)
    .maybeSingle();
  return data?.tutoring_published ?? false;
}
