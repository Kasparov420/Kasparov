import React, { useMemo, useState } from 'react'

export default function ChatPanel({ game, session, onSendMessage }: any) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const messages = useMemo(() => (game?.messages || []), [game])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || !session || !game?.id) return
    setSending(true)
    try {
      await onSendMessage(trimmed)
      setText('')
    } finally {
      setSending(false)
    }
  }

  const inscriptionSupported = !!session

  return (
    <div className="chatPanel">
      <div className="chatHeader">
        <div className="chatTitle">Game Chat</div>
        <div className={`statusPill ${session ? 'on' : 'off'}`}>
          <span className="statusDot" />
          {session ? 'Wallet Connected' : 'Connect Wallet'}
        </div>
      </div>
      <div className="chatList">
        {messages.length === 0 && (
          <div className="chatEmpty">No messages yet.</div>
        )}
        {messages.map((m: any) => (
          <div key={m.id || m.ts} className="chatMessage">
            <div className="chatMeta">
              <span className="chatFrom">{m.from?.slice(0, 10)}…</span>
              <span className="chatTime">{new Date(m.ts).toLocaleTimeString()}</span>
            </div>
            <div className="chatText">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="chatInputRow">
        <input
          className="chatInput"
          placeholder={session ? 'Type a message (on-chain)' : 'Connect wallet to chat'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!session || sending || !inscriptionSupported}
        />
        <button className="btnPrimary" onClick={handleSend} disabled={!session || sending || !text.trim() || !inscriptionSupported}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
