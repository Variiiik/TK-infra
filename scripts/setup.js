#!/usr/bin/env node
/**
 * TakeControl Setup Script
 * Initializes the development environment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function copyEnvFile() {
  const envExample = path.join(ROOT, '.env.example');
  const envFile = path.join(ROOT, '.env');

  if (!fs.existsSync(envFile)) {
    let content = fs.readFileSync(envExample, 'utf8');

    // Auto-generate secrets
    content = content.replace(
      'your-super-secret-jwt-key-change-in-production-min-32-chars',
      generateSecret(48)
    );
    content = content.replace(
      'your-refresh-secret-key-change-in-production-min-32-chars',
      generateSecret(48)
    );
    content = content.replace(
      '32-char-encryption-key-change-me!',
      generateSecret(32)
    );
    content = content.replace(
      '16-char-iv-change!',
      generateSecret(16)
    );

    fs.writeFileSync(envFile, content);
    console.log('✅ .env file created with generated secrets');
  } else {
    console.log('⏭  .env file already exists, skipping');
  }

  // FIX: Ensure DATABASE_URL password matches DB_PASSWORD
  let envContent = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const dbPasswordMatch = envContent.match(/^DB_PASSWORD=(.+)$/m);
  if (dbPasswordMatch) {
    const dbPassword = dbPasswordMatch[1].trim();
    envContent = envContent.replace(
      /DATABASE_URL="postgresql:\/\/([^:]+):([^@]+)@/,
      `DATABASE_URL="postgresql://$1:${dbPassword}@`
    );
    fs.writeFileSync(path.join(ROOT, '.env'), envContent);
    console.log('✅ DATABASE_URL password synced with DB_PASSWORD');
  }

  // FIX: Create .env symlinks so subpackages find env variables
  const symlinks = [
    'packages/database/.env',
    'apps/backend/.env',
  ];
  symlinks.forEach(link => {
    const linkPath = path.join(ROOT, link);
    if (!fs.existsSync(linkPath)) {
      try {
        fs.symlinkSync(path.join(ROOT, '.env'), linkPath);
        console.log(`✅ Created symlink ${link} -> .env`);
      } catch (e) {
        console.log(`⚠️  Could not create symlink ${link}: ${e.message}`);
      }
    }
  });
}

function ensureDirectories() {
  const dirs = [
    'logs',
    'uploads',
    'infrastructure/ssl',
  ];
  dirs.forEach(dir => {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
      console.log(`✅ Created ${dir}/`);
    }
  });
}

// FIX: Fix docker-compose.yml redis command if REDIS_PASSWORD is empty
function fixDockerCompose() {
  const composePath = path.join(ROOT, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return;

  let content = fs.readFileSync(composePath, 'utf8');
  let changed = false;

  // Remove obsolete version attribute
  if (content.match(/^version:/m)) {
    content = content.replace(/^version:.*\n/m, '');
    changed = true;
    console.log('✅ Removed obsolete version attribute from docker-compose.yml');
  }

  // Fix Redis requirepass with empty password causing crash
  if (content.includes("--requirepass ${REDIS_PASSWORD:-} --appendonly yes")) {
    content = content.replace(
      "redis-server --requirepass ${REDIS_PASSWORD:-} --appendonly yes",
      "redis-server --appendonly yes"
    );
    changed = true;
    console.log('✅ Fixed Redis password config in docker-compose.yml');
  }

  if (changed) {
    fs.writeFileSync(composePath, content);
  }
}

// FIX: Fix db:seed script to use tsx instead of ts-node (ESM compatibility)
function fixSeedScript() {
  const dbPkgPath = path.join(ROOT, 'packages/database/package.json');
  if (!fs.existsSync(dbPkgPath)) return;

  const dbPkg = JSON.parse(fs.readFileSync(dbPkgPath, 'utf8'));
  if (dbPkg.scripts?.['db:seed']?.includes('ts-node')) {
    dbPkg.scripts['db:seed'] = dbPkg.scripts['db:seed'].replace('ts-node', 'tsx');
    fs.writeFileSync(dbPkgPath, JSON.stringify(dbPkg, null, 2) + '\n');
    console.log('✅ Fixed db:seed to use tsx instead of ts-node');
  }
}

// FIX: Fix double /api/v1/api/v1 prefix in web service
function fixApiPrefix() {
  const apiServicePath = path.join(ROOT, 'apps/web/src/services/api.ts');
  if (!fs.existsSync(apiServicePath)) return;

  let content = fs.readFileSync(apiServicePath, 'utf8');
  if (content.includes('baseURL: `${BASE_URL}/api/v1`')) {
    content = content.replace(
      'baseURL: `${BASE_URL}/api/v1`',
      'baseURL: `${BASE_URL}`'
    );
    fs.writeFileSync(apiServicePath, content);
    console.log('✅ Fixed double /api/v1 prefix in apps/web/src/services/api.ts');
  }
}

// FIX: Exclude desktop app from dev command (Electron needs GUI/display)
function fixDevScript() {
  const rootPkgPath = path.join(ROOT, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

  if (rootPkg.scripts?.dev && !rootPkg.scripts.dev.includes('desktop')) {
    rootPkg.scripts.dev = rootPkg.scripts.dev.replace(
      'turbo run dev',
      'turbo run dev --filter=!@take-control/desktop'
    );
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
    console.log('✅ Excluded desktop app from dev command (headless server)');
  }
}

// FIX: Copy Prisma engine files to pnpm hoisted cache location
function fixPrismaClient() {
  try {
    const src = path.join(ROOT, 'packages/database/node_modules/.prisma/client');
    if (!fs.existsSync(src)) {
      console.log('⚠️  Prisma client not yet generated, skipping copy');
      return;
    }

    const result = execSync(
      'find node_modules/.pnpm -name "default.js" -path "*/.prisma/client/*" 2>/dev/null | head -1',
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();

    if (result) {
      const dest = path.dirname(result);
      execSync(`cp -r ${src}/. ${dest}/`, { cwd: ROOT });
      console.log('✅ Prisma engine copied to pnpm hoisted cache');
    }
  } catch (e) {
    console.log('⚠️  Could not auto-fix Prisma client:', e.message);
  }
}

// FIX: Wait for PostgreSQL to actually be healthy instead of fixed sleep
function waitForPostgres(containerName = 'tc_postgres', user = 'takecontrol', timeoutSeconds = 60) {
  console.log('⏳ Waiting for PostgreSQL to be ready...');
  const retries = timeoutSeconds / 2;
  for (let i = 0; i < retries; i++) {
    try {
      execSync(`docker exec ${containerName} pg_isready -U ${user}`, { stdio: 'pipe' });
      console.log('✅ PostgreSQL is ready');
      return true;
    } catch {
      execSync('sleep 2', { stdio: 'pipe' });
    }
  }
  throw new Error(`PostgreSQL did not become ready within ${timeoutSeconds}s`);
}

async function main() {
  console.log('\n🚀 TakeControl Setup\n');
  console.log('═'.repeat(50));

  console.log('\n📁 Setting up directories...');
  ensureDirectories();

  console.log('\n🔑 Setting up environment...');
  copyEnvFile();

  console.log('\n🔧 Applying compatibility fixes...');
  fixDockerCompose();
  fixSeedScript();
  fixApiPrefix();
  fixDevScript();

  console.log('\n📦 Installing dependencies...');
  run('pnpm install');

  // FIX: Install tsx for seed script ESM compatibility
  run('pnpm add -D tsx --filter @take-control/database');

  console.log('\n🏗  Building shared packages...');
  run('pnpm --filter @take-control/shared build');
  run('pnpm --filter @take-control/database db:generate');

  // FIX: Copy Prisma engine to pnpm hoisted location after generate
  console.log('\n🔧 Fixing Prisma client for pnpm monorepo...');
  fixPrismaClient();

  console.log('\n🐳 Starting Docker services...');
  try {
    // FIX: Use 'docker compose' instead of deprecated 'docker-compose'
    run('docker compose up -d postgres redis');
    // FIX: Wait for actual health instead of fixed sleep
    waitForPostgres();
  } catch (e) {
    console.log('⚠️  Docker not available, skipping service startup');
    console.log('   Please start PostgreSQL and Redis manually');
  }

  console.log('\n🗄  Running database migrations...');
  try {
    run('pnpm --filter=@take-control/database exec prisma migrate dev --name init');
    run('pnpm --filter @take-control/database db:seed');
  } catch (err) {
    console.log('⚠️  Database migration failed:', err.message);
    console.log('   Make sure DATABASE_URL is correct in .env');
  }

  console.log('\n✅ Setup complete!\n');
  console.log('═'.repeat(50));
  console.log('\n📋 Next steps:');
  console.log('   1. Review .env file and adjust settings');
  console.log('   2. Run: pnpm dev');
  console.log('   3. Open: http://localhost:3000');
  console.log('\n🔑 Demo credentials:');
  console.log('   Admin:      admin@takecontrol.app / Admin@123456!');
  console.log('   Technician: tech@takecontrol.app / Tech@123456!');
  console.log('   User:       user@takecontrol.app / User@123456!');
  console.log('\n');
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  process.exit(1);
});
