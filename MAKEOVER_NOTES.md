# AXIOM guided-site makeover

This build changes AXIOM from a financial dashboard into a beginner-friendly investing routine.

The investment logic, storage model, sync layer, API routes, risk calculations, portfolio calculations, and journal schema remain in place. The primary change is the way a person encounters that logic.

## Product model

The main journey is now:

**Today → My portfolio → Trade ideas → Journal → Review → Learn**

The Risk Gate is no longer permanent dashboard chrome. It is presented as a question inside the journey:

> Can I take new swing risk today?

The interface is designed to show a question, an answer, and a next step before exposing technical detail.

## What changed

- Replaced the desktop sidebar with a quiet top navigation and a compact mobile bottom navigation.
- Removed the permanent workflow strip and permanent Risk Gate banner.
- Rebuilt Home as a guided starting page rather than a performance dashboard.
- Rebuilt the 15-minute routine as five questions, one question per screen.
- Translated the six Risk Gate checks into plain-English questions with optional “Why this matters” explanations.
- Reduced the beginner Risk Check input to two personal facts: portfolio drawdown and unaccepted event risk.
- Moved manual VIX, NFCI, and benchmark-trend inputs behind a secondary disclosure.
- Collapsed the position-sizing calculator until the user has a real trade to size.
- Rebuilt Portfolio around “What do I own, and does anything need a decision?” Holdings expand individually for editing.
- Reframed Watchlist as **Trade ideas**. Alert conditions are written as factual sentences, not trading prompts.
- Rebuilt Journal around unfinished reflection. Performance statistics are secondary and closed trades are classified by process and outcome.
- Added a direct “Complete this reflection” action for incomplete closed trades; existing exit data is pre-filled.
- Rebuilt Monthly Review as four guided steps: Compare → Explain → Find a repeated problem → Test at most one rule change.
- Rebuilt Learn as seven short lessons framed as real beginner questions and linked directly to the relevant workflow.
- Rebuilt Settings as a three-step starting-rules setup. Account, backup, example data, and reset controls are secondary.

## Visual direction

The visual system is deliberately closer to an editorial learning site than a trading terminal:

- warm oat and ivory background surfaces;
- deep mineral green as the primary action color;
- muted clay and ochre for exceptions;
- Newsreader for editorial headings;
- DM Sans for interface and body text;
- restrained use of IBM Plex Mono for exact numeric alignment;
- fewer bordered cards and KPI tiles;
- larger reading width, more whitespace, and plain section dividers;
- rounded surfaces only where they communicate a distinct answer or action.

## Beginner design rules used in this build

1. **Question before metric.** Explain what the user is trying to decide before showing a number.
2. **One next step.** The dominant action on a page should be obvious.
3. **Plain English first.** Technical terms remain available, but are not the first thing a beginner must parse.
4. **Advanced by disclosure.** Thresholds, manual market data, analytics, and technical controls stay available without crowding the learning path.
5. **Reflection before scorekeeping.** Journal learning comes before P&L statistics.
6. **No forced activity.** “No new trade” and “no further browsing required” are legitimate end states.
7. **Preserve uncertainty.** Unknown data remains visibly unknown rather than being treated as safe.

## Validation performed

- `npm run typecheck` — passed.
- `npm run build` — passed on Next.js 15.2.8.
- Production route smoke checks returned HTTP 200 for `/`, `/daily`, `/gate`, `/portfolio`, `/watchlist`, `/journal`, `/monthly`, `/guides`, `/settings`, `/charts`, `/group`, `/login`, and `/join` in offline mode.
- Core pages were rendered from the production server output with the compiled production stylesheet and reviewed at a 1440px layout width. Preview images are in `design-previews/`.

## Most substantially changed files

- `app/globals.css`
- `app/layout.tsx`
- `components/chrome.tsx`
- `app/page.tsx`
- `app/daily/page.tsx`
- `app/gate/page.tsx`
- `app/portfolio/page.tsx`
- `app/watchlist/page.tsx`
- `app/journal/page.tsx`
- `app/monthly/page.tsx`
- `app/guides/page.tsx`
- `app/settings/page.tsx`
