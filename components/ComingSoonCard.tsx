/**
 * Shared "this is coming, and here's exactly what it'll do" card for nav
 * items that are wired up but not built yet - intentionally not a dead
 * link or an unstyled 404, and not a button that silently does nothing.
 */
export default function ComingSoonCard({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets?: string[];
}) {
  return (
    <div className="card max-w-xl">
      <span className="text-xs font-semibold bg-brand-900/40 text-brand-300 rounded-full px-2 py-1">
        Coming soon
      </span>
      <h1 className="text-xl font-bold mt-3 mb-2">{title}</h1>
      <p className="text-sm text-slate-400 mb-4">{description}</p>
      {bullets && bullets.length > 0 && (
        <ul className="space-y-1.5">
          {bullets.map((b) => (
            <li key={b} className="text-sm text-slate-300 flex items-start gap-2">
              <span className="text-brand-400 mt-0.5">&bull;</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
