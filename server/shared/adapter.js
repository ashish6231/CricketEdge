/**
 * shared/adapter.js
 * Base SourceAdapter interface.
 * Both TennisLiveLoad and CREX implement this contract so that
 * the Normalizer and API Broadcast layers are fully decoupled from source details.
 */

const { EventEmitter } = require('events');

class SourceAdapter extends EventEmitter {
  constructor(name = 'generic') {
    super();
    this.name = name;
  }

  /**
   * Fetch current matches list
   * @returns {Promise<Array<Object>>} Raw match objects
   */
  async getMatches() {
    throw new Error(`getMatches() not implemented by adapter [${this.name}]`);
  }

  /**
   * Fetch live odds for a match
   * @param {string} matchId
   * @returns {Promise<Object>}
   */
  async getOdds(matchId) {
    throw new Error(`getOdds() not implemented by adapter [${this.name}]`);
  }

  /**
   * Fetch detailed match snapshot (teams, metrics, exposure, analytics)
   * @param {string} matchId
   * @returns {Promise<Object>}
   */
  async getSnapshot(matchId) {
    throw new Error(`getSnapshot() not implemented by adapter [${this.name}]`);
  }

  /**
   * Check connection / auth health
   * @returns {Promise<boolean>|boolean}
   */
  async isHealthy() {
    return true;
  }
}

module.exports = SourceAdapter;
