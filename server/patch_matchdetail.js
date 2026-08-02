const fs = require('fs');
const path = '/Users/ashish/Desktop/workspace-019f9b6f-8b54-705e-9229-bba56237fc4c/frontend/src/pages/MatchDetail.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add states
content = content.replace(
  `  const [tossSnapshot, setTossSnapshot] = useState(null)`,
  `  const [tossSnapshot, setTossSnapshot] = useState(null)\n  const [sessionTrades, setSessionTrades] = useState([])\n  const [activeSessions, setActiveSessions] = useState([])`
);

// 2. Fetch session data
content = content.replace(
  `      // Fetch both Match Odds and Toss Data simultaneously\n      Promise.all([\n        apiFn(matchId),\n        sport === 'cricket' ? getTossSnapshot(matchId).catch(() => null) : Promise.resolve(null)\n      ]).then(([data, tossData]) => {`,
  `      Promise.all([\n        apiFn(matchId),\n        sport === 'cricket' ? getTossSnapshot(matchId).catch(() => null) : Promise.resolve(null),\n        sport === 'cricket' ? getSessionTrades(matchId).catch(() => null) : Promise.resolve(null)\n      ]).then(([data, tossData, sessionData]) => {`
);

content = content.replace(
  `          if (tossData && !tossData.error) setTossSnapshot(tossData)`,
  `          if (tossData && !tossData.error) setTossSnapshot(tossData)\n          if (sessionData && !sessionData.error && sessionData.trades) {\n            setSessionTrades(sessionData.trades)\n            const uniqueSessions = [...new Set(sessionData.trades.map(t => t.team))]\n            setActiveSessions(uniqueSessions)\n          }`
);

// 3. Dropdown logic (line 634-644ish)
//   <span>{marketType === 'toss' ? 'Toss' : 'Match Odds'}</span>
content = content.replace(
  `<span>{marketType === 'toss' ? 'Toss' : 'Match Odds'}</span>`,
  `<span>{marketType === 'toss' ? 'Toss' : marketType.startsWith('session_') ? marketType.replace('session_', '') : 'Match Odds'}</span>`
);

// Add the session loops in the dropdown menu
content = content.replace(
  `                      onClick={() => { setMarketType('toss'); setShowMarketMenu(false); }}\n                      className="px-4 py-3 text-[13px] font-bold text-white hover:bg-[#2c2c2e] cursor-pointer border-t border-[#2c2c2e]"\n                    >\n                      Toss\n                    </div>`,
  `                      onClick={() => { setMarketType('toss'); setShowMarketMenu(false); }}\n                      className="px-4 py-3 text-[13px] font-bold text-white hover:bg-[#2c2c2e] cursor-pointer border-t border-[#2c2c2e]"\n                    >\n                      Toss\n                    </div>\n                    {activeSessions.map(session => (\n                      <div key={session} onClick={() => { setMarketType('session_' + session); setShowMarketMenu(false); }} className="px-4 py-3 text-[13px] font-bold text-white hover:bg-[#2c2c2e] cursor-pointer border-t border-[#2c2c2e]">\n                        {session}\n                      </div>\n                    ))}`
);

// Dropdown in Simple view Tabs
content = content.replace(
  `        <button\n          onClick={() => setMarketType('toss')}`,
  `        {activeSessions.map(session => (\n          <button key={session} onClick={() => setMarketType('session_' + session)} className={\`flex-1 py-3 text-sm font-semibold transition-colors \${marketType === 'session_' + session ? 'text-[#16a34a] border-b-2 border-[#16a34a]' : 'text-text-muted hover:text-text-secondary'}\`}>\n            {session.substring(0, 15)}...\n          </button>\n        ))}\n        <button\n          onClick={() => setMarketType('toss')}`
);

fs.writeFileSync(path, content, 'utf8');
console.log('MatchDetail patched successfully');
