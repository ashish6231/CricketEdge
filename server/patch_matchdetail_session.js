const fs = require('fs');
const path = '/Users/ashish/Desktop/workspace-019f9b6f-8b54-705e-9229-bba56237fc4c/frontend/src/pages/MatchDetail.jsx';
let content = fs.readFileSync(path, 'utf8');

const hookLogic = `
  const isSessionMarket = marketType.startsWith('session_')
  const selectedSessionName = isSessionMarket ? marketType.replace('session_', '') : ''
  const selectedSessionTrades = isSessionMarket ? sessionTrades.filter(t => t.team === selectedSessionName) : []

  const sessionOrderBook = useMemo(() => {
    if (!isSessionMarket || !selectedSessionTrades.length) return []
    const lineMap = {}
    selectedSessionTrades.forEach(t => {
      const p = t.price
      if (!lineMap[p]) lineMap[p] = { price: p, yesVol: 0, noVol: 0 }
      if (t.type === 'back') lineMap[p].yesVol += t.size
      else lineMap[p].noVol += t.size
    })
    return Object.values(lineMap).map(l => ({
      ...l,
      totalVol: l.yesVol + l.noVol
    })).sort((a, b) => a.price - b.price)
  }, [selectedSessionTrades, isSessionMarket])

  const sessionScoresPL = useMemo(() => {
    if (!isSessionMarket || !sessionOrderBook.length) return []
    const minLine = Math.floor(sessionOrderBook[0].price)
    const maxLine = Math.ceil(sessionOrderBook[sessionOrderBook.length - 1].price)
    
    const scores = []
    for (let score = minLine - 1; score <= maxLine + 1; score++) {
      let pl = 0
      sessionOrderBook.forEach(line => {
        if (score > line.price) {
          pl -= line.yesVol
          pl += line.noVol
        } else {
          pl += line.yesVol
          pl -= line.noVol
        }
      })
      scores.push({ score, pl })
    }
    return scores
  }, [sessionOrderBook, isSessionMarket])
`;

content = content.replace(
  `  const [tossSnapshot, setTossSnapshot] = useState(null)`,
  hookLogic + `\n  const [tossSnapshot, setTossSnapshot] = useState(null)`
);

const graphViewSessionRender = `
          {isSessionMarket ? (
            <div className="mt-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-white font-bold text-base tracking-wide">{selectedSessionName}</h2>
              </div>
              <div className="bg-[#111111] border border-[#2c2c2e] p-5 rounded-2xl mb-8 relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <BarChart3 size={120} />
                </div>
                <h3 className="text-white text-sm font-bold tracking-wide mb-4 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]"></div>
                  VOLUME BY PRICE
                </h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sessionOrderBook} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                      <XAxis dataKey="price" stroke="#8e8e93" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => val.toFixed(2)} />
                      <YAxis stroke="#8e8e93" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => (val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val)} />
                      <Tooltip
                        cursor={{ fill: '#2c2c2e', opacity: 0.4 }}
                        contentStyle={{ backgroundColor: '#111111', border: '1px solid #2c2c2e', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', padding: '12px' }}
                        itemStyle={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}
                        labelStyle={{ color: '#8e8e93', fontSize: '11px', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase' }}
                        formatter={(value, name) => [formatVolStr(value), name === 'totalVol' ? 'Volume' : name]}
                        labelFormatter={(label) => 'Runs: ' + label}
                      />
                      <Bar dataKey="totalVol" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        {sessionOrderBook.map((entry, index) => (
                          <Cell key={\`cell-\${index}\`} fill="#16a34a" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-[#111111] border border-[#2c2c2e] rounded-2xl overflow-hidden shadow-xl">
                  <div className="px-5 py-4 border-b border-[#2c2c2e] bg-[#1a1a1a]">
                    <h3 className="text-white text-sm font-bold tracking-wide flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a]"></div>
                      Order Book (Traded Volume)
                    </h3>
                  </div>
                  <div className="p-0 max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#1c1c1e] text-[#8e8e93] text-xs uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Run Line</th>
                          <th className="px-4 py-3 font-semibold text-right text-[#3b82f6]">Yes Vol</th>
                          <th className="px-4 py-3 font-semibold text-right text-[#ef4444]">No Vol</th>
                          <th className="px-4 py-3 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2c2c2e]">
                        {sessionOrderBook.map((row, i) => (
                          <tr key={i} className="hover:bg-[#2c2c2e]/40 transition-colors">
                            <td className="px-4 py-2.5 text-white font-bold">{row.price.toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-[#3b82f6] text-right font-medium">{formatVolStr(row.yesVol)}</td>
                            <td className="px-4 py-2.5 text-[#ef4444] text-right font-medium">{formatVolStr(row.noVol)}</td>
                            <td className="px-4 py-2.5 text-[#16a34a] text-right font-bold">{formatVolStr(row.totalVol)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div className="bg-[#111111] border border-[#2c2c2e] rounded-2xl overflow-hidden shadow-xl">
                  <div className="px-5 py-4 border-b border-[#2c2c2e] bg-[#1a1a1a]">
                    <h3 className="text-white text-sm font-bold tracking-wide flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"></div>
                      Bookie P/L by Runs
                    </h3>
                  </div>
                  <div className="p-0 max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#1c1c1e] text-[#8e8e93] text-xs uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Final Score</th>
                          <th className="px-4 py-3 font-semibold text-right">Bookie P/L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2c2c2e]">
                        {sessionScoresPL.map((row, i) => (
                          <tr key={i} className="hover:bg-[#2c2c2e]/40 transition-colors">
                            <td className="px-4 py-2.5 text-white font-bold">{row.score} Runs</td>
                            <td className={\`px-4 py-2.5 text-right font-bold tracking-wide \${row.pl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}\`}>
                              {row.pl >= 0 ? '+' : ''}{fmtRs(row.pl)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
`;

