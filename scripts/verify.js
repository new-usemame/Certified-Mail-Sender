#!/usr/bin/env node
require('dotenv').config();

const { runAll } = require('../services/healthCheck');

async function run() {
  console.log('Verifying setup...\n');

  const { results, summary } = await runAll();

  console.log('--- RESULTS ---\n');

  const passed = results.filter((r) => r.status === 'pass');
  const failed = results.filter((r) => r.status === 'fail');

  if (passed.length > 0) {
    console.log(`PASSED (${passed.length}):`);
    for (const r of passed) console.log(`  [OK]   ${r.name}`);
  }

  if (failed.length > 0) {
    console.log(`\nFAILED (${failed.length}):`);
    for (const r of failed) console.log(`  [FAIL] ${r.name}: ${r.error}`);
  }

  console.log(`\n${summary.passed}/${summary.total} checks passed.`);

  if (summary.failed > 0) {
    console.log('\nFix the failed items above, then run this script again.');
    process.exit(1);
  } else {
    console.log('\nAll checks passed. You are ready to go.');
  }
}

run().catch((e) => {
  console.error('Verification script error:', e);
  process.exit(1);
});
