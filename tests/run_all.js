#!/usr/bin/env node
/**
 * tests/run_all.js
 * Master Automated CLI Test Runner for Engineer Islam Fouda Work Management System
 * Executes 5-Tier test suites with ANSI-colored reporting and standard exit codes (0/1).
 */

const path = require('node:path');
const { testRegistry } = require('./harness.js');

// Parse CLI flags
const args = process.argv.slice(2);
let filterTier = null;
let filterFeature = null;
let filterMilestone = null;
let verbose = false;

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    filterTier = arg.split('=')[1].trim();
  } else if (arg.startsWith('--feature=')) {
    filterFeature = arg.split('=')[1].trim().toUpperCase();
  } else if (arg.startsWith('--milestone=') || arg.startsWith('-m=')) {
    filterMilestone = arg.split('=')[1].trim().toUpperCase();
  } else if (arg === '--verbose' || arg === '-v') {
    verbose = true;
  }
}

const FEATURE_MILESTONE_MAP = {
  F01: 'M1', F02: 'M1', F03: 'M1', F04: 'M1',
  F05: 'M2', F06: 'M2', F07: 'M2', F08: 'M2', F09: 'M2', F10: 'M2', F11: 'M2',
  F12: 'M3', F13: 'M3', F14: 'M3', F15: 'M3', F16: 'M3',
  F17: 'M4', F18: 'M4', F19: 'M4', F20: 'M4', F21: 'M4',
  Pairwise: 'M5', Scenarios: 'M5',
  WorkCenter: 'M6'
};

// ANSI Color formatting
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m'
};

function banner() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.white}   ENGINEER ISLAM FOUDA WORK MANAGEMENT SYSTEM — 5-TIER TEST RUNNER    ${colors.reset}`);
  console.log(`${colors.dim}   Node.js v${process.versions.node} | Offline Native Test Engine | Target: Base V16.48   ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
}

// Load test suites
function loadSuites() {
  require('./tier1_features.test.js');
  require('./tier2_boundaries.test.js');
  require('./tier3_pairwise.test.js');
  require('./tier4_scenarios.test.js');
  require('./tier5_work_center.test.js');
}

