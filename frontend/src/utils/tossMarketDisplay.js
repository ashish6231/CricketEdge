export const formatTossAmount = value => {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const number=Number(value), absolute=Math.abs(number)
  if (absolute>=1000000) return `${(number/1000000).toFixed(2).replace(/\.?0+$/,'')}M`
  if (absolute>=1000) return `${(number/1000).toFixed(2).replace(/\.?0+$/,'')}K`
  return number.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
}
export const formatTossMoney = value => value == null ? '—' : `€${Number(value).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`
export const formatSignedTossMoney = value => value == null ? '—' : `${value<0 ? '−' : '+'}${formatTossMoney(Math.abs(value))}`
