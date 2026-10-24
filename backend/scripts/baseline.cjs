#!/usr/bin/env node
/**
 * Pre-deploy baseline, run from backend/ right BEFORE `prisma migrate deploy` (see the
 * `start:prod` script). Safe to run on every boot: it only writes in the two cases below.
 *
 * - Empty database (new Railway / PR environment, re-provisioned Postgres, restore into a fresh
 *   instance): nothing to do, `migrate deploy` then runs every migration from 0001_init.
 * - Database built by the old `prisma db push` (app tables but no migration history): the
 *   migrations whose changes are already in the database are recorded as applied
 *   (0001_init = "User" table, 0002 = "User"."bannedAt", 0003 = "UserMonthlyLogin").
 *   The later migrations are idempotent and run normally.
 * - Database broken by the old start command (`migrate resolve --applied 0001_init` run on an
 *   EMPTY database: 0001 recorded but never run, 0002 failed, every boot fails with P3009):
 *   the bogus history is cleared so `migrate deploy` can build the schema.
 * - Database already managed by migrate (production since the 2026-05-05 baseline): untouched.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const BACKEND_DIR = path.join(__dirname, '..');
const PRISMA_CLI = require.resolve('prisma/build/index.js', { paths: [BACKEND_DIR] });

/** Migrations created before migrate was used, with the SQL test telling they are already applied. */
const PRE_MIGRATE = [
  { name: '0001_init', present: `to_regclass('"User"') IS NOT NULL` },
  {
    name: '0002_add_banned_at',
    present: `EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'bannedAt')`,
  },
  { name: '0003_add_monthly_logins', present: `to_regclass('"UserMonthlyLogin"') IS NOT NULL` },
];

const log = (msg) => console.log(`[baseline] ${msg}`);

function resolveApplied(name) {
  log(`recording ${name} as already applied`);
  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'resolve', '--applied', name], { cwd: BACKEND_DIR, stdio: 'inherit' });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const [state] = await prisma.$queryRawUnsafe(`SELECT
      to_regclass('"User"') IS NOT NULL AS users,
      to_regclass('"Product"') IS NOT NULL AS products,
      to_regclass('"_prisma_migrations"') IS NOT NULL AS history`);
    let historyRows = 0;
    if (state.history) {
      const [row] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "_prisma_migrations"`);
      historyRows = row.n;
    }

    if (historyRows > 0) {
      if (!state.users && !state.products) {
        const rows = await prisma.$queryRawUnsafe(
          `SELECT migration_name AS name, finished_at IS NOT NULL AS done FROM "_prisma_migrations" ORDER BY started_at`,
        );
        log(`migration history without any app table (${rows.map((r) => `${r.name}${r.done ? '' : ' (failed)'}`).join(', ')}): clearing it so migrate deploy builds the schema`);
        await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations"`);
      } else {
        log(`database managed by migrate (${historyRows} migration(s) recorded): nothing to do`);
      }
      return;
    }

    if (!state.users) {
      log('empty database: migrate deploy will run every migration');
      return;
    }

    log('database created by `prisma db push` (no migration history): baselining');
    const present = [];
    for (const m of PRE_MIGRATE) {
      const [row] = await prisma.$queryRawUnsafe(`SELECT ${m.present} AS present`);
      if (!row.present) break; // each one builds on the previous
      present.push(m.name);
    }
    await prisma.$disconnect(); // `migrate resolve` opens its own connection

    for (const name of present) resolveApplied(name);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[baseline] failed:', err?.message ?? err);
  process.exit(1);
});
