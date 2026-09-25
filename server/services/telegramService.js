/**
 * telegramService.js
 * Manages Telegram bot interactions, session token verification,
 * and live membership checks for @cricedge_online.
 */

const crypto = require('crypto')

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8692519919:AAH6R6qnPqsXcCNV9zhTRrTV4v8X0vhYLCQ'
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'cricedge_verify_bot'
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '@cricedge_online'
const GATE_ENABLED = process.env.TELEGRAM_GATE_ENABLED === 'true'

// In-memory verification sessions: token -> session object
const sessions = new Map()

// In-memory cache for live getChatMember results: telegramId -> { isMember, status, cachedAt }
const membershipCache = new Map()
const MEMBERSHIP_CACHE_TTL_MS = 20 * 1000 // 20 seconds cache to be snappy yet respectful to Telegram limits

let pollerRunning = false
let pollAbortController = null

/**
 * Generate a new verification session token for a visitor
 */
function createSession(userId = null) {
  const token = 'v_' + crypto.randomBytes(9).toString('base64url')
  const session = {
    token,
    userId: userId ? Number(userId) : null,
    createdAt: Date.now(),
    isVerified: false,
    leftGroup: false,
    telegramId: null,
    username: null,
    firstName: null,
    status: 'pending',
    lastChecked: null,
  }
  sessions.set(token, session)

  // Auto clean up old unverified sessions after 2 hours
  setTimeout(() => {
    if (sessions.has(token) && !sessions.get(token).isVerified) {
      sessions.delete(token)
    }
  }, 2 * 60 * 60 * 1000).unref()

  return {
    token,
    botUrl: `https://t.me/${BOT_USERNAME}?start=${token}`,
    groupUrl: `https://t.me/${CHAT_ID.replace('@', '')}`,
    botUsername: BOT_USERNAME,
    chatId: CHAT_ID,
  }
}

/**
 * Get session by token
 */
function getSession(token) {
  if (!token) return null
  return sessions.get(token) || null
}

/**
 * Call Telegram Bot API
 */
async function callTelegram(method, params = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    return data
  } catch (err) {
    console.error(`[TelegramService] API error on ${method}:`, err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * Send a message back to the user via the Bot
 */
async function sendBotMessage(chatId, text, extra = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  })
}

/**
 * Check if a specific telegram user is currently an active member of @cricedge_online
 */
async function checkMembership(telegramId) {
  if (!telegramId) return { isMember: false, status: 'none', leftGroup: true }

  const cached = membershipCache.get(String(telegramId))
  const now = Date.now()
  if (cached && now - cached.cachedAt < MEMBERSHIP_CACHE_TTL_MS) {
    return { isMember: cached.isMember, status: cached.status, leftGroup: !cached.isMember }
  }

  const res = await callTelegram('getChatMember', {
    chat_id: CHAT_ID,
    user_id: telegramId,
  })

  if (!res.ok) {
    console.warn(`[TelegramService] getChatMember failed for ${telegramId}:`, res.description || res.error)
    // If it was a network timeout or temporary fetch error, do not falsely evict the user
    if (cached) {
      return { isMember: cached.isMember, status: cached.status, leftGroup: !cached.isMember }
    }
    const notParticipant =
      res.error_code === 400 ||
      String(res.description || '').toLowerCase().includes('participant') ||
      String(res.description || '').toLowerCase().includes('user not found')
    if (notParticipant) {
      return { isMember: false, status: 'left', leftGroup: true }
    }
    // Network timeout / transient error: allow grace period so user is not locked out
    return { isMember: true, status: 'unknown_network', leftGroup: false }
  }

  const status = res.result?.status
  const isMember = ['member', 'administrator', 'creator'].includes(status)
  const leftGroup = ['left', 'kicked'].includes(status) || !isMember

  membershipCache.set(String(telegramId), {
    isMember,
    status,
    cachedAt: now,
  })

  return { isMember, status, leftGroup }
}

/**
 * Check verification status for a website token, re-validating with Telegram if needed
 */
async function verifySessionToken(token) {
  if (!token) return { isVerified: false, leftGroup: false }
  const session = sessions.get(token)
  if (!session) return { isVerified: false, leftGroup: false }

  if (!session.isVerified || !session.telegramId) {
    return {
      isVerified: false,
      leftGroup: false,
      status: session.status || 'pending',
    }
  }

  // If already verified, verify they haven't left the group!
  const now = Date.now()
  if (!session.lastChecked || now - session.lastChecked > MEMBERSHIP_CACHE_TTL_MS) {
    const check = await checkMembership(session.telegramId)
    session.lastChecked = now
    if (!check.isMember) {
      session.isVerified = false
      session.leftGroup = true
      session.status = check.status
    } else {
      session.isVerified = true
      session.leftGroup = false
      session.status = check.status
    }
  }

  return {
    isVerified: session.isVerified,
    leftGroup: !!session.leftGroup,
    status: session.status,
    telegramId: session.telegramId,
    username: session.username,
    firstName: session.firstName,
  }
}

/**
 * Telegram Bot Update Poller
 * Listens for users clicking "START" in t.me/cricedge_verify_bot?start=<token>
 */
