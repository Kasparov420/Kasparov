import React, { useState } from 'react'

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

  return (
    <div style={{
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      color: '#e6edf3',
      background: 'rgba(15,23,32,0.8)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      {!game ? (
        <>
          <div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Chess Game</h2>
            <button
              onClick={handleCreate}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d3a8a 100%)',
                border: '1px solid #60a5fa',
                color: '#fff',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 12
              }}
            >
              {session ? 'Create Game' : 'Connect to Create'}
            </button>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: '#a0aec0', display: 'block', marginBottom: 6 }}>
                Join Game ID
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Game ID"
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e6edf3',
                    borderRadius: 6,
                    fontSize: 12
                  }}
                />
                <button
                  onClick={handleJoin}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(0,255,163,0.1)',
                    border: '1px solid rgba(0,255,163,0.3)',
                    color: 'rgba(0,255,163,0.9)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Game: {game.id}</h2>
            <div style={{ fontSize: 12, color: '#a0aec0', lineHeight: 1.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Status:</span>
                <strong>{game.status}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>You are:</span>
                <strong>{myColor?.toUpperCase() || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Turn:</span>
                <strong>{game.turn === 'w' ? 'White' : 'Black'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Your Turn:</span>
                <strong style={{ color: myTurn ? '#10b981' : '#ef4444' }}>
                  {myTurn ? 'YES' : 'NO'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Moves:</span>
                <strong>{game.moveCount || 0}</strong>
              </div>
            </div>
          </div>

          {game.status === 'waiting' && (
            <div style={{
              padding: 12,
              background: 'rgba(0,255,163,0.1)',
              border: '1px solid rgba(0,255,163,0.3)',
              borderRadius: 6,
              fontSize: 12,
              color: 'rgba(0,255,163,0.9)'
            }}>
              Share Game ID with opponent to join
            </div>
          )}

          {game.status === 'ended' && (
            <div style={{
              padding: 12,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              fontSize: 12,
              color: 'rgba(239,68,68,0.9)'
            }}>
              Game Over
            </div>
          )}
        </>
      )}

      <div style={{
        fontSize: 10,
        color: '#647686',
        padding: '8px 0 0 0',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        marginTop: 'auto'
      }}>
        {session ? `${session.address.slice(0, 10)}...` : 'Not Connected'}
      </div>
    </div>
  )
}
