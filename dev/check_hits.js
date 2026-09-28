const fs = require('fs');
const app = fs.readFileSync('app.js', 'utf8');
const ROLE_TOKENS = /super.{0,8}admin|سوبر|مدير المشروع/i;
const literalThenTest = /\/((?:\\.|[^\/\n])+)\/[gimsuy]*\s*\.\s*(?:test|exec)\s*\(/g;
const matchWithLiteral = /\.\s*(?:match|matchAll|search)\s*\(\s*\/((?:\\.|[^\/\n])+)\//g;
const ctor = /RegExp\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
let m;
while ((m = literalThenTest.exec(app))) {
  if (ROLE_TOKENS.test(m[1])) {
    const line = app.slice(0, m.index).split('\n').length;
    console.log('Line', line, 'literalThenTest:', m[0]);
  }
}
while ((m = matchWithLiteral.exec(app))) {
  if (ROLE_TOKENS.test(m[1])) {
    const line = app.slice(0, m.index).split('\n').length;
    console.log('Line', line, 'matchWithLiteral:', m[0]);
  }
}
while ((m = ctor.exec(app))) {
  if (ROLE_TOKENS.test(m[2])) {
    const line = app.slice(0, m.index).split('\n').length;
    console.log('Line', line, 'ctor:', m[0]);
  }
}
