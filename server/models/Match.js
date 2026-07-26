const mongoose = require('mongoose');
const { autoIncrement } = require('../utils/autoIncrement');

const runnerSchema = new mongoose.Schema({
  selectionId: { type: Number, required: true },
  handicap: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'WINNER', 'LOSER', 'REMOVED'], default: 'ACTIVE' },
  lastPriceTraded: { type: Number, default: 0 },
  totalMatched: { type: Number, default: 0 },
  ex: {
    availableToBack: [{ price: Number, size: Number }],
    availableToLay: [{ price: Number, size: Number }],
    tradedVolume: [{ price: Number, size: Number }]
  }
}, { _id: false });

const matchSchema = new mongoose.Schema({
  _id: { type: Number },
  matchId: { type: String, required: true, unique: true },
  eventId: { type: String, default: '' },
  marketId: { type: String, required: true },

  eventTypeId: { type: Number, default: 4 },
  competition: { type: String, default: '' },
  eventName: { type: String, required: true },

  teamA: {
    name: { type: String, required: true },
    selectionId: { type: Number, required: true }
  },
  teamB: {
    name: { type: String, required: true },
    selectionId: { type: Number, required: true }
  },
  drawSelectionId: { type: Number, default: null },

  matchType: { type: String, enum: ['TEST', 'ODI', 'T20', 'T10'], default: 'T20' },
  venue: { type: String, default: '' },
  startTime: { type: Date, required: true },
  status: { type: String, enum: ['UPCOMING', 'LIVE', 'COMPLETED', 'DELAYED', 'ABANDONED'], default: 'UPCOMING' },
  inplay: { type: Boolean, default: false },

  score: {
    teamA: { runs: Number, wickets: Number, overs: Number },
    teamB: { runs: Number, wickets: Number, overs: Number },
    currentInnings: { type: Number, default: 1 },
    tossWinner: { type: String, default: '' },
    battingFirst: { type: String, default: '' }
  },

  totalMatched: { type: Number, default: 0 },
  runners: [runnerSchema],

  result: {
    winner: { type: String, default: '' },
    settledAt: { type: Date },
    verified: { type: Boolean, default: false }
  },

  metadata: {
    source: { type: String, default: 'betfair' },
    betfairEventId: { type: String, default: '' },
    betfairMarketId: { type: String, default: '' }
  }
}, { timestamps: true });

matchSchema.index({ status: 1, inplay: 1 });
matchSchema.index({ startTime: 1 });
matchSchema.index({ eventTypeId: 1 });

autoIncrement(matchSchema, 'Match');

module.exports = mongoose.model('Match', matchSchema);
