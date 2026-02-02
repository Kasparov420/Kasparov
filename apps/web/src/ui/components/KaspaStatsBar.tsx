import React, { useEffect, useState } from 'react'

interface KaspaStats {
  price: number
  priceChange24h: number
  hashrate: number  // in TH/s
  blockHeight: number
  difficulty: number
  circulatingSupply: number
  marketCap: number
}

export default function KaspaStatsBar() {
  const [stats, setStats] = useState<KaspaStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch from multiple APIs
        const [priceRes, networkRes] = await Promise.allSettled([
          fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true&include_market_cap=true'),
          fetch('https://api.kaspa.org/info/hashrate')
        ])
        
        let price = 0, priceChange = 0, marketCap = 0
        let hashrate = 0, blockHeight = 0, difficulty = 0
        
        if (priceRes.status === 'fulfilled' && priceRes.value.ok) {
          const data = await priceRes.value.json()
          price = data.kaspa?.usd || 0
          priceChange = data.kaspa?.usd_24h_change || 0
          marketCap = data.kaspa?.usd_market_cap || 0
        }
        
        if (networkRes.status === 'fulfilled' && networkRes.value.ok) {
          const data = await networkRes.value.json()
          hashrate = data.hashrate || 0
        }
        
        // Fetch block info
        try {
          const blockRes = await fetch('https://api.kaspa.org/info/virtual-chain-blue-score')
          if (blockRes.ok) {
            const data = await blockRes.json()
            blockHeight = data.blueScore || 0
          }
        } catch {}
        
        setStats({
          price,
          priceChange24h: priceChange,
          hashrate: hashrate / 1e18, // Convert to EH/s
          blockHeight,
          difficulty,
          circulatingSupply: 24.5e9, // ~24.5B
          marketCap
        })
      } catch (e) {
        console.error('[KaspaStats] Fetch error:', e)
      } finally {
        setLoading(false)
      }
    }
    
    fetchStats()
    const interval = setInterval(fetchStats, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  const formatNumber = (n: number, decimals = 2) => {
    if (n >= 1e12) return (n / 1e12).toFixed(decimals) + 'T'
    if (n >= 1e9) return (n / 1e9).toFixed(decimals) + 'B'
    if (n >= 1e6) return (n / 1e6).toFixed(decimals) + 'M'
    if (n >= 1e3) return (n / 1e3).toFixed(decimals) + 'K'
    return n.toFixed(decimals)
  }

  if (loading || !stats) {
    return (
      <div className="kaspa-stats-bar">
        <div className="stats-loading">
          <span className="kaspa-logo">⬡</span>
          <span>Loading Kaspa network stats...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="kaspa-stats-bar">
      <div className="stats-grid">
        <div className="stat-item price">
          <span className="stat-label">KAS/USD</span>
          <span className="stat-value">${stats.price.toFixed(4)}</span>
          <span className={`stat-change ${stats.priceChange24h >= 0 ? 'positive' : 'negative'}`}>
            {stats.priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(stats.priceChange24h).toFixed(2)}%
          </span>
        </div>
        
        <div className="stat-item hashrate">
          <span className="stat-label">Hashrate</span>
          <span className="stat-value">{stats.hashrate.toFixed(2)} EH/s</span>
          <span className="stat-sub">Network Power</span>
        </div>
        
        <div className="stat-item blocks">
          <span className="stat-label">DAG Blue Score</span>
          <span className="stat-value">{formatNumber(stats.blockHeight, 0)}</span>
          <span className="stat-sub">~1 BPS</span>
        </div>
        
        <div className="stat-item mcap">
          <span className="stat-label">Market Cap</span>
          <span className="stat-value">${formatNumber(stats.marketCap)}</span>
          <span className="stat-sub">Circulating</span>
        </div>
        
        <div className="stat-item network">
          <span className="kaspa-logo">⬡</span>
          <span className="network-name">KASPA</span>
          <span className="network-type">MAINNET</span>
        </div>
      </div>
    </div>
  )
}
