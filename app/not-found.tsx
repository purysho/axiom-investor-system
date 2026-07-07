import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel border-l-4 border-line p-6">
      <div className="eyebrow">404 · off the map</div>
      <h1 className="mt-1 font-mono text-lg text-ink">No route here.</h1>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-mut">
        That address isn&apos;t part of the system. Every surface starts from the same place: risk first, then
        candidates.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/" className="btn">
          Dashboard
        </Link>
        <Link href="/gate" className="btn">
          Risk gate
        </Link>
        <Link href="/daily" className="btn">
          Daily check
        </Link>
      </div>
    </div>
  );
}
