import type { StudyResource } from "@/lib/plannerColumns";

/**
 * "Resources Used" (Study Planner v1 item 11) - a yes/no toggle per
 * resource, against the same admin-configured study_resources list used
 * elsewhere in the app (not a hardcoded UWorld/FA/Pathoma/... set), so it
 * stays in sync if a coach adds or renames a resource from Planner
 * Settings. Stored as a comma-separated list of resource names in
 * planner_entries.field_values.resources_used, saved with the rest of the
 * day via the grid's normal "Save changes" flow.
 */
export default function ResourcesUsedChecklist({
  resources,
  value,
  onChange,
  disabled,
}: {
  resources: StudyResource[];
  value: string;
  onChange: (csv: string) => void;
  disabled?: boolean;
}) {
  const used = new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  // "Other" gets a free-text box instead of just being a bare checkbox, so
  // someone using a resource that isn't on the configured list (set by an
  // admin in Planner Settings) can still record what it actually was.
  // Stored as a single CSV token: plain "Other" once checked with nothing
  // typed yet, or "Other:<what they typed>" once they've filled in the box
  // - so reloading the page still shows both the checked state and
  // whatever custom name they entered.
  const otherToken = Array.from(used).find((u) => u === "Other" || u.startsWith("Other:"));
  const isOtherChecked = !!otherToken;
  const otherText = otherToken && otherToken.startsWith("Other:") ? otherToken.slice("Other:".length) : "";

  function toggle(name: string) {
    const next = new Set(used);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(Array.from(next).join(","));
  }

  function toggleOther() {
    const next = new Set(used);
    if (otherToken) next.delete(otherToken);
    else next.add("Other");
    onChange(Array.from(next).join(","));
  }

  function updateOtherText(text: string) {
    const next = new Set(used);
    if (otherToken) next.delete(otherToken);
    next.add(text.trim() ? `Other:${text.trim()}` : "Other");
    onChange(Array.from(next).join(","));
  }

  if (resources.length === 0) {
    return <p className="text-xs text-slate-500">No resources configured yet - an admin can add some from Planner Settings.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="grid sm:grid-cols-3 gap-1.5">
        {resources.map((r) =>
          r.name === "Other" ? (
            <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isOtherChecked}
                disabled={disabled}
                onChange={toggleOther}
                className="w-4 h-4"
              />
              Other
            </label>
          ) : (
            <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={used.has(r.name)}
                disabled={disabled}
                onChange={() => toggle(r.name)}
                className="w-4 h-4"
              />
              {r.name}
            </label>
          )
        )}
      </div>
      {isOtherChecked && (
        <input
          type="text"
          className="input text-sm max-w-xs"
          placeholder="Type the resource name"
          value={otherText}
          disabled={disabled}
          onChange={(e) => updateOtherText(e.target.value)}
        />
      )}
    </div>
  );
}
