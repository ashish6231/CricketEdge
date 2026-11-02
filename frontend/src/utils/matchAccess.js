import { hasFeatureAccess } from '../lib/subscriptionAccess.js'
import { isMatchEnded } from './matchTiming.js'

export function isSubscriptionRequiredError(error) {
  return error?.code === 'SUBSCRIPTION_REQUIRED' || error?.error === 'subscription_required'
}

export function requiresPaidMatchAccess({ authReady, isLoggedIn, isFreeMode, user, match, feature = 'cricket' }) {
  return Boolean(authReady && isLoggedIn && isFreeMode === false && match && !isMatchEnded(match) && !hasFeatureAccess(user, feature))
}