async function startBotPoller() {
  if (pollerRunning) return
  pollerRunning = true
  pollAbortController = new AbortController()

  console.log(`[TelegramService] Starting Telegram Bot poller for @${BOT_USERNAME}...`)

  let offset = 0

  const pollLoop = async () => {
    while (pollerRunning) {
      try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=20`
        const res = await fetch(url, {
          signal: AbortSignal.timeout(30000),
        })
        const data = await res.json()

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1
            if (update.message && update.message.text) {
              handleIncomingMessage(update.message).catch(err => {
                console.error('[TelegramService] Error handling message:', err)
              })
            }
          }
        }
      } catch (err) {
        if (!pollerRunning) break
        // Network error or timeout — wait 3s and retry
        await new Promise(r => setTimeout(r, 3000))
      }
    }
  }

  pollLoop().catch(err => {
    console.error('[TelegramService] Poller loop crashed:', err)
  })
}

/**
 * Handle incoming user message to the bot
 */
async function handleIncomingMessage(msg) {
  const chatId = msg.chat?.id
  const userId = msg.from?.id
  const username = msg.from?.username || ''
  const firstName = msg.from?.first_name || 'User'
  const text = (msg.text || '').trim()

  if (!chatId || !userId) return

  // Check if message is /start <token>
  const match = text.match(/^\/start(?:\s+(v_[a-zA-Z0-9_-]+))?/)

  if (!match) {
    await sendBotMessage(
      chatId,
      `👋 <b>Hello ${firstName}!</b>\n\nI am the official <b>CricketEdge Verification Bot</b>.\n\nTo access CricketEdge live match & toss data, please join our official Telegram group:\n👉 <b>${CHAT_ID}</b>\n\nIf you came from the website, please click the <b>Verify</b> button on CricketEdge to unlock your session.`
    )
    return
  }

  const token = match[1]

  if (!token) {
    // Plain /start without token
    await sendBotMessage(
      chatId,
      `👋 <b>Welcome to CricketEdge!</b>\n\n1️⃣ Join our official group: <b>${CHAT_ID}</b>\n2️⃣ Visit <a href="http://localhost:3000">CricketEdge</a> and click <b>"Verify Access"</b> to unlock live match predictions.`
    )
    return
  }

  // Check if session exists in memory
  let session = sessions.get(token)
  if (!session) {
    // Create or re-register token session
    session = {
      token,
      createdAt: Date.now(),
      isVerified: false,
      leftGroup: false,
      telegramId: null,
      username: null,
      firstName: null,
      status: 'pending',
      lastChecked: null,
    }
    sessions.set(token, session)
  }

  // Now check if user is a member of @cricedge_online
  const check = await checkMembership(userId)

  if (check.isMember) {
    // SUCCESS! Mark session as verified
    session.isVerified = true
    session.leftGroup = false
    session.telegramId = userId
    session.username = username
    session.firstName = firstName
    session.status = check.status
    session.lastChecked = Date.now()

    // If session is tied to a CricketEdge user account, save telegramId in DB!
    if (session.userId) {
      try {
        const prisma = require('../db/prisma')
        const { clearAuthCache } = require('../middleware/auth')
        const { clearMeCache } = require('../routes/auth')
        await prisma.user.update({
          where: { id: session.userId },
          data: {
            telegramId: String(userId),
            telegramUsername: username || firstName || '',
          },
        })
        clearAuthCache()
        if (typeof clearMeCache === 'function') clearMeCache()
        console.log(`[TelegramService] Linked user ID ${session.userId} with Telegram ID ${userId} (@${username})`)
      } catch (err) {
        console.error(`[TelegramService] Error saving telegramId for user ${session.userId}:`, err.message)
      }
    }

    await sendBotMessage(
      chatId,
      `🎉 <b>Verification Successful!</b>\n\n✅ You are confirmed as an active member of <b>${CHAT_ID}</b>.\n\n🔓 <b>Your CricketEdge access is now UNLOCKED!</b>\n\nYou can switch back to your browser now — all live cricket, odds, and toss predictions are ready for you.`
    )
    console.log(`[TelegramService] User ${username || userId} verified token ${token} successfully!`)
  } else {
    // NOT IN GROUP
    session.isVerified = false
    session.leftGroup = true
    session.telegramId = userId
    session.status = check.status

    await sendBotMessage(
      chatId,
      `⚠️ <b>Channel Membership Required!</b>\n\nYou are not currently a member of <b>${CHAT_ID}</b>.\n\n👉 <b>Step 1:</b> Join our channel here: <a href="https://t.me/${CHAT_ID.replace('@', '')}">Join ${CHAT_ID}</a>\n👉 <b>Step 2:</b> After joining, tap /start again to verify!`
    )
    console.log(`[TelegramService] User ${username || userId} tried to verify but is not in ${CHAT_ID} (status: ${check.status})`)
  }
}

function stopBotPoller() {
  pollerRunning = false
  if (pollAbortController) pollAbortController.abort()
}

module.exports = {
  GATE_ENABLED,
  BOT_TOKEN,
  BOT_USERNAME,
  CHAT_ID,
  createSession,
  getSession,
  verifySessionToken,
  checkMembership,
  startBotPoller,
  stopBotPoller,
}
