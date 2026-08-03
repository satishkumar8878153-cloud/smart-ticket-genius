#!/usr/bin/env node
/**
 * Security gate for CI.
 *
 * Fails (exit 1) when the dependency audit reports any HIGH or CRITICAL
 * vulnerability. Run this before any deploy step so releases are blocked.
 *
 * Usage: node scripts/security-gate.mjs
 */
import { spawnSync } from "node:child_process";

const BLOCKING = new Set(["high", "critical"]);

function runAudit() {
  // Prefer npm audit: it emits a stable JSON schema and works with the
  // bun.lock-generated package-lock produced in CI.
  const result = spawnSync("npm", ["audit", "--json", "--omit=dev"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (!result.stdout) {
    console.error("Security gate: could not run `npm audit`.");
    console.error(result.stderr || "no output");
    process.exit(2);
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    console.error("Security gate: could not parse audit output.");
    console.error(result.stdout.slice(0, 2000));
    process.exit(2);
  }
}

function collectFindings(report) {
  const findings = [];
  const vulns = report.vulnerabilities ?? {};
  for (const [name, info] of Object.entries(vulns)) {
    const severity = String(info.severity ?? "").toLowerCase();
    if (!BLOCKING.has(severity)) continue;
    findings.push({
      name,
      severity,
      range: info.range ?? "unknown",
      fixAvailable: Boolean(info.fixAvailable),
    });
  }
  return findings.sort((a, b) => a.severity.localeCompare(b.severity) || a.name.localeCompare(b.name));
}

const report = runAudit();
const findings = collectFindings(report);

if (findings.length === 0) {
  console.log("Security gate passed: no high or critical dependency vulnerabilities.");
  process.exit(0);
}

console.error(`Security gate FAILED: ${findings.length} high/critical finding(s).\n`);
for (const f of findings) {
  console.error(
    `  [${f.severity.toUpperCase()}] ${f.name} (${f.range}) — ${f.fixAvailable ? "fix available" : "no automatic fix"}`,
  );
}
console.error("\nResolve with `bun update <package>` / `npm audit fix`, then re-run the gate.");
process.exit(1);
