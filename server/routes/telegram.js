const express = require('express')
const router = express.Router()
const telegramService = require('../services/telegramService')
const { optionalAuth } = require('../middleware/auth')

/**
 * GET /api/telegram/settings
 * Public config for frontend
 */
router.get('/settings', (req, res) => {
  res.json({
    gateEnabled: telegramService.GATE_ENABLED,
    groupUrl: `https://t.me/${telegramService.CHAT_ID.replace('@', '')}`,
    botUsername: telegramService.BOT_USERNAME,
    chatId: telegramService.CHAT_ID,
  })
})

/**
 * POST /api/telegram/initiate
 * Generate a new verification session token, optionally tied to logged-in user
 */
router.post('/initiate', optionalAuth, (req, res) => {
  try {
    const userId = req.user?.userId || req.body?.userId || null
    const session = telegramService.createSession(userId)
    res.json({
      success: true,
      gateEnabled: telegramService.GATE_ENABLED,
      userId,
      ...session,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to initiate Telegram session: ' + err.message })
  }
})

/**
 * GET /api/telegram/status
 * Check if the given token or logged-in user account is verified and still in @cricedge_online
 */
router.get('/status', optionalAuth, async (req, res) => {
  if (!telegramService.GATE_ENABLED) {
    return res.json({
      success: true,
      gateEnabled: false,
      isVerified: true,
      leftGroup: false,
      isLinked: true,
    })
  }

  const role = req.user?.role
  if (role === 'admin' || role === 'superadmin') {
    return res.json({
      success: true,
      gateEnabled: telegramService.GATE_ENABLED,
      isAdmin: true,
      isVerified: true,
      leftGroup: false,
    })
  }

  // If visitor is NOT logged in: Do not gate guests
  if (!req.user) {
    const token = req.query.token || req.headers['x-telegram-token']
    if (!token) {
      return res.json({
        success: true,
        gateEnabled: telegramService.GATE_ENABLED,
        isLoggedIn: false,
        isVerified: true,
        leftGroup: false,
      })
    }

    try {
      const result = await telegramService.verifySessionToken(token)
      return res.json({
        success: true,
        gateEnabled: telegramService.GATE_ENABLED,
        isLoggedIn: false,
        groupUrl: `https://t.me/${telegramService.CHAT_ID.replace('@', '')}`,
        botUsername: telegramService.BOT_USERNAME,
        ...result,
      })
    } catch (err) {
      return res.status(500).json({ error: 'Failed to check status: ' + err.message })
    }
  }

  // If user is logged in:
  const telegramId = req.user.telegramId
  if (!telegramId) {
    // Check if token was provided in query, to see if they just verified in the bot
    const token = req.query.token || req.headers['x-telegram-token']
    if (token) {
      const sessionResult = await telegramService.verifySessionToken(token)
      if (sessionResult.isVerified) {
        return res.json({
          success: true,
          gateEnabled: telegramService.GATE_ENABLED,
          isLoggedIn: true,
          isLinked: true,
          isVerified: true,
          leftGroup: false,
          status: 'member',
          telegramId: sessionResult.telegramId,
          telegramUsername: sessionResult.username,
          groupUrl: `https://t.me/${telegramService.CHAT_ID.replace('@', '')}`,
          botUsername: telegramService.BOT_USERNAME,
        })
      }
    }

    return res.json({
      success: true,
      gateEnabled: telegramService.GATE_ENABLED,
      isLoggedIn: true,
      isLinked: false,
      isVerified: false,
      leftGroup: false,
      status: 'not_linked',
      message: 'Join @cricedge_online Telegram channel to use website',
      groupUrl: `https://t.me/${telegramService.CHAT_ID.replace('@', '')}`,
      botUsername: telegramService.BOT_USERNAME,
    })
  }

  // Check live membership of the linked Telegram account
  const check = await telegramService.checkMembership(telegramId)
  return res.json({
    success: true,
    gateEnabled: telegramService.GATE_ENABLED,
    isLoggedIn: true,
    isLinked: true,
    isVerified: check.isMember,
    leftGroup: !check.isMember,
    status: check.status,
    telegramId: req.user.telegramId,
    telegramUsername: req.user.telegramUsername,
    groupUrl: `https://t.me/${telegramService.CHAT_ID.replace('@', '')}`,
    botUsername: telegramService.BOT_USERNAME,
  })
})

module.exports = router
