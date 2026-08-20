"use client";

/**
 * Test fixture for the Driftless migration pipeline, not production code.
 *
 * Deliberately written against React 18 so that a React 18 → 19 migration has
 * something real to do here. Two of the patterns below are removed or
 * type-invalid in React 19, and both are things a genuine 2023-era component
 * would contain.
 */

import { useRef, useState, type ChangeEvent } from "react";

interface WatchlistFilterProps {
  readonly onFilter: (query: string) => void;
  readonly placeholder?: string;
}

export function WatchlistFilter({ onFilter, placeholder }: WatchlistFilterProps) {
  // React 18 allowed useRef with no argument. React 19 requires one — its
  // types no longer provide the implicit-undefined overload.
  const inputRef = useRef<HTMLInputElement>();
  const [query, setQuery] = useState("");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    onFilter(event.target.value);
  }

  function clear() {
    setQuery("");
    onFilter("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef as never}
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded border px-2 py-1 text-sm"
      />
      <button type="button" onClick={clear} className="text-sm opacity-70">
        Clear
      </button>
    </div>
  );
}

// Removed in React 19: defaultProps is no longer read for function components.
// The replacement is an ES default parameter on the prop itself.
WatchlistFilter.defaultProps = {
  placeholder: "Filter watchlist",
};