content = content.replace(
  `          {/* Match Odds / Toss Total Bar */}`,
  graphViewSessionRender + `\n          {/* Match Odds / Toss Total Bar */}`
);

content = content.replace(
  `          {/* Side by Side Grid for Team Cards */}\n          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8">\n            <TeamCard teamData={t1GraphData} isToss={marketType === 'toss'} marketVol={marketVol} />\n            <TeamCard teamData={t2GraphData} isToss={marketType === 'toss'} marketVol={marketVol} />\n          </div>\n        </div>`,
  `          {/* Side by Side Grid for Team Cards */}\n          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8">\n            <TeamCard teamData={t1GraphData} isToss={marketType === 'toss'} marketVol={marketVol} />\n            <TeamCard teamData={t2GraphData} isToss={marketType === 'toss'} marketVol={marketVol} />\n          </div>\n          )} \n        </div>`
);


// And now for the Simple view (which is below `) : (`)
const simpleViewSessionRender = `
          {isSessionMarket ? (
            <div className="p-4 text-center text-[#8e8e93] py-10">
              <BarChart3 className="mx-auto mb-3 opacity-20" size={48} />
              <p>Session data is only available in Graphs view.</p>
              <button onClick={() => setShowAdvancedGraph(true)} className="mt-4 px-4 py-2 bg-[#16a34a] text-white rounded-lg text-sm font-bold">Switch to Graphs</button>
            </div>
          ) : (
`;

content = content.replace(
  `          {/* ━━━━━━━━━━ 1. MATCH HEADER + ODDS + P/L ━━━━━━━━━━ */}`,
  simpleViewSessionRender + `\n          {/* ━━━━━━━━━━ 1. MATCH HEADER + ODDS + P/L ━━━━━━━━━━ */}`
);

content = content.replace(
  `              </div>\n            )}` + `\n            {/* TOSS SIMPLE VIEW */}`,
  `              </div>\n            )}` + `\n            {/* TOSS SIMPLE VIEW */}`
);
// Actually I need to close the isSessionMarket ternary inside Simple view
content = content.replace(
  `            {/* TOSS SIMPLE VIEW */}\n            {marketType === 'toss' && tossSnapshot && (\n              <div className="mt-5 rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>\n                <TossDetail snapshot={tossSnapshot} />\n              </div>\n            )}\n          </div>\n        </>`,
  `            {/* TOSS SIMPLE VIEW */}\n            {marketType === 'toss' && tossSnapshot && (\n              <div className="mt-5 rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>\n                <TossDetail snapshot={tossSnapshot} />\n              </div>\n            )}\n          </div>\n          )}\n        </>`
);

fs.writeFileSync(path, content, 'utf8');
console.log('MatchDetail session view patched');
