#!/usr/bin/env node
/**
 * TakeControl Setup Script
 * Initializes the development environment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

async function main() {
  console.log('\n🚀 TakeControl Setup\n');
  console.log('═'.repeat(50));

  console.log('\n📁 Setting up directories...');
  ensureDirectories();

  console.log('\n🔑 Setting up environment...');
  copyEnvFile();

  console.log('\n📦 Installing dependencies...');
  run('pnpm install');

  console.log('\n🏗  Building shared packages...');
  run('pnpm --filter @take-control/shared build');
  run('pnpm --filter @take-control/database db:generate');

  console.log('\n🐳 Starting Docker services...');
  try {
    run('docker-compose up -d postgres redis');
    console.log('⏳ Waiting for services to be ready...');
    execSync('sleep 5', { stdio: 'inherit' });
  } catch {
    console.log('⚠️  Docker not available, skipping service startup');
    console.log('   Please start PostgreSQL and Redis manually');
  }

  console.log('\n🗄  Running database migrations...');
  try {
    run('pnpm --filter @take-control/database db:migrate:dev -- --name init');
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
