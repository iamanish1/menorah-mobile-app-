#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Menorah Health App - Diagnostic Tool\n');

// Check if we're in the right directory
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Error: package.json not found. Please run this script from the project root.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.name !== 'menorah-health-app') {
  console.error('❌ Error: This doesn\'t appear to be the Menorah Health App project.');
  process.exit(1);
}

console.log('✅ Project structure verified\n');

// Check Node.js version
const nodeVersion = process.version;
console.log(`📋 Node.js version: ${nodeVersion}`);

// Check if npm is available
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  console.log(`📋 npm version: ${npmVersion}`);
} catch (error) {
  console.error('❌ npm not found or not accessible');
}

// Check if Expo CLI is available
try {
  const expoVersion = execSync('npx expo --version', { encoding: 'utf8' }).trim();
  console.log(`📋 Expo CLI version: ${expoVersion}`);
} catch (error) {
  console.error('❌ Expo CLI not found. Installing...');
  try {
    execSync('npm install -g @expo/cli', { stdio: 'inherit' });
    console.log('✅ Expo CLI installed');
  } catch (installError) {
    console.error('❌ Failed to install Expo CLI');
  }
}

console.log('\n🔧 Checking project dependencies...');

// Check if node_modules exists
const nodeModulesPath = path.join(process.cwd(), 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.log('⚠️  node_modules not found. Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed');
  } catch (error) {
    console.error('❌ Failed to install dependencies');
  }
} else {
  console.log('✅ node_modules found');
}

// Check TypeScript configuration
console.log('\n📝 Checking TypeScript configuration...');
try {
  execSync('npx tsc --noEmit', { stdio: 'pipe' });
  console.log('✅ TypeScript compilation successful');
} catch (error) {
  console.error('❌ TypeScript compilation errors found:');
  console.error(error.stdout.toString());
}

// Check ESLint
console.log('\n🔍 Checking code quality...');
try {
  execSync('npx eslint . --ext .ts,.tsx --max-warnings 0', { stdio: 'pipe' });
  console.log('✅ ESLint passed');
} catch (error) {
  console.error('❌ ESLint found issues:');
  console.error(error.stdout.toString());
}

// Check environment configuration
console.log('\n⚙️  Checking environment configuration...');
const appConfigPath = path.join(process.cwd(), 'app.config.ts');
if (fs.existsSync(appConfigPath)) {
  const appConfig = fs.readFileSync(appConfigPath, 'utf8');
  if (appConfig.includes('API_BASE_URL')) {
    console.log('✅ API_BASE_URL configured');
  } else {
    console.log('⚠️  API_BASE_URL not found in app.config.ts');
  }
} else {
  console.error('❌ app.config.ts not found');
}

// Check metro configuration
console.log('\n🚇 Checking Metro configuration...');
const metroConfigPath = path.join(process.cwd(), 'metro.config.js');
if (fs.existsSync(metroConfigPath)) {
  const metroConfig = fs.readFileSync(metroConfigPath, 'utf8');
  if (metroConfig.includes('@')) {
    console.log('✅ Path aliases configured in Metro');
  } else {
    console.log('⚠️  Path aliases not configured in Metro');
  }
} else {
  console.error('❌ metro.config.js not found');
}

// Check for common issues
console.log('\n🔍 Checking for common issues...');

// Check if .expo directory exists (indicates Expo has been used)
const expoDirPath = path.join(process.cwd(), '.expo');
if (fs.existsSync(expoDirPath)) {
  console.log('✅ Expo cache directory found');
} else {
  console.log('ℹ️  Expo cache directory not found (this is normal for fresh projects)');
}

// Check for lock files
const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
const foundLockFiles = lockFiles.filter(file => fs.existsSync(path.join(process.cwd(), file)));
if (foundLockFiles.length > 0) {
  console.log(`✅ Lock file found: ${foundLockFiles.join(', ')}`);
} else {
  console.log('⚠️  No lock file found');
}

console.log('\n📋 Summary of recommendations:');
console.log('1. If you see any ❌ errors above, fix them first');
console.log('2. Run "npm start" to start the development server');
console.log('3. Use "npm run start:fast" for tunnel mode (recommended for device testing)');
console.log('4. If you encounter network errors, check the TROUBLESHOOTING.md file');
console.log('5. Make sure your API server is running if you\'re testing authentication');

console.log('\n🚀 Ready to start development!');
console.log('Run: npm start');
