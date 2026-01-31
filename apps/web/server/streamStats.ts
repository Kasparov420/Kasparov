type StreamStats = {
  price: string
  tps: string
  bps: string
  hashrate: string
}

const ENDPOINTS = [
  'https://kaspa.stream/api/market',
  'https://kaspa.stream/api/stats',
  'https://kaspa.stream/api/network',
]

function isJson(text: string) {
  return text.trim().startsWith('{') || text.trim().startsWith('[')
}

function pickNumber(obj: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function formatHashrate(value: number | null) {
  if (value === null) return '—'
  const units = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s']
  let v = value
  let idx = 0
  while (v >= 1000 && idx < units.length - 1) {
    v /= 1000
    idx += 1
  }
  return `${v.toFixed(2)} ${units[idx]}`
}

export async function fetchStreamStats(): Promise<StreamStats> {
  const stats: StreamStats = { price: '—', tps: '—', bps: '—', hashrate: '—' }

  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { headers: { 'accept': 'application/json' } })
      if (!res.ok) continue
      const text = await res.text()
      if (!isJson(text)) continue
      const data = JSON.parse(text)

      const price = pickNumber(data, ['price', 'priceUsd', 'usd'])
      const tps = pickNumber(data, ['tps', 'txPerSecond'])
      const bps = pickNumber(data, ['bps', 'blocksPerSecond'])
      const hashrate = pickNumber(data, ['hashrate', 'networkHashrate'])

      if (price !== null) stats.price = `$${price.toFixed(4)}`
      if (tps !== null) stats.tps = tps.toFixed(2)
      if (bps !== null) stats.bps = bps.toFixed(2)
      if (hashrate !== null) stats.hashrate = formatHashrate(hashrate)
    } catch {
      // ignore
    }
  }

  return stats
}