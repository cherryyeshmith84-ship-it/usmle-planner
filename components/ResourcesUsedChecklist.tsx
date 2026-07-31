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

  function toggle(name: string) {
    const next = new Set(used);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(Array.from(next).join(","));
  }

  if (resources.length === 0) {
    return <p className="text-xs text-slate-500">No resources configured yet - an admin can add some from Planner Settings.</p>;
  }

  return (
    <div className="grid sm:grid-cols-3 gap-1.5">
      {resources.map((r) => (
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
      ))}
    </div>
  );
}
