export function isCompleteMatchBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return false
  return ['cricket', 'toss', 'session', 'crex'].some(key => Object.prototype.hasOwnProperty.call(bundle, key))
}

export function hasTossSnapshot(bundle) {
  return isCompleteMatchBundle(bundle) && bundle.toss && typeof bundle.toss === 'object' && !bundle.toss.error
}
