
import React, { useState } from 'react'
import '../styles.css'

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

export default function WalletModal({ open, onClose, onConnectKasware, onConnectKastle, onImportInternal, onImportPrivateKey, onGenerateMnemonic, wallets }: any) {
  const [view, setView] = useState<'list' | 'create' | 'import' | 'importKey'>('list')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Create flow
  const [newMnemonic, setNewMnemonic] = useState<string | null>(null)
  const [newPrivateKey, setNewPrivateKey] = useState<string | null>(null)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  
  // Import flow
  const [importMnemonic, setImportMnemonic] = useState('')
  const [importPrivateKey, setImportPrivateKey] = useState('')

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
      const mnemonic = await onGenerateMnemonic()
      setNewMnemonic(mnemonic)
      
      // Derive and show the private key
      const privateKey = await derivePrivateKeyHex(mnemonic)
      setNewPrivateKey(privateKey)
      
      setView('create')
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
    <div className="modalBackdrop" onClick={onClose}>
      <div className="walletModal" onClick={(e) => e.stopPropagation()}>
        <button className="closeBtn" onClick={onClose} aria-label="Close">✕</button>
        
        {view === 'list' && (
            <>
                <div className="modalHeader">
                  <h2>Connect Wallet</h2>
                </div>
                <div className="modalContent">
                  <div className="walletOptions">
                    <button 
                      className="walletOption kasware" 
                      onClick={() => handleConnect('kasware')}
                      disabled={!wallets?.kasware || connecting !== null}
                    >
                      <div className="walletLogoWrap">
                        <img className="walletLogo" src="/wallets/kasware.svg" alt="Kasware" />
                      </div>
                      <div className="walletInfo">
                        <div className="walletName">Kasware</div>
                        <div className="walletStatus">
                          {!wallets?.kasware ? 'Not Installed' : 'Browser Extension'}
                        </div>
                      </div>
                      {connecting === 'kasware' && <div className="spinner"></div>}
                    </button>

                    <button 
                      className="walletOption kastle" 
                      onClick={() => handleConnect('kastle')}
                      disabled={!wallets?.kastle || connecting !== null}
                    >
                      <div className="walletLogoWrap">
                        <img className="walletLogo" src="/wallets/kastle.svg" alt="Kastle" />
                      </div>
                      <div className="walletInfo">
                        <div className="walletName">Kastle</div>
                        <div className="walletStatus">
                          {!wallets?.kastle ? 'Not Installed' : 'Browser Extension'}
                        </div>
                      </div>
                      {connecting === 'kastle' && <div className="spinner"></div>}
                    </button>
                  </div>

                  <div className="divider"><span>OR</span></div>
  
                  <div className="internalWalletOptions">
                      <button className="primaryBtn fullWidth" onClick={handleCreate}>Create New Wallet</button>
                      <button className="textBtn fullWidth" onClick={() => { setView('import'); setError(null); }}>Import with seed phrase</button>
                      <button className="textBtn fullWidth" onClick={() => { setView('importKey'); setError(null); }}>Import with private key</button>
                  </div>

                  {error && <div className="errorBox">{error}</div>}
                </div>
            </>
        )}

        {view === 'create' && (
            <>
                <div className="modalHeader">
                  <h2>🔐 Backup Your Keys</h2>
                </div>
                <div className="modalContent">
                    <div className="warningBox">
                        ⚠️ <strong>CRITICAL:</strong> Write these down and store them safely. 
                        This is your ONLY way to recover your funds. We do NOT store this data.
                    </div>
                    
                    <div className="keySection">
                      <h3>📝 Seed Phrase (12 words)</h3>
                      <p className="keyDescription">Use this to restore your wallet in any Kaspa wallet app.</p>
                      <div className="mnemonicBox">
                          {newMnemonic?.split(' ').map((word, i) => (
                              <span key={i} className="mnemonicWord"><span className="wordNum">{i+1}.</span> {word}</span>
                          ))}
                      </div>
                    </div>
                    
                    <div className="keySection">
                      <h3>🔑 Private Key (64-hex)</h3>
                      <p className="keyDescription">Alternative backup - can import directly into Kasware/Kastle.</p>
                      <div className="privateKeyBox">
                        <code className={showPrivateKey ? 'revealed' : 'hidden'}>
                          {showPrivateKey ? newPrivateKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                        </code>
                        <button 
                          className="revealBtn" 
                          onClick={() => setShowPrivateKey(!showPrivateKey)}
                        >
                          {showPrivateKey ? '🙈 Hide' : '👁️ Reveal'}
                        </button>
                        {showPrivateKey && (
                          <button 
                            className="copyBtn"
                            onClick={() => {
                              navigator.clipboard.writeText(newPrivateKey || '')
                              alert('Private key copied!')
                            }}
                          >
                            📋 Copy
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <button className="primaryBtn fullWidth" onClick={handleCreateConfirm} disabled={connecting !== null}>
                        {connecting ? 'Creating...' : '✓ I have saved my keys securely'}
                    </button>
                    <button className="textBtn fullWidth" onClick={() => { setView('list'); setNewPrivateKey(null); setShowPrivateKey(false); }}>Back</button>
                </div>
            </>
        )}

        {view === 'import' && (
             <>
                <div className="modalHeader">
                  <h2>Import Wallet</h2>
                </div>
                <div className="modalContent">
                    <p className="subText">Enter your 12 or 24-word seed phrase to restore your wallet.</p>
                    <textarea 
                        className="mnemonicInput" 
                        placeholder="word1 word2 word3 ... (12 or 24 words)" 
                        value={importMnemonic}
                        onChange={(e) => setImportMnemonic(e.target.value)}
                    />
                    
                    {error && <div className="errorBox">{error}</div>}

                    <button className="primaryBtn fullWidth" onClick={handleImport} disabled={connecting !== null || !importMnemonic}>
                        {connecting ? 'Importing...' : 'Import Wallet'}
                    </button>
                    <button className="textBtn fullWidth" onClick={() => setView('list')}>Back</button>
                </div>
            </>
        )}

        {view === 'importKey' && (
             <>
                <div className="modalHeader">
                  <h2>Import Existing Wallet</h2>
                </div>
                <div className="modalContent">
                    <p className="subText">Enter your private key to import your existing Kaspa mainnet wallet.</p>
                    <p className="subText" style={{fontSize: '0.85em', opacity: 0.7}}>
                        Your private key is a 64-character hex string. You can export it from Kasware, Kastle, or other Kaspa wallets.
                    </p>
                    <input 
                        type="password"
                        className="mnemonicInput" 
                        placeholder="64-character hex private key" 
                        value={importPrivateKey}
                        onChange={(e) => setImportPrivateKey(e.target.value)}
                        style={{fontFamily: 'monospace', height: 'auto', padding: '12px'}}
                    />
                    
                    {error && <div className="errorBox">{error}</div>}

                    <button className="primaryBtn fullWidth" onClick={handleImportKey} disabled={connecting !== null || !importPrivateKey}>
                        {connecting ? 'Importing...' : 'Import Wallet'}
                    </button>
                    <button className="textBtn fullWidth" onClick={() => setView('list')}>Back</button>
                </div>
            </>
        )}

      </div>
    </div>
  )
}
