# Influences and attribution

Axiom borrows *ideas* from these open-source projects. **No code is copied from the
GPL/AGPL projects below** — doing so would require Axiom itself to be relicensed.
Everything here was reimplemented from the documented behaviour.

## Freqtrade — GPL-3.0 · https://github.com/freqtrade/freqtrade

- **Protections.** Freqtrade's `StoplossGuard`, `MaxDrawdown`, `CooldownPeriod` and
  `LowProfitPairs` plugins lock trading globally or per-pair after your *own* recent
  results turn bad. Axiom's `lib/engine/protections.ts` reimplements this idea and adds
  two of its own: a revenge-trade guard, and a lock while closed trades still lack a
  reflection. Freqtrade is GPL-3; the implementation here is original.
- **Recursive analysis.** Freqtrade documents that recursive indicators (EMA, RSI, MACD)
  give different values depending on how much history was loaded — a backtest/live
  mismatch. Measuring our own code showed ~6 RSI points and ~26% MACD drift between a
  35-bar and an 800-bar fetch, flipping a Copilot entry condition in ~9% of test series.
  Fixed with a shared warm-up window (`WARMUP_BARS`).
- **Lookahead analysis.** Their approach to detecting future-peeking is the standard any
  Axiom backtester should meet before its numbers are believed.

## Intelligent Trading Bot — MIT · https://github.com/asavinov/intelligent-trading-bot

- Its stated goal — *guarantee that the same derived features are used in both offline
  (training) and online (prediction) modes* — is the same insight as above, and is why
  Axiom now computes indicators identically for charts, Copilot, and any future backtest.
- MIT-licensed, so code reuse is permitted with attribution should we adopt any.

## Fincept Terminal — AGPL-3.0 · https://github.com/Fincept-Corporation/FinceptTerminal

- A Qt desktop terminal; a different product category from Axiom. Its pluggable
  data-source abstraction is a reasonable model if Axiom ever supports more than
  Stooq/FRED. AGPL — network use triggers source distribution, so no code is used.
