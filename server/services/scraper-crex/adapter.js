/**
 * services/scraper-crex/adapter.js
 * CREX Source Adapter
 * Scrapes public HTML pages and extracts state from app-root-state script tags.
 * Strictly adheres to public pages without calling third-party vendor credentials.
 */

const SourceAdapter = require('../../shared/adapter');
const crexService = require('../crexService');
const { createNormalizedMatch } = require('../../shared/schema');

class CrexAdapter extends SourceAdapter {
  constructor() {
    super('crex');
  }

  async getMatches() {
    try {
      const overview = await crexService.getCrexOverview();
      if (!Array.isArray(overview) || !overview.length) return [];

      return overview.map(m => {
        const id = `crex-${m.id || m.matchId || m.slug}`;
        const team1 = m.team1Name || m.team1Short || 'Team 1';
        const team2 = m.team2Name || m.team2Short || 'Team 2';

        return createNormalizedMatch({
          id,
          matchName: `${team1} v ${team2}`,
          team1,
          team2,
          competitionName: m.seriesName || 'International / League',
          format: m.format || 'T20',
          startTime: m.startTime || Date.now(),
          status: m.isLive ? 'live' : (m.isUpcoming ? 'upcoming' : 'completed'),
          inPlay: Boolean(m.isLive),
          source: 'crex',
          crex: m,
        });
      });
    } catch (err) {
      console.warn('⚠️  [CREX-Adapter] error fetching matches:', err.message);
      return [];
    }
  }

  async getSnapshot(slugOrId) {
    try {
      const cleanSlug = String(slugOrId).replace(/^crex-/, '');
      return await crexService.getCrexMatchDetail(cleanSlug);
    } catch (err) {
      console.warn(`⚠️  [CREX-Adapter] error fetching snapshot for ${slugOrId}:`, err.message);
      return null;
    }
  }

  async getOdds(slugOrId) {
    const detail = await this.getSnapshot(slugOrId);
    if (!detail) return null;
    return {
      matchId: String(slugOrId),
      runners: [
        { runnerName: detail.team1Name, back: detail.odds?.team1Back || 0, lay: detail.odds?.team1Lay || 0 },
        { runnerName: detail.team2Name, back: detail.odds?.team2Back || 0, lay: detail.odds?.team2Lay || 0 },
      ],
      updatedAt: Date.now(),
    };
  }
}

module.exports = CrexAdapter;
