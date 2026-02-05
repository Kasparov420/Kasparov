
import React, { useState } from 'react'
import './WalletModal.css'

// Helper to derive private key from mnemonic (for display only)
async function derivePrivateKeyHex(mnemonic: string): Promise<string> {
  const { mnemonicToSeed } = await import('@scure/bip39')
  const { HDKey } = await import('@scure/bip32')
  
  const seed = await mnemonicToSeed(mnemonic)
  const hdKey = HDKey.fromMasterSeed(seed)
  const derived = hdKey.derive("m/44'/111111'/0'/0/0")
  
  if (!derived.privateKey) throw new Error('Derivation failed')
  
  return Array.from(derived.privateKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Chess piece icons for decoration
const ChessPiece = ({ piece, color = 'accent' }: { piece: string; color?: 'accent' | 'muted' }) => (
  <span className={`chess-piece ${color}`}>{piece}</span>
)

export default function WalletModal({ open, onClose, onConnectKasware, onConnectKastle, onImportInternal, onImportPrivateKey, onGenerateMnemonic, wallets }: any) {
  const [view, setView] = useState<'list' | 'chooseType' | 'create' | 'createKey' | 'import' | 'importKey'>('list')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Create flow
  const [wordCount, setWordCount] = useState<12 | 24>(12)
  const [creationType, setCreationType] = useState<'mnemonic' | 'hex'>('mnemonic')
  const [newMnemonic, setNewMnemonic] = useState<string | null>(null)
  const [newPrivateKey, setNewPrivateKey] = useState<string | null>(null)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  
  // Import flow
  const [importMnemonic, setImportMnemonic] = useState('')
  const [importPrivateKey, setImportPrivateKey] = useState('')

  const resetState = () => {
    setView('list')
    setError(null)
    setNewMnemonic(null)
    setNewPrivateKey(null)
    setShowPrivateKey(false)
    setConfirmed(false)
    setImportMnemonic('')
    setImportPrivateKey('')
  }

  const handleConnect = async (type: 'kasware' | 'kastle') => {
    setConnecting(type)
    setError(null)
    try {
      const session = type === 'kasware'
        ? await onConnectKasware()
        : await onConnectKastle()

      if (!session?.address) {
        throw new Error('Wallet did not return an address')
      }

      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setConnecting(null)
    }
  }

  const handleCreate = async () => {
    setConnecting('generating')
    setError(null)
    try {
      if (creationType === 'hex') {
        const randomBytes = crypto.getRandomValues(new Uint8Array(32))
        const hexKey = Array.from(randomBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
        setNewPrivateKey(hexKey)
        setNewMnemonic(null)
        setView('createKey')
      } else {
        const mnemonic = await onGenerateMnemonic(wordCount)
        setNewMnemonic(mnemonic)
        const privateKey = await derivePrivateKeyHex(mnemonic)
        setNewPrivateKey(privateKey)
        setView('create')
      }
    } catch (e) {
      setError('Failed to generate wallet: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setConnecting(null)
    }
  }

  const handleCreateConfirm = async () => {
    if (!newMnemonic) return
    setConnecting('internal')
    try {
      const success = await onImportInternal(newMnemonic)
      if (success) onClose()
      else throw new Error("Failed to initialize wallet")
    } catch (e) {
      setError("Setup failed: " + e)
    } finally {
      setConnecting(null)
    }
  }

  const handleCreateKeyConfirm = async () => {
    if (!newPrivateKey) return
    setConnecting('internal')
    try {
      const success = await onImportPrivateKey(newPrivateKey)
      if (success) onClose()
      else throw new Error("Failed to initialize wallet")
    } catch (e) {
      setError("Setup failed: " + e)
    } finally {
      setConnecting(null)
    }
  }

  const handleImport = async () => {
    if (!importMnemonic.trim()) return
    setConnecting('internal')
    setError(null)
    try {
      const success = await onImportInternal(importMnemonic.trim())
      if (success) onClose()
      else throw new Error("Failed to initialize wallet")
    } catch (e) {
      setError("Import failed: " + e)
    } finally {
      setConnecting(null)
    }
  }

  const handleImportKey = async () => {
    if (!importPrivateKey.trim()) return
    setConnecting('internal')
    setError(null)
    try {
      const success = await onImportPrivateKey(importPrivateKey.trim())
      if (success) onClose()
      else throw new Error("Failed to initialize wallet")
    } catch (e: any) {
      setError("Import failed: " + (e?.message || e))
    } finally {
      setConnecting(null)
    }
  }

  if (!open) return null

  return (
    <div className="wm-backdrop" onClick={onClose}>
      <div className="wm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Decorative chess pattern */}
        <div className="wm-chess-border" />
        
        <button className="wm-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        
        {/* ===== MAIN LIST VIEW ===== */}
        {view === 'list' && (
          <div className="wm-view">
            <div className="wm-header">
              <div className="wm-title-row">
                <ChessPiece piece="♔" />
                <h2>Connect Wallet</h2>
                <ChessPiece piece="♚" />
              </div>
              <p className="wm-subtitle">Choose your gateway to the blockchain chess arena</p>
            </div>

            <div className="wm-section">
              <div className="wm-section-label">
                <span className="wm-label-icon">🔗</span>
                Browser Extensions
              </div>
              
              <div className="wm-wallet-grid">
                <button 
                  className={`wm-wallet-card ${connecting === 'kasware' ? 'loading' : ''}`}
                  onClick={() => handleConnect('kasware')}
                  disabled={!wallets?.kasware || connecting !== null}
                >
                  <div className="wm-wallet-icon kasware">
                    <img src="/wallets/kasware.svg" alt="" />
                  </div>
                  <div className="wm-wallet-details">
                    <span className="wm-wallet-name">Kasware</span>
                    <span className="wm-wallet-status">
                      {!wallets?.kasware ? '⚠ Not Installed' : '✓ Ready'}
                    </span>
                  </div>
                  {connecting === 'kasware' && <div className="wm-spinner" />}
                </button>

                <button 
                  className={`wm-wallet-card ${connecting === 'kastle' ? 'loading' : ''}`}
                  onClick={() => handleConnect('kastle')}
                  disabled={!wallets?.kastle || connecting !== null}
                >
                  <div className="wm-wallet-icon kastle">
                    <img src="/wallets/kastle.svg" alt="" />
                  </div>
                  <div className="wm-wallet-details">
                    <span className="wm-wallet-name">Kastle</span>
                    <span className="wm-wallet-status">
                      {!wallets?.kastle ? '⚠ Not Installed' : '✓ Ready'}
                    </span>
                  </div>
                  {connecting === 'kastle' && <div className="wm-spinner" />}
                </button>
              </div>
            </div>

            <div className="wm-divider">
              <span>♟ or use built-in wallet ♟</span>
            </div>

            <div className="wm-section">
              <button className="wm-action-btn primary" onClick={() => setView('chooseType')}>
                <span className="wm-btn-icon">♕</span>
                Create New Wallet
              </button>
              
              <div className="wm-link-row">
                <button className="wm-link-btn" onClick={() => { setView('import'); setError(null); }}>
                  Import Seed Phrase
                </button>
                <span className="wm-link-sep">•</span>
                <button className="wm-link-btn" onClick={() => { setView('importKey'); setError(null); }}>
                  Import Private Key
                </button>
              </div>
            </div>

            {error && <div className="wm-error">{error}</div>}
          </div>
        )}

        {/* ===== CHOOSE WALLET TYPE ===== */}
        {view === 'chooseType' && (
          <div className="wm-view">
            <div className="wm-header">
              <div className="wm-title-row">
                <ChessPiece piece="♛" />
                <h2>Choose Your Key</h2>
                <ChessPiece piece="♛" />
              </div>
              <p className="wm-subtitle">Select the format for your new wallet</p>
            </div>

            <div className="wm-type-grid">
              <button 
                className={`wm-type-card ${creationType === 'mnemonic' && wordCount === 12 ? 'selected' : ''}`}
                onClick={() => { setCreationType('mnemonic'); setWordCount(12); }}
              >
                <div className="wm-type-icon">📝</div>
                <div className="wm-type-value">12</div>
                <div className="wm-type-label">Words</div>
                <div className="wm-type-desc">Standard Security</div>
                <div className="wm-type-bits">128-bit entropy</div>
              </button>
              
              <button 
                className={`wm-type-card ${creationType === 'mnemonic' && wordCount === 24 ? 'selected' : ''}`}
                onClick={() => { setCreationType('mnemonic'); setWordCount(24); }}
              >
                <div className="wm-type-icon">📜</div>
                <div className="wm-type-value">24</div>
                <div className="wm-type-label">Words</div>
                <div className="wm-type-desc">Maximum Security</div>
                <div className="wm-type-bits">256-bit entropy</div>
              </button>
              
              <button 
                className={`wm-type-card ${creationType === 'hex' ? 'selected' : ''}`}
                onClick={() => setCreationType('hex')}
              >
                <div className="wm-type-icon">🔐</div>
                <div className="wm-type-value">64</div>
                <div className="wm-type-label">Hex Key</div>
                <div className="wm-type-desc">Raw Private Key</div>
                <div className="wm-type-bits">256-bit direct</div>
              </button>
            </div>

            <button 
              className="wm-action-btn primary"
              onClick={handleCreate}
              disabled={connecting !== null}
            >
              {connecting === 'generating' ? (
                <>
                  <div className="wm-spinner light" />
                  Generating...
                </>
              ) : (
                <>
                  <span className="wm-btn-icon">⚡</span>
                  {creationType === 'hex' ? 'Generate Hex Key' : `Generate ${wordCount}-Word Phrase`}
                </>
              )}
            </button>
            
            <button className="wm-back-btn" onClick={() => setView('list')}>
              ← Back to options
            </button>
            
            {error && <div className="wm-error">{error}</div>}
          </div>
        )}

        {/* ===== MNEMONIC BACKUP VIEW ===== */}
        {view === 'create' && (
          <div className="wm-view">
            <div className="wm-header compact">
              <div className="wm-title-row">
                <ChessPiece piece="♜" />
                <h2>Secure Your Kingdom</h2>
                <ChessPiece piece="♜" />
              </div>
            </div>

            <div className="wm-warning">
              <span className="wm-warning-icon">⚠️</span>
              <div>
                <strong>Write these down NOW!</strong>
                <p>This is your only way to recover funds. We never store your keys.</p>
              </div>
            </div>

            <div className="wm-key-section">
              <div className="wm-key-header">
                <span>📝 Recovery Phrase</span>
                <span className="wm-key-badge">{wordCount} words</span>
              </div>
              <div className="wm-mnemonic-grid">
                {newMnemonic?.split(' ').map((word, i) => (
                  <div key={i} className="wm-word">
                    <span className="wm-word-num">{i + 1}</span>
                    <span className="wm-word-text">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="wm-key-section">
              <div className="wm-key-header">
                <span>🔑 Private Key</span>
                <span className="wm-key-badge">64 hex</span>
              </div>
              <div className="wm-private-key">
                <code className={showPrivateKey ? '' : 'blurred'}>
                  {showPrivateKey ? newPrivateKey : '●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●'}
                </code>
                <div className="wm-key-actions">
                  <button onClick={() => setShowPrivateKey(!showPrivateKey)}>
                    {showPrivateKey ? '🙈 Hide' : '👁 Show'}
                  </button>
                  {showPrivateKey && (
                    <button onClick={() => { navigator.clipboard.writeText(newPrivateKey || ''); }}>
                      📋 Copy
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="wm-checkbox">
              <input 
                type="checkbox" 
                checked={confirmed} 
                onChange={(e) => setConfirmed(e.target.checked)} 
              />
              <span className="wm-checkbox-mark" />
              <span>I have securely saved my recovery phrase</span>
            </label>

            <button 
              className="wm-action-btn primary" 
              onClick={handleCreateConfirm} 
              disabled={connecting !== null || !confirmed}
            >
              {connecting ? (
                <><div className="wm-spinner light" /> Creating Wallet...</>
              ) : (
                <>♔ Enter the Arena</>
              )}
            </button>
            
            <button className="wm-back-btn" onClick={() => { setView('chooseType'); setNewMnemonic(null); setNewPrivateKey(null); setShowPrivateKey(false); setConfirmed(false); }}>
              ← Back
            </button>
          </div>
        )}

        {/* ===== HEX KEY BACKUP VIEW ===== */}
        {view === 'createKey' && (
          <div className="wm-view">
            <div className="wm-header compact">
              <div className="wm-title-row">
                <ChessPiece piece="♝" />
                <h2>Your Secret Key</h2>
                <ChessPiece piece="♝" />
              </div>
            </div>

            <div className="wm-warning">
              <span className="wm-warning-icon">⚠️</span>
              <div>
                <strong>Store this safely!</strong>
                <p>This 64-character key is your only access. Never share it.</p>
              </div>
            </div>

            <div className="wm-key-section">
              <div className="wm-key-header">
                <span>🔐 Private Key</span>
                <span className="wm-key-badge">256-bit hex</span>
              </div>
              <div className="wm-private-key large">
                <code className={showPrivateKey ? '' : 'blurred'}>
                  {showPrivateKey ? newPrivateKey : '●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●'}
                </code>
                <div className="wm-key-actions">
                  <button onClick={() => setShowPrivateKey(!showPrivateKey)}>
                    {showPrivateKey ? '🙈 Hide' : '👁 Show'}
                  </button>
                  {showPrivateKey && (
                    <button onClick={() => { navigator.clipboard.writeText(newPrivateKey || ''); }}>
                      📋 Copy
                    </button>
                  )}
                </div>
              </div>
              <p className="wm-key-hint">
                💡 This key works directly with Kasware, Kastle, and other Kaspa wallets
              </p>
            </div>

            <label className="wm-checkbox">
              <input 
                type="checkbox" 
                checked={confirmed} 
                onChange={(e) => setConfirmed(e.target.checked)} 
              />
              <span className="wm-checkbox-mark" />
              <span>I have securely saved my private key</span>
            </label>

            <button 
              className="wm-action-btn primary" 
              onClick={handleCreateKeyConfirm} 
              disabled={connecting !== null || !confirmed}
            >
              {connecting ? (
                <><div className="wm-spinner light" /> Creating Wallet...</>
              ) : (
                <>♔ Enter the Arena</>
              )}
            </button>
            
            <button className="wm-back-btn" onClick={() => { setView('chooseType'); setNewPrivateKey(null); setShowPrivateKey(false); setConfirmed(false); }}>
              ← Back
            </button>
            
            {error && <div className="wm-error">{error}</div>}
          </div>
        )}

        {/* ===== IMPORT MNEMONIC VIEW ===== */}
        {view === 'import' && (
          <div className="wm-view">
            <div className="wm-header">
              <div className="wm-title-row">
                <ChessPiece piece="♞" />
                <h2>Import Wallet</h2>
                <ChessPiece piece="♞" />
              </div>
              <p className="wm-subtitle">Restore your wallet with recovery phrase</p>
            </div>

            <div className="wm-input-section">
              <label className="wm-input-label">Recovery Phrase (12 or 24 words)</label>
              <textarea 
                className="wm-textarea"
                value={importMnemonic}
                onChange={(e) => setImportMnemonic(e.target.value)}
                rows={4}
              />
            </div>

            {error && <div className="wm-error">{error}</div>}

            <button 
              className="wm-action-btn primary" 
              onClick={handleImport} 
              disabled={connecting !== null || !importMnemonic.trim()}
            >
              {connecting ? (
                <><div className="wm-spinner light" /> Importing...</>
              ) : (
                <>♜ Restore Wallet</>
              )}
            </button>
            
            <button className="wm-back-btn" onClick={() => { setView('list'); setImportMnemonic(''); setError(null); }}>
              ← Back
            </button>
          </div>
        )}

        {/* ===== IMPORT PRIVATE KEY VIEW ===== */}
        {view === 'importKey' && (
          <div className="wm-view">
            <div className="wm-header">
              <div className="wm-title-row">
                <ChessPiece piece="♝" />
                <h2>Import Key</h2>
                <ChessPiece piece="♝" />
              </div>
              <p className="wm-subtitle">Restore with your 64-character hex key</p>
            </div>

            <div className="wm-input-section">
              <label className="wm-input-label">Private Key</label>
              <input 
                type="password"
                className="wm-input"
                placeholder="64-character hexadecimal private key"
                value={importPrivateKey}
                onChange={(e) => setImportPrivateKey(e.target.value)}
              />
              <p className="wm-input-hint">
                Export from Kasware/Kastle: Settings → Export Private Key
              </p>
            </div>

            {error && <div className="wm-error">{error}</div>}

            <button 
              className="wm-action-btn primary" 
              onClick={handleImportKey} 
              disabled={connecting !== null || !importPrivateKey.trim()}
            >
              {connecting ? (
                <><div className="wm-spinner light" /> Importing...</>
              ) : (
                <>♝ Restore Wallet</>
              )}
            </button>
            
            <button className="wm-back-btn" onClick={() => { setView('list'); setImportPrivateKey(''); setError(null); }}>
              ← Back
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
