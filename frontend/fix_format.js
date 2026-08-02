const fs = require('fs');
const path = '/Users/ashish/Desktop/workspace-019f9b6f-8b54-705e-9229-bba56237fc4c/frontend/src/pages/MatchDetail.jsx';
let content = fs.readFileSync(path, 'utf8');

// Fix activeSessions logic
content = content.replace(
  /const uniqueSessions = \[\.\.\.new Set\(sessionData\.trades\.map\(t => t\.team\)\)\]\s+setActiveSessions\(uniqueSessions\)/,
  `let activeSessionNames = []
            if (sessionData.odds && sessionData.odds.length > 0) {
              activeSessionNames = [...new Set(sessionData.odds.map(o => o.marketName))]
            } else if (sessionData.markets && sessionData.markets.length > 0) {
              activeSessionNames = [...new Set(sessionData.markets.map(m => m.marketName))]
            } else {
              activeSessionNames = [...new Set(sessionData.trades.map(t => t.team))]
            }
            setActiveSessions(activeSessionNames)`
);

// Fix fmt function
content = content.replace(
  /const fmt = \(n\) => \{\n  if \(n === null \|\| n === undefined\) return '—'\n  return Math\.round\(n\)\.toLocaleString\('en-IN'\)\n\}/,
  `const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  return formatVolStr(n)
}`
);

// Fix fmtVol function
content = content.replace(
  /const fmtVol = \(n\) => \{\n  if \(\!n\) return '0'\n  return Math\.round\(n\)\.toLocaleString\('en-IN'\)\n\}/,
  `const fmtVol = (n) => {
  if (!n) return '0'
  return formatVolStr(n)
}`
);

// Fix formatVolTooltip function
content = content.replace(
  /const formatVolTooltip = \(val\) => \{\n  if \(\!val\) return '0'\n  return Math\.round\(val\)\.toLocaleString\('en-IN'\)\n\}/,
  `const formatVolTooltip = (val) => {
  if (!val) return '0'
  return formatVolStr(val)
}`
);

// Fix formatVolStr to always show 2 decimals
content = content.replace(
  /const formatVolStr = \(val\) => \{\n  if \(\!val\) return '0'\n  const num = Number\(val\)\n  if \(isNaN\(num\)\) return val\.toString\(\)\n  const abs = Math\.abs\(num\)\n  if \(abs >= 10000000\) return `\$\{num < 0 \? '-' : ''\}\$\{Number\(\(abs \/ 10000000\)\.toFixed\(2\)\)\}Cr`\n  if \(abs >= 100000\) return `\$\{num < 0 \? '-' : ''\}\$\{Number\(\(abs \/ 100000\)\.toFixed\(2\)\)\}L`\n  if \(abs >= 1000\) return `\$\{num < 0 \? '-' : ''\}\$\{Number\(\(abs \/ 1000\)\.toFixed\(2\)\)\}k`\n  return Number\(num\.toFixed\(2\)\)\.toString\(\)\n\}/,
  `const formatVolStr = (val) => {
  if (val === null || val === undefined || val === 0 || val === '0') return '0.00'
  const num = Number(val)
  if (isNaN(num)) return val.toString()
  const abs = Math.abs(num)
  if (abs >= 10000000) return \`\${num < 0 ? '-' : ''}\${(abs / 10000000).toFixed(2)}Cr\`
  if (abs >= 100000) return \`\${num < 0 ? '-' : ''}\${(abs / 100000).toFixed(2)}L\`
  if (abs >= 1000) return \`\${num < 0 ? '-' : ''}\${(abs / 1000).toFixed(2)}k\`
  return num.toFixed(2)
}`
);

fs.writeFileSync(path, content);
