const DUMMY_SCORES = new Set(['0-0 0.0', '0/0 (0.0)', '0-0 (0.0)', '0/0'])

export function validCrexScore(value) {
  const score = typeof value === 'string' ? value.trim() : ''
  return score && !DUMMY_SCORES.has(score) ? score : null
}

function identity(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bthe\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function initials(value) {
  return identity(value).split(' ').filter(Boolean).map(word => word[0]).join('')
}

function teamIsMentioned(text, team) {
  const haystack = ` ${identity(text)} `
  const aliases = [identity(team?.name), identity(team?.shortName), initials(team?.name)]
    .filter(alias => alias.length >= 2)
  return aliases.some(alias => haystack.includes(` ${alias} `))
}

function hasRecordedScore(team) {
  const score = validCrexScore(team?.score)
  return Boolean(score && !/yet to bat|yet to begin|upcoming/i.test(score))
}

/** Keep the scorecard in innings order: first-innings batting side, then the chasing side. */
export function orderCrexTeamsByInnings(crex, team1Name, team2Name) {
  const scorecard = crex?.scorecard || {}
  const teams = [
    { ...(scorecard.team1 || {}), name: scorecard.team1?.name || team1Name || 'Team 1' },
    { ...(scorecard.team2 || {}), name: scorecard.team2?.name || team2Name || 'Team 2' },
  ]

  const scored = teams.map(hasRecordedScore)
  if (scored[0] !== scored[1]) return scored[0] ? teams : [teams[1], teams[0]]

  const chaseText = scorecard.statusEquation || crex?.statusText || ''
  const chaseStatement = chaseText.match(/^(.+?)\s+(?:need|needs|require|requires)\b/i)
  if (chaseStatement) {
    const chasingIndex = teams.findIndex(team => teamIsMentioned(chaseStatement[1], team))
    if (chasingIndex >= 0) return chasingIndex === 1 ? teams : [teams[1], teams[0]]
  }

  const tossText = scorecard.tossText || crex?.tossText || ''
  const decision = tossText.match(/\b(?:opt(?:ed)?|chose|elected|decided)(?:\s+to)?\s+(bat|bowl|field)\b/i)
  if (!decision) return teams

  const winnerText = tossText.slice(0, decision.index)
  const winnerIndex = teams.findIndex(team => teamIsMentioned(winnerText, team))
  if (winnerIndex < 0) return teams

  const winnerBattedFirst = decision[1].toLowerCase() === 'bat'
  const firstInningsIndex = winnerBattedFirst ? winnerIndex : 1 - winnerIndex
  return firstInningsIndex === 0 ? teams : [teams[1], teams[0]]
}

export function teamIdentityMatches(localName, providerName, providerShort = '') {
  const local = identity(localName)
  const provider = identity(providerName)
  const short = identity(providerShort).replace(/\s/g, '')
  if (!local || (!provider && !short)) return false
  if (provider && local === provider) return true
  if (provider && local.length >= 4 && provider.length >= 4 && (local.includes(provider) || provider.includes(local))) return true
  const compactLocal = local.replace(/\s/g, '')
  return Boolean(short && short.length >= 2 && (compactLocal === short || initials(local) === short))
}

function scoreEntries(crex) {
  if (!crex || typeof crex !== 'object') return []
  const card1 = crex.scorecard?.team1
  const card2 = crex.scorecard?.team2
  return [
    {
      name: card1?.name || crex.team1Name,
      short: card1?.shortName || crex.team1Short,
      score: validCrexScore(card1?.score || crex.score1),
      slot: 1,
    },
    {
      name: card2?.name || crex.team2Name,
      short: card2?.shortName || crex.team2Short,
      score: validCrexScore(card2?.score || crex.score2),
      slot: 2,
    },
  ]
}

export function resolveCrexScores(crex, team1Name, team2Name) {
  const entries = scoreEntries(crex)
  const first = entries.find(entry => teamIdentityMatches(team1Name, entry.name, entry.short))
  const second = entries.find(entry => teamIdentityMatches(team2Name, entry.name, entry.short))
  return {
    team1Score: first?.score || null,
    team2Score: second?.score || null,
    reliable: Boolean(first || second),
  }
}

export function mergeCrexUpdate(previous, incoming) {
  if (!incoming || typeof incoming !== 'object') return previous || null
  const prior = previous && typeof previous === 'object' ? previous : {}
  const next = { ...prior, ...incoming }
  next.team1Name = incoming.team1Name || prior.team1Name || incoming.scorecard?.team1?.name || prior.scorecard?.team1?.name || null
  next.team2Name = incoming.team2Name || prior.team2Name || incoming.scorecard?.team2?.name || prior.scorecard?.team2?.name || null
  next.team1Short = incoming.team1Short || prior.team1Short || incoming.scorecard?.team1?.shortName || prior.scorecard?.team1?.shortName || null
  next.team2Short = incoming.team2Short || prior.team2Short || incoming.scorecard?.team2?.shortName || prior.scorecard?.team2?.shortName || null
  next.score1 = validCrexScore(incoming.scorecard?.team1?.score || incoming.score1) || validCrexScore(prior.scorecard?.team1?.score || prior.score1)
  next.score2 = validCrexScore(incoming.scorecard?.team2?.score || incoming.score2) || validCrexScore(prior.scorecard?.team2?.score || prior.score2)
  if (prior.scorecard || incoming.scorecard) {
    next.scorecard = {
      ...(prior.scorecard || {}),
      ...(incoming.scorecard || {}),
      team1: { ...(prior.scorecard?.team1 || {}), ...(incoming.scorecard?.team1 || {}), score: next.score1 },
      team2: { ...(prior.scorecard?.team2 || {}), ...(incoming.scorecard?.team2 || {}), score: next.score2 },
    }
  }
  return next
}

export function crexScoreFingerprint(crex) {
  if (!crex) return ''
  return [
    crex.team1Name || crex.scorecard?.team1?.name || '',
    validCrexScore(crex.scorecard?.team1?.score || crex.score1) || '',
    crex.team2Name || crex.scorecard?.team2?.name || '',
    validCrexScore(crex.scorecard?.team2?.score || crex.score2) || '',
    crex.statusText || crex.scorecard?.statusEquation || '',
    crex.runningBall?.over || crex.runningBall || '',
  ].join('|')
}
