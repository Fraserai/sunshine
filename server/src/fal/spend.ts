import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { log } from "../log.js";

/**
 * Approximate fal spend accounting. Not billing-grade — it is a guard rail so
 * development cannot quietly drift through an agreed budget.
 *
 * Published H3 Max rates. The launch promotion is 50% off and ends 1 Sep 2026,
 * after which both tiers double, so the rate is resolved by date rather than
 * hardcoded to today's number.
 */
const PROMO_ENDS = Date.UTC(2026, 8, 1); // 2026-09-01

/** fal-ai/ffmpeg-api/extract-frame is billed on compute time; this is a conservative estimate. */
const EXTRACT_FRAME_ESTIMATE_USD = 0.002;

const BUDGET_USD = Number(process.env.FAL_BUDGET_USD ?? 5);
const ALERT_AT_USD = Number(process.env.FAL_BUDGET_ALERT_USD ?? 4);

const LEDGER = path.resolve(process.cwd(), ".spend.json");

interface Ledger {
  totalUsd: number;
  generations: number;
  entries: Array<{ at: string; kind: string; usd: number }>;
}

function read(): Ledger {
  if (!existsSync(LEDGER)) return { totalUsd: 0, generations: 0, entries: [] };
  try {
    return JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger;
  } catch {
    return { totalUsd: 0, generations: 0, entries: [] };
  }
}

function write(ledger: Ledger): void {
  // Keep the tail only; the total is what matters.
  ledger.entries = ledger.entries.slice(-200);
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
}

export function videoCostUsd(resolution: "480P" | "768P", seconds: number): number {
  const promo = Date.now() < PROMO_ENDS;
  const perSecond = resolution === "768P" ? (promo ? 0.04 : 0.08) : promo ? 0.025 : 0.05;
  return Number((perSecond * seconds).toFixed(4));
}

export function recordVideo(kind: string, resolution: "480P" | "768P", seconds: number): void {
  record(kind, videoCostUsd(resolution, seconds), true);
}

export function recordExtractFrame(): void {
  record("extract_frame", EXTRACT_FRAME_ESTIMATE_USD, false);
}

function record(kind: string, usd: number, isGeneration: boolean): void {
  const ledger = read();
  ledger.totalUsd = Number((ledger.totalUsd + usd).toFixed(4));
  if (isGeneration) ledger.generations += 1;
  ledger.entries.push({ at: new Date().toISOString(), kind, usd });
  write(ledger);

  const remaining = Number((BUDGET_USD - ledger.totalUsd).toFixed(4));
  log.info("fal.spend", {
    kind,
    usd,
    cumulativeUsd: ledger.totalUsd,
    generations: ledger.generations,
    budgetUsd: BUDGET_USD,
    remainingUsd: remaining,
  });

  if (ledger.totalUsd >= BUDGET_USD) {
    log.error("fal.spend.BUDGET_EXCEEDED", { cumulativeUsd: ledger.totalUsd, budgetUsd: BUDGET_USD });
  } else if (ledger.totalUsd >= ALERT_AT_USD) {
    log.warn("fal.spend.ALERT", {
      cumulativeUsd: ledger.totalUsd,
      alertAtUsd: ALERT_AT_USD,
      budgetUsd: BUDGET_USD,
      message: "Approaching the autonomous testing budget.",
    });
  }
}

export function spendSummary(): { totalUsd: number; generations: number; budgetUsd: number; remainingUsd: number } {
  const ledger = read();
  return {
    totalUsd: ledger.totalUsd,
    generations: ledger.generations,
    budgetUsd: BUDGET_USD,
    remainingUsd: Number((BUDGET_USD - ledger.totalUsd).toFixed(4)),
  };
}
