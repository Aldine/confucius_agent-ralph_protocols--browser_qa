// Test to verify AI agent focusing system works with TypeScript strict mode
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing AI Agent Focus System\n');

// Check if key .md files exist
const focusFiles = [
  'confucius.md',
  'PROMPT.md',
  'PRD.md',
  'tasks.md',
  'progress.txt'
];

console.log('1. Checking AI focus files...');
let allFilesExist = true;
focusFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

// Check TypeScript configuration
console.log('\n2. Checking TypeScript strict mode...');
const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
const isStrict = tsconfig.compilerOptions.strict === true;
console.log(`   ${isStrict ? '✅' : '❌'} strict: ${tsconfig.compilerOptions.strict}`);

// Check if source files exist
console.log('\n3. Checking TypeScript source files...');
const srcExists = fs.existsSync('src/index.ts');
console.log(`   ${srcExists ? '✅' : '❌'} src/index.ts`);

// Summary
console.log('\n📊 Test Results:');
if (allFilesExist && isStrict && srcExists) {
  console.log('✅ AI Agent focus system is properly configured!');
  console.log('✅ TypeScript strict mode is enabled');
  console.log('✅ Ready for AI agent to work with strict type checking');
  process.exit(0);
} else {
  console.log('❌ Some checks failed');
  process.exit(1);
}
