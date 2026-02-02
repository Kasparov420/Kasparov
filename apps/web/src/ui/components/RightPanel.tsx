import React, { useState, useEffect } from 'react'
import { Play, Users, Copy, Check, Clock, Trophy, Swords, RefreshCw, UserPlus } from 'lucide-react'

type WaitingGame = {
  id: string
  createdAt: number
  white: { address: string }
  status: 'waiting'
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function RightPanel({
  game,
  myColor,
  myTurn,
  session,
  onCreate,
  onJoin,
  onOpenWalletModal,
  screen
}: any) {
  const [gameId, setGameId] = useState('')
  const [copied, setCopied] = useState(false)
  const [waitingGames, setWaitingGames] = useState<WaitingGame[]>([])
  const [loadingGames, setLoadingGames] = useState(false)

  // Fetch waiting games
  const fetchWaitingGames = async () => {
    setLoadingGames(true)
    try {
      const res = await fetch('/api/games?waiting=true')
      if (res.ok) {
        const data = await res.json()
        // Filter out our own games if we have a session
        const games = (data.games || []).filter((g: WaitingGame) => 
          !session || g.white.address !== session.address
        )
        setWaitingGames(games)
      }
    } catch (e) {
      console.error('Failed to fetch waiting games:', e)
    } finally {
      setLoadingGames(false)
    }
  }

  // Poll for waiting games when in lobby
  useEffect(() => {
    if (!game) {
      fetchWaitingGames()
      const interval = setInterval(fetchWaitingGames, 5000) // Poll every 5 seconds
      return () => clearInterval(interval)
    }
  }, [game, session?.address])

  const handleCreate = () => {
    if (!session) {
      onOpenWalletModal()
      return
    }
    onCreate()
  }

  const handleJoin = () => {
    if (!session) {
      onOpenWalletModal()
      return
    }
    if (!gameId.trim()) {
      alert('Enter a game ID')
      return
    }
    onJoin(gameId.trim())
  }

  const handleJoinGame = (id: string) => {
    if (!session) {
      onOpenWalletModal()
      return
    }
    onJoin(id)
  }

  const copyGameId = () => {
    if (game?.id) {
      navigator.clipboard.writeText(game.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!game) {
    return (
      <div className="lobby-panel">
        <div className="lobby-header">
          <div className="lobby-title">♟️ Play Chess</div>
          <div className="lobby-subtitle">On-chain gaming powered by Kaspa</div>
        </div>
        
        <div className="lobby-content">
          <button className="create-btn kaspa" onClick={handleCreate}>
            <Play size={18} />
            {session ? 'Create New Game' : 'Connect Wallet to Play'}
          </button>
          
          <div className="divider-or">
            <span>or join existing</span>
          </div>
          
          <div className="join-section">
            <label className="join-label">Enter Game ID</label>
            <div className="join-row">
              <input
                type="text"
                className="join-input"
                placeholder="Paste game ID here..."
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
              <button className="join-btn" onClick={handleJoin}>
                <Users size={16} />
                Join
              </button>
            </div>
          </div>

          {/* Waiting Games Lobby */}
          <div className="waiting-games-section">
            <div className="waiting-games-header">
              <span className="waiting-games-title">
                <Users size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Open Games ({waitingGames.length})
              </span>
              <button 
                className="refresh-btn" 
                onClick={fetchWaitingGames}
                disabled={loadingGames}
              >
                <RefreshCw size={14} className={loadingGames ? 'spinning' : ''} />
              </button>
            </div>
            
            {waitingGames.length > 0 ? (
              <div className="waiting-games-list">
                {waitingGames.map((g) => (
                  <div key={g.id} className="waiting-game-card">
                    <div className="waiting-game-info">
                      <div className="waiting-game-id">
                        <span className="game-icon">♔</span>
                        {g.id}
                      </div>
                      <div className="waiting-game-host">
                        Host: {g.white.address.slice(0, 12)}...
                      </div>
                      <div className="waiting-game-time">
                        {formatTimeAgo(g.createdAt)}
                      </div>
                    </div>
                    <button 
                      className="join-game-btn"
                      onClick={() => handleJoinGame(g.id)}
                    >
                      <UserPlus size={14} />
                      Join
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-waiting-games">
                {loadingGames ? (
                  <span>Loading games...</span>
                ) : (
                  <span>No games waiting. Create one!</span>
                )}
              </div>
            )}
          </div>
          
          {!session && (
            <div className="status-card waiting">
              <div className="status-title">Connect your wallet</div>
              <div className="status-text">
                Connect a Kaspa wallet to create or join games
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="game-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Swords size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Game Info
        </div>
        <span className={`status-badge ${game.status}`}>
          {game.status === 'waiting' ? '⏳ Waiting' : 
           game.status === 'active' ? '🎮 Active' : '🏁 Ended'}
        </span>
      </div>
      
      <div className="panel-content">
        {/* Game ID */}
        <div className="game-id-display">
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {game.id}
          </span>
          <button className="copy-btn" onClick={copyGameId}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        
        {/* Player Cards */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={`player-card ${game.turn === 'w' ? 'active' : ''}`}>
            <div className="player-avatar white">♔</div>
            <div className="player-info">
              <div className="player-name">White {myColor === 'white' ? '(You)' : ''}</div>
              <div className="player-address">
                {game.white?.address?.slice(0, 10)}...
              </div>
            </div>
            {game.turn === 'w' && <Clock size={16} style={{ color: 'var(--accent-secondary)' }} />}
          </div>
          
          <div className={`player-card ${game.turn === 'b' ? 'active' : ''}`}>
            <div className="player-avatar black">♚</div>
            <div className="player-info">
              <div className="player-name">Black {myColor === 'black' ? '(You)' : ''}</div>
              <div className="player-address">
                {game.black?.address ? `${game.black.address.slice(0, 10)}...` : 'Waiting for opponent...'}
              </div>
            </div>
            {game.turn === 'b' && game.black && <Clock size={16} style={{ color: 'var(--accent-secondary)' }} />}
          </div>
        </div>
        
        {/* Game Stats */}
        <div className="info-grid" style={{ marginTop: 16 }}>
          <div className="info-row">
            <span className="info-label">Your Color</span>
            <span className="info-value">{myColor?.toUpperCase() || '—'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Turn</span>
            <span className="info-value">{game.turn === 'w' ? 'White' : 'Black'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Your Turn</span>
            <span className={`info-value ${myTurn ? 'success' : 'error'}`}>
              {myTurn ? '✓ Yes' : '✗ No'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Moves Played</span>
            <span className="info-value">{game.moveCount || 0}</span>
          </div>
        </div>
        
        {/* Status Messages */}
        {game.status === 'waiting' && (
          <div className="status-card waiting" style={{ marginTop: 16 }}>
            <div className="status-title">⏳ Waiting for Opponent</div>
            <div className="status-text">
              Share the Game ID above with your opponent to start the match
            </div>
          </div>
        )}
        
        {game.status === 'ended' && (
          <div className="status-card ended" style={{ marginTop: 16 }}>
            <div className="status-title">
              <Trophy size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Game Over
            </div>
            <div className="status-text">
              The game has ended. Start a new game to play again!
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
