import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ---------- Types ----------

interface Verification {
  passed: number;
  failed: number;
  total: number;
  success: boolean;
  checks: { name: string; pass: boolean }[];
}

interface TrialResult {
  condition: string;
  trial: number;
  branch: string;
  claude_exit_code: number;
  wall_clock_ms: number;
  num_turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  verification: Verification;
  parse_error: boolean;
  timestamp: string;
}

interface Stats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  median: number;
}

// ---------- Helpers ----------

function computeStats(values: number[]): Stats {
  if (values.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0, median: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { mean, stdDev: Math.sqrt(variance), min: sorted[0], max: sorted[sorted.length - 1], median };
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function fmtMs(ms: number): string {
  const s = ms / 1000;
  return s >= 60 ? `${fmt(s / 60)}m` : `${fmt(s)}s`;
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${fmt(n / 1000, 1)}k` : `${Math.round(n)}`;
}

function delta(without: number, withAre: number): string {
  if (without === 0) return "N/A";
  const pct = ((withAre - without) / without) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${fmt(pct)}%`;
}

// ---------- Load Results ----------

const benchDir = join(import.meta.dirname!, "..");
const resultsDir = join(benchDir, "benchmark", "results");

// Handle both being called from project root and from benchmark/
const altResultsDir = join(import.meta.dirname!, "results");
const effectiveResultsDir = existsSync(resultsDir) ? resultsDir : altResultsDir;

function loadTrials(condition: string): TrialResult[] {
  const dir = join(effectiveResultsDir, condition);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith("trial-") && f.endsWith(".json") && !f.includes("-raw"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")));
}

const withoutTrials = loadTrials("without-are");
const withTrials = loadTrials("with-are");

if (withoutTrials.length === 0 && withTrials.length === 0) {
  console.error("No trial results found. Run benchmark trials first.");
  process.exit(1);
}

// ---------- Compute Stats ----------

interface ConditionStats {
  wallClock: Stats;
  turns: Stats;
  inputTokens: Stats;
  outputTokens: Stats;
  cacheReadTokens: Stats;
  totalTokens: Stats;
  cost: Stats;
  verifyScore: Stats;
  successRate: number;
  trials: TrialResult[];
}

function analyzeCondition(trials: TrialResult[]): ConditionStats {
  return {
    wallClock: computeStats(trials.map((t) => t.wall_clock_ms)),
    turns: computeStats(trials.map((t) => t.num_turns)),
    inputTokens: computeStats(trials.map((t) => t.input_tokens)),
    outputTokens: computeStats(trials.map((t) => t.output_tokens)),
    cacheReadTokens: computeStats(trials.map((t) => t.cache_read_tokens)),
    totalTokens: computeStats(trials.map((t) => t.total_tokens)),
    cost: computeStats(trials.map((t) => t.total_cost_usd)),
    verifyScore: computeStats(trials.map((t) => t.verification.passed)),
    successRate: trials.filter((t) => t.verification.success).length / (trials.length || 1),
    trials,
  };
}

const without = withoutTrials.length > 0 ? analyzeCondition(withoutTrials) : null;
const withAre = withTrials.length > 0 ? analyzeCondition(withTrials) : null;

// ---------- Generate Report ----------

let md = `# ARE E2E Benchmark Results\n\n`;
md += `**Generated**: ${new Date().toISOString()}\n`;
md += `**Trials per condition**: ${Math.max(withoutTrials.length, withTrials.length)}\n\n`;

// Comparison table
if (without && withAre) {
  md += `## Comparison Summary\n\n`;
  md += `| Metric | Without ARE | With ARE | Delta |\n`;
  md += `|--------|-----------|---------|-------|\n`;
  md += `| Wall Clock (mean) | ${fmtMs(without.wallClock.mean)} | ${fmtMs(withAre.wallClock.mean)} | ${delta(without.wallClock.mean, withAre.wallClock.mean)} |\n`;
  md += `| Turns (mean) | ${fmt(without.turns.mean)} | ${fmt(withAre.turns.mean)} | ${delta(without.turns.mean, withAre.turns.mean)} |\n`;
  md += `| Input Tokens (mean) | ${fmtTokens(without.inputTokens.mean)} | ${fmtTokens(withAre.inputTokens.mean)} | ${delta(without.inputTokens.mean, withAre.inputTokens.mean)} |\n`;
  md += `| Output Tokens (mean) | ${fmtTokens(without.outputTokens.mean)} | ${fmtTokens(withAre.outputTokens.mean)} | ${delta(without.outputTokens.mean, withAre.outputTokens.mean)} |\n`;
  md += `| Cache Read Tokens (mean) | ${fmtTokens(without.cacheReadTokens.mean)} | ${fmtTokens(withAre.cacheReadTokens.mean)} | ${delta(without.cacheReadTokens.mean, withAre.cacheReadTokens.mean)} |\n`;
  md += `| Total Tokens (mean) | ${fmtTokens(without.totalTokens.mean)} | ${fmtTokens(withAre.totalTokens.mean)} | ${delta(without.totalTokens.mean, withAre.totalTokens.mean)} |\n`;
  md += `| Cost USD (mean) | $${fmt(without.cost.mean, 3)} | $${fmt(withAre.cost.mean, 3)} | ${delta(without.cost.mean, withAre.cost.mean)} |\n`;
  md += `| Verification Score (mean) | ${fmt(without.verifyScore.mean)}/9 | ${fmt(withAre.verifyScore.mean)}/9 | ${delta(without.verifyScore.mean, withAre.verifyScore.mean)} |\n`;
  md += `| Success Rate (≥6/9) | ${fmt(without.successRate * 100)}% | ${fmt(withAre.successRate * 100)}% | — |\n`;
  md += `\n`;

  // Interpretation
  md += `## Interpretation\n\n`;
  const timeDelta = ((withAre.wallClock.mean - without.wallClock.mean) / without.wallClock.mean) * 100;
  const tokenDelta = ((withAre.totalTokens.mean - without.totalTokens.mean) / without.totalTokens.mean) * 100;
  const turnDelta = ((withAre.turns.mean - without.turns.mean) / without.turns.mean) * 100;
  const qualityDelta = withAre.verifyScore.mean - without.verifyScore.mean;

  md += `- **Time (H1)**: With ARE was ${Math.abs(timeDelta).toFixed(1)}% ${timeDelta < 0 ? "faster" : "slower"} on average.`;
  md += timeDelta < 0 ? " ✅ Hypothesis supported.\n" : " ❌ Hypothesis not supported.\n";

  md += `- **Tokens (H2)**: With ARE used ${Math.abs(tokenDelta).toFixed(1)}% ${tokenDelta < 0 ? "fewer" : "more"} total tokens.`;
  md += tokenDelta < 0 ? " ✅ Hypothesis supported.\n" : " ❌ Hypothesis not supported.\n";

  md += `- **Turns (H3)**: With ARE needed ${Math.abs(turnDelta).toFixed(1)}% ${turnDelta < 0 ? "fewer" : "more"} turns.`;
  md += turnDelta < 0 ? " ✅ Hypothesis supported.\n" : " ❌ Hypothesis not supported.\n";

  md += `- **Quality (H4)**: With ARE scored ${qualityDelta > 0 ? "+" : ""}${qualityDelta.toFixed(1)} verification points.`;
  md += qualityDelta > 0 ? " ✅ Hypothesis supported.\n" : qualityDelta === 0 ? " ➖ No difference.\n" : " ❌ Hypothesis not supported.\n";

  md += `- **Cache (H5)**: Mean cache read tokens — Without: ${fmtTokens(without.cacheReadTokens.mean)}, With: ${fmtTokens(withAre.cacheReadTokens.mean)}.\n`;
  md += `\n`;
}

// Per-condition detail tables
function conditionTable(label: string, stats: ConditionStats): string {
  let s = `## ${label} — Detail\n\n`;
  s += `| Metric | Mean | StdDev | Min | Max | Median |\n`;
  s += `|--------|------|--------|-----|-----|--------|\n`;
  s += `| Wall Clock | ${fmtMs(stats.wallClock.mean)} | ${fmtMs(stats.wallClock.stdDev)} | ${fmtMs(stats.wallClock.min)} | ${fmtMs(stats.wallClock.max)} | ${fmtMs(stats.wallClock.median)} |\n`;
  s += `| Turns | ${fmt(stats.turns.mean)} | ${fmt(stats.turns.stdDev)} | ${fmt(stats.turns.min)} | ${fmt(stats.turns.max)} | ${fmt(stats.turns.median)} |\n`;
  s += `| Input Tokens | ${fmtTokens(stats.inputTokens.mean)} | ${fmtTokens(stats.inputTokens.stdDev)} | ${fmtTokens(stats.inputTokens.min)} | ${fmtTokens(stats.inputTokens.max)} | ${fmtTokens(stats.inputTokens.median)} |\n`;
  s += `| Output Tokens | ${fmtTokens(stats.outputTokens.mean)} | ${fmtTokens(stats.outputTokens.stdDev)} | ${fmtTokens(stats.outputTokens.min)} | ${fmtTokens(stats.outputTokens.max)} | ${fmtTokens(stats.outputTokens.median)} |\n`;
  s += `| Total Tokens | ${fmtTokens(stats.totalTokens.mean)} | ${fmtTokens(stats.totalTokens.stdDev)} | ${fmtTokens(stats.totalTokens.min)} | ${fmtTokens(stats.totalTokens.max)} | ${fmtTokens(stats.totalTokens.median)} |\n`;
  s += `| Cost USD | $${fmt(stats.cost.mean, 3)} | $${fmt(stats.cost.stdDev, 3)} | $${fmt(stats.cost.min, 3)} | $${fmt(stats.cost.max, 3)} | $${fmt(stats.cost.median, 3)} |\n`;
  s += `| Verify Score | ${fmt(stats.verifyScore.mean)}/9 | ${fmt(stats.verifyScore.stdDev)} | ${fmt(stats.verifyScore.min)} | ${fmt(stats.verifyScore.max)} | ${fmt(stats.verifyScore.median)} |\n`;
  s += `\n`;

  // Per-trial breakdown
  s += `### Per-Trial Results\n\n`;
  s += `| Trial | Time | Turns | Total Tokens | Cost | Score | Pass? |\n`;
  s += `|-------|------|-------|-------------|------|-------|-------|\n`;
  for (const t of stats.trials) {
    s += `| ${t.trial} | ${fmtMs(t.wall_clock_ms)} | ${t.num_turns} | ${fmtTokens(t.total_tokens)} | $${fmt(t.total_cost_usd, 3)} | ${t.verification.passed}/9 | ${t.verification.success ? "✅" : "❌"} |\n`;
  }
  s += `\n`;
  return s;
}

if (without) md += conditionTable("Without ARE", without);
if (withAre) md += conditionTable("With ARE", withAre);

// Methodology
md += `## Methodology\n\n`;
md += `- **Test repo**: htamagnus/to-do-fullstack-nestjs-react (NestJS + React + MySQL + TypeScript)\n`;
md += `- **Feature**: Tags/Labels system (~8-15 files)\n`;
const allTrials = [...withoutTrials, ...withTrials];
const maxTurns = Math.max(...allTrials.map((t) => t.num_turns), 0);
const maxCost = Math.max(...allTrials.map((t) => t.total_cost_usd), 0);
md += `- **Model**: Sonnet, max-turns observed: ${maxTurns}, max cost observed: $${fmt(maxCost, 2)}\n`;
md += `- **Tools**: Read, Write, Edit, Bash, Glob, Grep (no Task/subagents)\n`;
md += `- **Cooldown**: 30s between trials\n`;
md += `- **Verification**: 9-point checklist, success threshold ≥6/9\n`;
md += `- **ARE condition**: Full pipeline (init → discover → generate) committed to branch\n`;

// Write output
mkdirSync(effectiveResultsDir, { recursive: true });
const outputPath = join(effectiveResultsDir, "summary.md");
writeFileSync(outputPath, md);
console.log(`Analysis written to ${outputPath}`);
