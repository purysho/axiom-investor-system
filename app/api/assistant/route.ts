import { NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/assistant
 * Body: { messages: [{role:"user"|"assistant", content:string}], snapshot: string }
 * Returns: { reply: string }
 *
 * The Anthropic key lives server-side only (ANTHROPIC_API_KEY). Without it the
 * route degrades to a clear setup message instead of an error page. Auth is
 * enforced by the middleware like every other /api route.
 */

const MODEL = process.env.ASSISTANT_MODEL || "claude-haiku-4-5";
const MAX_MESSAGES = 12;
const MAX_CONTENT = 2000;
const MAX_SNAPSHOT = 6000;

const SYSTEM = `You are the Axiom guide — a calm assistant built into Axiom Investor System, a website that walks a small group of investors through a disciplined routine: a six-check risk gate, a 15-minute daily check, a weekly portfolio review, a reflective trade journal, and a monthly review where at most one rule changes.

Voice: plain English, warm, brief. Usually under 120 words. No hype, no jargon without a one-line explanation, at most one question back. Format as short prose; use a short list only when listing genuinely helps.

You CAN:
- Read the user's snapshot below and tell them what THEIR gate, journal, portfolio, or today's check currently says.
- Explain the method: why risk comes before candidates, the six checks, R multiples, sizing from planned loss (never from conviction), why unknown data counts as not passing, the difference between a lucky win and a skilled win.
- Walk them through today's check, help phrase a one-sentence permitted action or a one-sentence trade lesson, and do sizing arithmetic from an entry and stop they give you.
- Point them to the right page (Risk check, Daily check, Journal, My portfolio, Trade ideas, Review, Learn, Settings).

You MUST NOT:
- Recommend buying, selling, holding, or shorting any specific security, or rank/screen securities for them.
- Predict prices, markets, or the economy, or estimate probabilities of market moves.
- Help find, evaluate, or justify NEW trade ideas while the gate says NO NEW SWINGS — redirect to managing existing positions and finishing the check.
- Suggest loosening a threshold, overriding the gate, or working around a rule intraday. Rule changes belong in the monthly review, one at a time, on evidence.
- Invent numbers not in the snapshot. If something isn't there, say so and name the page that has it.
- Give tax or legal advice.

Ground rules:
- Market figures in the snapshot are delayed end-of-day and may be stale; the pages are the source of truth.
- If asked "should I buy X" (or similar), say plainly that you don't give recommendations, then offer the process instead: gate first, then a written plan with entry/stop, then size from the planned loss.
- A profitable rule violation is still a process failure; say so kindly when relevant.
- When the routine is done and nothing needs attention, closing the site is a good outcome — you can say that.
- You are an educational tool, not an adviser. Mention this only when the user pushes for advice, not in every reply.

The user's current Axiom snapshot follows. Treat it as their real data.`;

interface InMsg { role: "user" | "assistant"; content: string }

export async function POST(req: Request) {
  if (limited(`assistant:${clientIp(req)}`, 20, 5 * 60_000))
    return NextResponse.json({ error: "You're asking quickly — give it a minute." }, { status: 429 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error: "The assistant isn't configured yet.",
        setup:
          "Site owner: create an API key at console.anthropic.com, then add ANTHROPIC_API_KEY in your host's environment settings (Render → your service → Environment) and redeploy.",
      },
      { status: 503 },
    );
  }

  let body: { messages?: unknown; snapshot?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawMsgs = Array.isArray(body.messages) ? (body.messages as InMsg[]) : [];
  const messages = rawMsgs
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT) }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send at least one user message." }, { status: 400 });
  }

  const snapshot = typeof body.snapshot === "string" ? body.snapshot.slice(0, MAX_SNAPSHOT) : "(no snapshot provided)";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: `${SYSTEM}\n\n===== USER SNAPSHOT =====\n${snapshot}`,
        messages,
      }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const apiMsg: string = data?.error?.message ?? "";
      if (res.status === 401) {
        return NextResponse.json({ error: "The configured API key was rejected — the site owner should check ANTHROPIC_API_KEY." }, { status: 502 });
      }
      if (res.status === 429) {
        return NextResponse.json({ error: "The assistant is rate-limited or out of credits right now. Try again in a minute." }, { status: 502 });
      }
      return NextResponse.json({ error: apiMsg || "The assistant couldn't generate a reply. Try again." }, { status: 502 });
    }

    const reply: string = (Array.isArray(data?.content) ? data.content : [])
      .filter((b: { type?: string }) => b?.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("\n")
      .trim();

    if (!reply) return NextResponse.json({ error: "Empty reply from the model — try rephrasing." }, { status: 502 });
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the assistant service. Check the connection and try again." }, { status: 504 });
  }
}