async function run() {
  banner();
  loadSuites();

  const totalRegistered = testRegistry.length;
  console.log(`${colors.dim}Loaded ${totalRegistered} test cases across 5 verification tiers.${colors.reset}`);
  if (filterTier) console.log(`${colors.yellow}Filter Tier: Tier ${filterTier}${colors.reset}`);
  if (filterFeature) console.log(`${colors.yellow}Filter Feature: ${filterFeature}${colors.reset}`);
  if (filterMilestone) console.log(`${colors.yellow}Filter Milestone: ${filterMilestone}${colors.reset}`);
  console.log('');

  const filteredTests = testRegistry.filter(t => {
    if (filterTier) {
      const matchTier = t.tier.toLowerCase().includes(filterTier.toLowerCase()) ||
                        t.tier.replace(/[^0-9]/g, '') === filterTier.replace(/[^0-9]/g, '');
      if (!matchTier) return false;
    }
    if (filterFeature) {
      if (t.feature && !t.feature.toUpperCase().includes(filterFeature)) return false;
    }
    if (filterMilestone) {
      const feat = t.feature || '';
      const milestone = FEATURE_MILESTONE_MAP[feat] || (t.tier === 'Tier 3' || t.tier === 'Tier 4' ? 'M5' : 'M1');
      if (milestone !== filterMilestone) return false;
    }
    return true;
  });

  if (filteredTests.length === 0) {
    console.log(`${colors.red}No tests matched the specified filters.${colors.reset}\n`);
    process.exit(1);
  }

  const tierStats = {
    'Tier 1': { total: 0, passed: 0, failed: 0, duration: 0 },
    'Tier 2': { total: 0, passed: 0, failed: 0, duration: 0 },
    'Tier 3': { total: 0, passed: 0, failed: 0, duration: 0 },
    'Tier 4': { total: 0, passed: 0, failed: 0, duration: 0 },
    'Tier 5': { total: 0, passed: 0, failed: 0, duration: 0 }
  };

  let totalPassed = 0;
  let totalFailed = 0;
  const failures = [];
  let currentGroup = '';

  const startTime = Date.now();

  for (const t of filteredTests) {
    const groupKey = `[${t.tier}] ${t.suite || t.feature}`;
    if (groupKey !== currentGroup) {
      currentGroup = groupKey;
      console.log(`\n${colors.bold}${colors.magenta}${currentGroup}${colors.reset}`);
    }

    const tierKey = t.tier.startsWith('Tier') ? t.tier : 'Tier 1';
    if (!tierStats[tierKey]) {
      tierStats[tierKey] = { total: 0, passed: 0, failed: 0, duration: 0 };
    }
    tierStats[tierKey].total++;

    const t0 = Date.now();
    try {
      if (t.fn.constructor.name === 'AsyncFunction') {
        await t.fn();
      } else {
        t.fn();
      }
      t.passed = true;
      t.durationMs = Date.now() - t0;
      tierStats[tierKey].passed++;
      tierStats[tierKey].duration += t.durationMs;
      totalPassed++;

      const timing = `${t.durationMs}ms`;
      console.log(`  ${colors.green}✔ PASS${colors.reset}  ${colors.white}${t.name}${colors.reset} ${colors.dim}(${timing})${colors.reset}`);
    } catch (err) {
      t.passed = false;
      t.error = err;
      t.durationMs = Date.now() - t0;
      tierStats[tierKey].failed++;
      tierStats[tierKey].duration += t.durationMs;
      totalFailed++;

      console.log(`  ${colors.red}✖ FAIL${colors.reset}  ${colors.bold}${colors.white}${t.name}${colors.reset}`);
      if (verbose || failures.length < 5) {
        console.log(`     ${colors.red}${err.message}${colors.reset}`);
      }
      failures.push({ test: t, error: err });
    }
  }

  const totalDuration = Date.now() - startTime;

  // Print Summary Table
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.white}                           TIER SUMMARY REPORT                          ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`| ${'Tier'.padEnd(8)} | ${'Total'.padStart(6)} | ${'Passed'.padStart(6)} | ${'Failed'.padStart(6)} | ${'Pass %'.padStart(7)} | ${'Duration'.padStart(9)} |`);
  console.log(`|----------|--------|--------|--------|---------|-----------|`);

  for (const [tierName, stats] of Object.entries(tierStats)) {
    if (stats.total > 0) {
      const pct = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) + '%' : 'N/A';
      const dur = `${stats.duration}ms`;
      const passColor = stats.failed === 0 ? colors.green : colors.red;
      console.log(
        `| ${tierName.padEnd(8)} | ${String(stats.total).padStart(6)} | ${passColor}${String(stats.passed).padStart(6)}${colors.reset} | ${String(stats.failed).padStart(6)} | ${passColor}${pct.padStart(7)}${colors.reset} | ${dur.padStart(9)} |`
      );
    }
  }
  console.log(`|----------|--------|--------|--------|---------|-----------|`);
  const totalPct = filteredTests.length > 0 ? ((totalPassed / filteredTests.length) * 100).toFixed(1) + '%' : '0%';
  console.log(
    `| ${'TOTAL'.padEnd(8)} | ${String(filteredTests.length).padStart(6)} | ${colors.bold}${String(totalPassed).padStart(6)}${colors.reset} | ${String(totalFailed).padStart(6)} | ${colors.bold}${totalPct.padStart(7)}${colors.reset} | ${String(totalDuration + 'ms').padStart(9)} |`
  );
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (totalFailed > 0) {
    console.log(`${colors.bold}${colors.red}FAILURES OVERVIEW (${totalFailed} test failure(s)):${colors.reset}`);
    failures.forEach((f, idx) => {
      console.log(`\n${colors.bold}${idx + 1}. [${f.test.tier}] ${f.test.name}${colors.reset}`);
      console.log(`${colors.red}${f.error.stack || f.error.message}${colors.reset}`);
    });
    console.log(`\n${colors.bold}${colors.bgRed}${colors.white} [FAILED - ACTION REQUIRED] ${colors.reset} — Some tests did not pass.\n`);
    process.exit(1);
  } else {
    console.log(`${colors.bold}${colors.bgGreen}${colors.white} [PASSED - READY FOR QA] ${colors.reset} — All ${totalPassed} tests passed successfully with 100% fidelity!\n`);
    process.exit(0);
  }
}

run().catch(err => {
  console.error(`\n${colors.red}Fatal test runner crash:${colors.reset}`, err);
  process.exit(1);
});
