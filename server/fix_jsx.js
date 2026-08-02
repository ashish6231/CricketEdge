const fs = require('fs');
const path = '/Users/ashish/Desktop/workspace-019f9b6f-8b54-705e-9229-bba56237fc4c/frontend/src/pages/MatchDetail.jsx';
let content = fs.readFileSync(path, 'utf8');

// Fix 1: Graph View Ternary
content = content.replace(
  /          \) : \(\n\n          \{\/\* Match Odds \/ Toss Total Bar \*\/\}/g,
  `          ) : (\n            <>\n          {/* Match Odds / Toss Total Bar */}`
);

content = content.replace(
  /          <\/div>\n          \)\} \n        <\/div>/g,
  `          </div>\n            </>\n          )} \n        </div>`
);

// Fix 2: Simple View Ternary
content = content.replace(
  /          \) : \(\n\n          \{\/\* ━━━━━━━━━━ 1\. MATCH HEADER \+ ODDS \+ P\/L ━━━━━━━━━━ \*\/\}/g,
  `          ) : (\n            <>\n          {/* ━━━━━━━━━━ 1. MATCH HEADER + ODDS + P/L ━━━━━━━━━━ */}`
);

// Wait, the end of the second ternary was patched as:
// `            {/* TOSS SIMPLE VIEW */}\n            {marketType === 'toss' && tossSnapshot && (\n              <div className="mt-5 rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>\n                <TossDetail snapshot={tossSnapshot} />\n              </div>\n            )}\n          </div>\n          )}\n        </>`
// But actually there's more after that in Simple View! There's Spoofing detector, etc.
// Let's check where `)}` was actually placed in Simple View.
