#!/usr/bin/env node

// Runtime health check for the chess application
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

console.log('🔍 Chess Application Runtime Health Check\n');

// Check if servers are running
console.log('1. Checking server processes...');
try {
  const processes = execSync('ps aux | grep -E "(vite|node.*server)" | grep -v grep', { encoding: 'utf8' });
  const lines = processes.trim().split('\n').filter(line => line.length > 0);
  
  const viteRunning = lines.some(line => line.includes('vite'));
  const serverRunning = lines.some(line => line.includes('server/index.js'));
  
  console.log(`   ✅ Vite dev server: ${viteRunning ? 'Running' : 'Not running'}`);
  console.log(`   ✅ Backend server: ${serverRunning ? 'Running' : 'Not running'}`);
  
  if (!viteRunning || !serverRunning) {
    console.log('   ⚠️  Some servers are not running. Run: npm run dev:all');
  }
} catch (error) {
  console.log('   ❌ Error checking processes:', error.message);
}

// Check API endpoints
console.log('\n2. Checking API endpoints...');
try {
  const healthCheck = execSync('curl -s http://localhost:3001/api/health', { encoding: 'utf8' });
  const health = JSON.parse(healthCheck);
  console.log(`   ✅ API Health: ${health.status}`);
  console.log(`   ✅ Database: ${health.dbReady ? 'Ready' : 'Not ready'}`);
} catch (error) {
  console.log('   ❌ API not responding:', error.message);
}

// Check frontend
console.log('\n3. Checking frontend...');
try {
  const frontendCheck = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:5173', { encoding: 'utf8' });
  console.log(`   ✅ Frontend: HTTP ${frontendCheck}`);
} catch (error) {
  console.log('   ❌ Frontend not responding:', error.message);
}

// Check package.json for dependencies
console.log('\n4. Checking dependencies...');
try {
  const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  const criticalDeps = ['react', 'chess.js', 'socket.io', 'express'];
  
  criticalDeps.forEach(dep => {
    const hasInDeps = packageJson.dependencies?.[dep];
    const hasInDevDeps = packageJson.devDependencies?.[dep];
    console.log(`   ${hasInDeps || hasInDevDeps ? '✅' : '❌'} ${dep}: ${hasInDeps || hasInDevDeps || 'Missing'}`);
  });
} catch (error) {
  console.log('   ❌ Error checking dependencies:', error.message);
}

// Check for common files
console.log('\n5. Checking critical files...');
const criticalFiles = [
  'src/App.jsx',
  'src/index.jsx',
  'server/index.js',
  'server/db.js',
  'public/stockfish.js'
];

criticalFiles.forEach(file => {
  try {
    readFileSync(file);
    console.log(`   ✅ ${file}`);
  } catch (error) {
    console.log(`   ❌ ${file}: Missing`);
  }
});

console.log('\n🎯 Health check complete!');
console.log('\nIf all checks pass, the application should be working correctly.');
console.log('If there are issues, check the console logs in your browser at http://localhost:5173');
