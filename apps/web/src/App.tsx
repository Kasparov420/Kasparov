import React, { useEffect, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { Square } from "chess.js";
import ChessGame, { type GameState } from "./game/ChessGame";
import { randomTheme, themeFromSeed, type Theme } from "./game/theme";
import { kaspaService } from "./kaspa/kaspaService";
import { indexerService } from "./indexer/indexerService";
import { setWrpcEndpoint, getConfiguredEndpoint } from "./kaspa/wallet";
import ChatPanel from "./ui/components/ChatPanel";
import "./App.css";

type Screen = "wallet-setup" | "welcome" | "lobby" | "playing";

// Kaspa network stats interface
interface KaspaNetworkStats {
  price: number;
  priceChange24h: number;
  hashrate: number;        // in TH/s from API
  blueScore: number;
  difficulty: number;
  marketCap: number;
  circulatingSupply: number;
  blockReward: number;
  dagTips: number;         // number of DAG tips
  daaScore: number;        // DAA score
}

// Side panel component for Kaspa stats
function KaspaSidePanel({ position, hideBlueScore }: { position: 'left' | 'right', hideBlueScore?: boolean }) {
  const [stats, setStats] = useState<KaspaNetworkStats | null>(null);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch all Kaspa stats in parallel - using Kaspa API for price (more reliable)
        const [kasPriceRes, cgPriceRes, hashrateRes, blueScoreRes, supplyRes, rewardRes, networkRes] = await Promise.allSettled([
          fetch('https://api.kaspa.org/info/price'),
          fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true'),
          fetch('https://api.kaspa.org/info/hashrate'),
          fetch('https://api.kaspa.org/info/virtual-chain-blue-score'),
          fetch('https://api.kaspa.org/info/coinsupply'),
          fetch('https://api.kaspa.org/info/blockreward'),
          fetch('https://api.kaspa.org/info/network')
        ]);
        
        let price = 0, priceChange = 0;
        let hashrate = 0, blueScore = 0, circulatingSupply = 0, blockReward = 0;
        let difficulty = 0, dagTips = 0, daaScore = 0;
        
        // Get price from Kaspa API (more reliable, updates faster)
        if (kasPriceRes.status === 'fulfilled' && kasPriceRes.value.ok) {
          const data = await kasPriceRes.value.json();
          price = data.price || 0;
        }
        
        // Get 24h change from CoinGecko (Kaspa API doesn't have this)
        if (cgPriceRes.status === 'fulfilled' && cgPriceRes.value.ok) {
          const data = await cgPriceRes.value.json();
          priceChange = data.kaspa?.usd_24h_change || 0;
          // Fallback price if Kaspa API failed
          if (!price) price = data.kaspa?.usd || 0;
        }
        
        if (hashrateRes.status === 'fulfilled' && hashrateRes.value.ok) {
          const data = await hashrateRes.value.json();
          hashrate = data.hashrate || 0; // TH/s
        }
        
        if (blueScoreRes.status === 'fulfilled' && blueScoreRes.value.ok) {
          const data = await blueScoreRes.value.json();
          blueScore = data.blueScore || 0;
        }
        
        if (supplyRes.status === 'fulfilled' && supplyRes.value.ok) {
          const data = await supplyRes.value.json();
          // Supply is in sompi (1 KAS = 100,000,000 sompi)
          circulatingSupply = parseInt(data.circulatingSupply || '0') / 1e8;
        }
        
        if (rewardRes.status === 'fulfilled' && rewardRes.value.ok) {
          const data = await rewardRes.value.json();
          blockReward = data.blockreward || 0;
        }
        
        if (networkRes.status === 'fulfilled' && networkRes.value.ok) {
          const data = await networkRes.value.json();
          difficulty = parseFloat(data.difficulty) || 0;
          dagTips = data.tipHashes?.length || 0;
          daaScore = parseInt(data.virtualDaaScore) || 0;
        }
        
        // Calculate market cap from price × circulating supply
        const marketCap = price * circulatingSupply;
        
        setStats({
          price,
          priceChange24h: priceChange,
          hashrate,
          blueScore,
          difficulty,
          marketCap,
          circulatingSupply,
          blockReward,
          dagTips,
          daaScore,
        });
      } catch (e) {
        console.error('[KaspaStats] Fetch error:', e);
      }
    };
    
    fetchStats();
    // Refresh every 3 seconds for real-time data
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (n: number, decimals = 2) => {
    if (n >= 1e12) return (n / 1e12).toFixed(decimals) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(decimals) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(decimals) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(decimals) + 'K';
    return n.toFixed(decimals);
  };

  const formatHashrate = (th: number) => {
    if (th >= 1e6) return (th / 1e6).toFixed(2) + ' EH/s';
    if (th >= 1e3) return (th / 1e3).toFixed(2) + ' PH/s';
    return th.toFixed(2) + ' TH/s';
  };

  const leftStats = [
    { label: 'KAS Price', value: stats ? `$${stats.price.toFixed(4)}` : '---', change: stats?.priceChange24h },
    { label: 'Hashrate', value: stats ? formatHashrate(stats.hashrate) : '---' },
    { label: 'Market Cap', value: stats ? `$${formatNumber(stats.marketCap)}` : '---' },
    { label: 'Block Reward', value: stats ? `${stats.blockReward.toFixed(2)} KAS` : '---' },
  ];

  const rightStats: Array<{ label: string; value: string; change?: number }> = [
    !hideBlueScore ? { label: 'Blue Score', value: stats ? formatNumber(stats.blueScore, 0) : '---' } : null,
    { label: 'DAA Score', value: stats ? formatNumber(stats.daaScore, 0) : '---' },
    { label: 'BPS / Block Time', value: '10 BPS (0.1s)' },
    { label: 'Circulating', value: stats ? `${formatNumber(stats.circulatingSupply)} KAS` : '---' },
  ].filter((item): item is { label: string; value: string; change?: number } => item !== null);

  const items = position === 'left' ? leftStats : rightStats;

  return (
    <div className={`kaspa-side-panel ${position}`}>
      <div className="side-panel-header">
        <span className="kaspa-hex">⬡</span>
        <span>{position === 'left' ? 'KASPA NETWORK' : 'LIVE STATS'}</span>
      </div>
      <div className="side-panel-stats">
        {items.map((item, i) => (
          <div key={i} className="side-stat">
            <div className="side-stat-content">
              <span className="side-stat-label">{item.label}</span>
              <span className="side-stat-value">{item.value}</span>
              {item.change !== undefined && (
                <span className={`side-stat-change ${item.change >= 0 ? 'positive' : 'negative'}`}>
                  {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="side-panel-decoration">
        {[...Array(8)].map((_, i) => (
          <div key={i} className={`chess-square ${i % 2 === (position === 'left' ? 0 : 1) ? 'light' : 'dark'}`} />
        ))}
      </div>
    </div>
  );
}

// Transaction Popup Component
function TxPopup({ type, txId, error, onClose }: { 
  type: string; 
  txId?: string; 
  error?: string;
  onClose: () => void;
}) {
  const explorerUrl = txId ? `https://explorer.kaspa.org/txs/${txId}` : null;
  const streamUrl = txId ? `https://kaspa.stream/tx/${txId}` : null;
  
  // Auto-close after 15 seconds (longer so user can see it)
  useEffect(() => {
    const timer = setTimeout(onClose, 15000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="tx-popup-overlay" onClick={onClose}>
      <div className="tx-popup" onClick={(e) => e.stopPropagation()}>
        <button className="tx-popup-close" onClick={onClose}>×</button>
        
        <div className="tx-popup-header">
          <span className="tx-popup-icon">{txId ? '✅' : error ? '⚠️' : '⏳'}</span>
          <h3>{type}</h3>
        </div>
        
        {txId && (
          <div className="tx-popup-body">
            <p className="tx-label">Transaction ID</p>
            <code className="tx-id">{txId}</code>
            <div className="tx-explorer-links">
              <a 
                href={explorerUrl!} 
                target="_blank" 
                rel="noopener noreferrer"
                className="tx-explorer-link"
              >
                🔍 Kaspa Explorer
              </a>
              <a 
                href={streamUrl!} 
                target="_blank" 
                rel="noopener noreferrer"
                className="tx-explorer-link tx-stream-link"
              >
                📺 Kaspa Stream
              </a>
            </div>
            <p className="tx-success-msg">✨ Transaction recorded on Kaspa blockchain!</p>
          </div>
        )}
        
        {error && (
          <div className="tx-popup-error">
            <p className="tx-error-msg">⚠️ {error}</p>
            <p className="tx-error-hint">
              💡 To record transactions on-chain, send some KAS to your wallet address. 
              Each move requires at least 0.11 KAS due to wallet minimums - send at least 0.2 KAS to play!
            </p>
          </div>
        )}
        
        {!txId && !error && (
          <div className="tx-popup-loading">
            <div className="tx-spinner"></div>
            <p>Broadcasting to Kaspa network...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper to derive private key hex from mnemonic
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

// Sound effects
const playSound = (type: 'move' | 'capture' | 'notify') => {
  const audio = new Audio(`/sounds/${type}.mp3`);
  audio.play().catch(e => console.log('Audio play failed', e));
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("wallet-setup");
  const [game, setGame] = useState<ChessGame | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [manualOrientation, setManualOrientation] = useState<'white' | 'black' | 'auto'>('auto');
  const [theme, setTheme] = useState<Theme>(randomTheme());
  const [boardSize, setBoardSize] = useState(500);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('kasparov-theme');
    return saved ? saved === 'dark' : true;
  });

  // Responsive board size calculation
  useEffect(() => {
    const calculateSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      if (screen === 'lobby') {
        // Lobby needs space for text above and below
        const size = Math.min(500, w - 60, h - 450);
        setBoardSize(Math.max(280, size));
      } else if (screen === 'playing') {
        // Playing screen logic
        if (w <= 1000) {
           // Mobile/Column layout
           const size = Math.min(w - 40, h - 350, 600);
           setBoardSize(Math.max(300, size));
        } else {
           // Desktop/Row layout
           // Sidebars are 280px each -> 560px total + margins
           const availableW = w - 620;
           const availableH = h - 200;
           setBoardSize(Math.min(availableW, availableH, 750));
        }
      } else {
        // Setup/Welcome screens
        setBoardSize(Math.min(480, w - 40));
      }
    };
    
    calculateSize(); // Initial
    window.addEventListener('resize', calculateSize);
    return () => window.removeEventListener('resize', calculateSize);
  }, [screen]); // Recalculate when screen changes

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('kasparov-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);
  const [showPromotion, setShowPromotion] = useState(false);
  const [promotionMove, setPromotionMove] = useState<{ from: Square; to: Square } | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [showMnemonic, setShowMnemonic] = useState<string | null>(null);
  const [showPrivateKeyHex, setShowPrivateKeyHex] = useState<string | null>(null);
  const [privateKeyRevealed, setPrivateKeyRevealed] = useState(false);
  const [wordCountChoice, setWordCountChoice] = useState<12 | 24>(12);
  const [showWordCountPicker, setShowWordCountPicker] = useState(false);
  const [importMode, setImportMode] = useState<'mnemonic' | 'privateKey' | 'nodeConfig' | false>(false);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [nodeEndpoint, setNodeEndpoint] = useState(getConfiguredEndpoint());
  const [txPopup, setTxPopup] = useState<{ show: boolean; txId?: string; error?: string; type: string } | null>(null);
  const [availableWallets, setAvailableWallets] = useState<{ kasware: boolean; kastle: boolean; other: string[] } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{id: string, from: string, text: string, ts: number}>>([]);
  const [chatSeq, setChatSeq] = useState(0);

  // Handler functions
  const handleConnectKasware = async () => {
    try {
      const session = await kaspaService.connectKasware();
      setWalletAddress(session.address);
      setScreen("welcome");
    } catch (e: any) {
      alert(`Kasware connection failed: ${e.message}`);
    }
  };

  const handleConnectKastle = async () => {
    try {
      const session = await kaspaService.connectKastle();
      setWalletAddress(session.address);
      setScreen("welcome");
    } catch (e: any) {
      alert(`Kastle connection failed: ${e.message}`);
    }
  };

  const handleCreateWallet = async () => {
    try {
      const mnemonic = await kaspaService.generateNewMnemonic(wordCountChoice);
      await kaspaService.initialize(mnemonic);
      const address = kaspaService.getAddress();
      if (address) {
        setWalletAddress(address);
        setShowMnemonic(mnemonic);
        setShowWordCountPicker(false);
      }
    } catch (e: any) {
      alert(`Failed to create wallet: ${e.message}`);
    }
  };

  const handleImportWallet = async () => {
    try {
      if (importMode === 'mnemonic') {
        await kaspaService.initialize(mnemonicInput);
      } else if (importMode === 'privateKey') {
        await kaspaService.initializeWithPrivateKey(privateKeyInput);
      }
      const address = kaspaService.getAddress();
      if (address) {
        setWalletAddress(address);
        setScreen("welcome");
        setImportMode(false);
      }
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    }
  };

  const handleImportPrivateKey = async () => {
    try {
      await kaspaService.initializeWithPrivateKey(privateKeyInput);
      const address = kaspaService.getAddress();
      if (address) {
        setWalletAddress(address);
        setScreen("welcome");
        setImportMode(false);
      }
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    }
  };

  const handleContinueAfterBackup = () => {
    setScreen("welcome");
  };

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      alert('Address copied to clipboard!');
    }
  };

  const handleCopyMnemonic = async () => {
    if (showMnemonic) {
      try {
        await navigator.clipboard.writeText(showMnemonic);
        alert('Mnemonic copied to clipboard!');
      } catch (e) {
        console.error('Failed to copy mnemonic:', e);
      }
    }
  };

  const handleDisconnect = () => {
    kaspaService.disconnect();
    setWalletAddress(null);
    setGame(null);
    setGameState(null);
    setScreen("wallet-setup");
  };

  // DON'T auto-connect from localStorage - user must explicitly import their wallet
  // The stored address is just a hint, not a real connection
  // useEffect(() => {
  //   const existing = kaspaService.checkExistingWallet();
  //   if (existing) {
  //     setWalletAddress(existing);
  //     setScreen("welcome");
  //   }
  // }, []);

  // Detect available wallets
  useEffect(() => {
    const detectWallets = async () => {
      try {
        const wallets = await kaspaService.detectAvailableWallets();
        setAvailableWallets(wallets);
      } catch (e) {
        console.error('Failed to detect wallets:', e);
      }
    };
    detectWallets();
  }, []);

  // Random theme cycling in lobby
  useEffect(() => {
    if (screen === "lobby" && gameState?.status === "lobby") {
      const interval = setInterval(() => {
        setTheme(randomTheme());
      }, 800);
      return () => clearInterval(interval);
    } else if (gameState?.status === "active" && gameState.themeSeed) {
      // Lock theme when game starts
      setTheme(themeFromSeed(gameState.themeSeed));
    }
  }, [screen, gameState?.status, gameState?.themeSeed]);

  // Polling for game updates (fallback for WebSocket)
  useEffect(() => {
    if (!gameState?.gameId) return;
    if (gameState.status === "ended") return;

    const poll = async () => {
      try {
        const serverGame = await indexerService.getGame(gameState.gameId);
        if (!serverGame) return;

        setGameState(prevState => {
          if (!prevState) return null;
          
          let newState = { ...prevState };
          let changed = false;

          // Check if status changed
          // Handle Lobby -> Active transition
          if (serverGame.status === 'active' && prevState.status === 'lobby') {
             console.log('[Poll] Game started!');
             setScreen('playing');
             if (game) {
                game.updateState({ 
                  status: 'active',
                  whitePub: serverGame.whitePub,
                  blackPub: serverGame.blackPub
                });
             }
             newState.status = 'active';
             newState.whitePub = serverGame.whitePub;
             newState.blackPub = serverGame.blackPub;
             changed = true;
          }

          // Check if FEN changed
          if (serverGame.fen && serverGame.fen !== prevState.fen) {
             console.log('[Poll] FEN changed');
             playSound('move');
             if (game) game.loadFEN(serverGame.fen);
             newState.fen = serverGame.fen;
             newState.turn = serverGame.turn || prevState.turn;
             changed = true;
          }

          return changed ? newState : prevState;
        });
      } catch (e) {
        console.error('[Poll] Error:', e);
      }
    };

    const interval = setInterval(poll, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [gameState?.gameId, gameState?.status, game]);

  // WebSocket for real-time game updates
  useEffect(() => {
    if (!gameState?.gameId) return;
    
    const host = window.location.hostname;
    let wsUrl: string;
    
    // GitHub Codespaces - need port 8787 (must be PUBLIC)
    // URL format: CODESPACE_NAME-PORT.app.github.dev
    if (host.includes('.app.github.dev') || host.includes('.preview.app.github.dev')) {
      // Replace the port number in the hostname (e.g., -5173 -> -8787)
      const wsHost = host.replace(/-\d+\./, '-8787.');
      wsUrl = `wss://${wsHost}/ws?game=${gameState.gameId}`;
    } else {
      // Local dev or production
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?game=${gameState.gameId}`;
    }
    
    console.log('[WS] Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('[WS] Connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'game' && msg.game) {
          const serverGame = msg.game;
          console.log('[WS] Game update:', serverGame);
          
          // Update our local game state with server state
          // If server has different FEN (opponent moved), update board
          setGameState(prevState => {
            if (!prevState) return prevState;
            
            if (serverGame.fen !== prevState.fen) {
              console.log('[WS] FEN changed, updating board');
              playSound('move');
              if (game) {
                game.loadFEN(serverGame.fen);
              }
              return {
                ...prevState,
                fen: serverGame.fen,
                turn: serverGame.turn,
                status: serverGame.status === 'waiting' ? 'lobby' : serverGame.status === 'active' ? 'active' : 'ended',
              };
            }
            
            // Opponent joined - change status to active
            if (serverGame.status === 'active' && prevState.status === 'lobby') {
              console.log('[WS] Opponent joined, starting game');
              if (game) {
                game.updateState({ 
                  status: 'active',
                  whitePub: serverGame.white?.address || prevState.whitePub,
                  blackPub: serverGame.black?.address || prevState.blackPub,
                });
              }
              setScreen('playing');
              return { 
                ...prevState, 
                status: 'active',
                whitePub: serverGame.white?.address || prevState.whitePub,
                blackPub: serverGame.black?.address || prevState.blackPub,
              };
            }
            
            return prevState;
          });
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };
    
    ws.onerror = (e) => {
      console.error('[WS] Error:', e);
    };
    
    ws.onclose = () => {
      console.log('[WS] Disconnected');
    };
    
    return () => {
      ws.close();
    };
  }, [gameState?.gameId, game]);

  const handleCreateGame = async () => {
    if (!walletAddress) {
      alert("Please connect a wallet first");
      return;
    }

    // Show popup FIRST
    setTxPopup({ show: true, type: 'Creating Game...', txId: undefined, error: undefined });

    try {
      // Skip balance check for now to allow testing
      // Create game on server via API - server assigns random color
      const indexedGame = await indexerService.createGame(walletAddress);
      
      // Creator is ALWAYS White
      const myColor = "w";
      console.log('[Create] I am White (creator). whitePub:', indexedGame.whitePub);
      
      const newGame = new ChessGame({
        gameId: indexedGame.gameId,
        myColor,
        whitePub: indexedGame.whitePub,
        blackPub: indexedGame.blackPub,
        status: "lobby",
      });
      
      const state = newGame.getState();
      setGame(newGame);
      setGameState(state);

      // Publish game-init to blockchain (MANDATORY)
      const result = await kaspaService.publishGameInit(indexedGame.gameId);
      if (result.success && result.txId) {
        setTxPopup({ show: true, type: '🎮 Game Created On-Chain!', txId: result.txId, error: undefined });
      } else {
        setTxPopup({ show: true, type: 'Failed to Create Game', txId: undefined, error: result.error || 'Transaction failed' });
        // Reset state
        setGame(null);
        setGameState(null);
        return;
      }

      // Go to lobby
      setScreen("lobby");
      
    } catch (e: any) {

      // Create game on server via API - server assigns random color
      const indexedGame = await indexerService.createGame(walletAddress);
      
      // Creator is ALWAYS White
      const myColor = "w";
      console.log('[Create] I am White (creator). whitePub:', indexedGame.whitePub);
      
      const newGame = new ChessGame({
        gameId: indexedGame.gameId,
        myColor,
        whitePub: indexedGame.whitePub,
        blackPub: indexedGame.blackPub,
        status: "lobby",
      });
      
      const state = newGame.getState();
      setGame(newGame);
      setGameState(state);

      // Publish game-init to blockchain (MANDATORY)
      const result = await kaspaService.publishGameInit(indexedGame.gameId);
      if (result.success && result.txId) {
        setTxPopup({ show: true, type: '🎮 Game Created On-Chain!', txId: result.txId, error: undefined });
      } else {
        // Failed to publish - cannot create game
        setTxPopup({ show: true, type: 'Failed to Create Game', txId: undefined, error: result.error || 'Transaction failed' });
        // Reset state
        setGame(null);
        setGameState(null);
        return;
      }

      // Go to lobby
      setScreen("lobby");
      
    } catch (e: any) {
      console.error("Failed to create game:", e);
      setTxPopup({ show: true, type: 'Error Creating Game', txId: undefined, error: e.message || 'Server error' });
      // Reset state on error
      setGame(null);
      setGameState(null);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    if (!walletAddress) {
      alert("Please connect a wallet first");
      return;
    }

    // Show popup FIRST
    setTxPopup({ show: true, type: 'Joining Game...', txId: undefined, error: undefined });

    try {
      // Join game via API
      // This tells the server we are joining, updates status to 'active', and assigns color
      let joinedGame = await indexerService.joinGame(gameId, walletAddress);
      
      // Fallback: If join failed (e.g. game active), check if we are already a player trying to rejoin
      if (!joinedGame) {
         const existingGame = await indexerService.getGame(gameId);
         if (existingGame && (existingGame.whitePub === walletAddress || existingGame.blackPub === walletAddress)) {
             console.log('Rejoining existing game as player');
             joinedGame = existingGame;
         }
      }

      if (!joinedGame) {
        setTxPopup({ show: true, type: 'Cannot Join', txId: undefined, error: 'Game may already have 2 players or has ended.' });
        return;
      }

      // Joiner gets the opposite color from creator - determine from server response
      const myColor = joinedGame.whitePub === walletAddress ? "w" : "b";
      console.log('[Join] My color:', myColor, 'whitePub:', joinedGame.whitePub, 'blackPub:', joinedGame.blackPub);
      
      const newGame = new ChessGame({
        gameId,
        myColor,
        whitePub: joinedGame.whitePub,
        blackPub: joinedGame.blackPub,
        status: "active",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      });
      
      const state = newGame.getState();
      setGame(newGame);
      setGameState(state);

      // Publish game-join to blockchain (MANDATORY)
      const result = await kaspaService.publishGameJoin(gameId);
      if (result.success && result.txId) {
        setTxPopup({ show: true, type: '🎯 Joined Game On-Chain!', txId: result.txId, error: undefined });
      } else {
        // Failed to publish - cannot join game
        setTxPopup({ show: true, type: 'Failed to Join Game', txId: undefined, error: result.error || 'Transaction failed' });
        // Reset state
        setGame(null);
        setGameState(null);
        return;
      }

      // Go directly to playing
      setScreen("playing");
      setTxPopup(null); // Clear loading spinner initially

    } catch (e: any) {
      console.error("Failed to join game:", e);
      setTxPopup({ show: true, type: 'Error Joining Game', txId: undefined, error: e.message || 'Server error' });
    }
  };

  const handleStartGame = () => {
    if (!game || !gameState) return;
    
    game.updateState({ status: "active" });
    setGameState(game.getState());
    setScreen("playing");
  };

  const handleSquareClick = async (square: Square, piece: string | undefined) => {
    if (!game || !gameState) return;
    if (gameState.status !== "active") return;
    if (gameState.turn !== gameState.myColor) return;

    const result = game.handleSquareClick(square);
    
    if (result.action === "move" && result.updatedState && result.move) {
      const updatedState = result.updatedState;
      // Get the UCI notation first
      const uci = updatedState.moves![updatedState.moves!.length - 1];
      
      // Check wallet balance before publishing
      const balance = await kaspaService.getBalance();
      if (balance < 2000n) { // Need at least ~2000 sompi for a move
        setTxPopup({ 
          show: true, 
          type: 'Insufficient Funds', 
          txId: undefined, 
          error: 'Need at least 0.00002 KAS for moves. Send more funds to your wallet.' 
        });
        return;
      }
      
      // Publish move to blockchain (MANDATORY) - K-Social style with payload
      const prevTxid = gameState.lastTxid || '0'.repeat(64);
      kaspaService.publishChessMove(updatedState.gameId!, uci, updatedState.moves!.length, prevTxid).then(async (moveResult) => {
        if (moveResult.success && moveResult.txId) {
          console.log("Move published to DAG:", moveResult.txId);
          
          // Now update the game state and sync to server
          game.updateState(updatedState);
          const newState = game.getState();
          
          // Update with the txid for payload chaining
          game.updateState({ lastTxid: moveResult.txId });
          const finalState = game.getState();
          setGameState(finalState);

          // Don't sync to server - watcher will detect the transaction and update state
          console.log('[Move] Transaction published, watcher will detect and update state');

          setTxPopup({ show: true, type: '♟ Move On-Chain!', txId: moveResult.txId, error: undefined });
          
          // Check if game over
          const gameOver = game.isGameOver();
          if (gameOver.over) {
            console.log("Game over:", gameOver.result);
            game.updateState({ status: "ended" });
            setGameState(game.getState());
          }
        } else {
          // Failed to publish - revert the move
          console.error("Move failed to publish:", moveResult.error);
          setTxPopup({ show: true, type: 'Move Failed', txId: undefined, error: moveResult.error || 'Transaction failed' });
          // Don't update game state
        }
      }).catch(e => {
        console.error("Move publish error:", e);
        setTxPopup({ show: true, type: 'Move Failed', txId: undefined, error: 'Network error' });
      });
    } else if (result.updatedState) {
      game.updateState(result.updatedState);
      setGameState(game.getState());
    }
  };

  // Handle drag and drop moves
  const handlePieceDrop = async (sourceSquare: Square, targetSquare: Square, piece: string): Promise<boolean> => {
    console.log('[Move] Drop:', sourceSquare, '->', targetSquare);
    
    if (!game || !gameState) {
      console.log('[Move] No game state');
      return false;
    }

    // Ensure it's my turn
    if (gameState.turn !== gameState.myColor) {
      console.log('[Move] Not my turn');
      return false;
    }

    try {
      // Check wallet balance first - use same logic as transaction publishing
      const utxos = await kaspaService.getUtxos();
      if (!utxos || utxos.length === 0) {
        setTxPopup({ 
          show: true, 
          type: 'Wallet Needs Funding', 
          txId: undefined, 
          error: 'Send at least 0.00002 KAS to your wallet address to make moves. Use any Kaspa wallet or exchange.' 
        });
        return false;
      }

      // Calculate total balance from UTXOs
      let totalBalance = 0n;
      for (const utxo of utxos) {
        totalBalance += BigInt(utxo.utxoEntry?.amount || 0);
      }

      // Check minimum balance for moves (1 KAS)
      const minBalance = 100000000n; // 1 KAS in sompi
      if (totalBalance < minBalance) {
        const needed = Number(minBalance) / 1e8;
        const have = Number(totalBalance) / 1e8;
        setTxPopup({ 
          show: true, 
          type: 'Insufficient Balance', 
          txId: undefined, 
          error: `Need at least ${needed.toFixed(5)} KAS to make moves. You have ${have.toFixed(8)} KAS. Send more funds to: ${walletAddress}` 
        });
        return false;
      }

      // Use chess.js directly to validate and make the move
      const chess = game.getChess();
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // Auto-queen
      });

      if (!move) {
        console.log('[Move] Invalid move');
        return false;
      }

      // Update state
      const uci = sourceSquare + targetSquare + (move.promotion || '');
      const newFen = chess.fen();
      const newTurn = chess.turn();
      
      console.log('[Move] Success:', uci, 'FEN:', newFen);
      playSound(move.captured ? 'capture' : 'move');

      // Publish move to blockchain (MANDATORY)
      const moveResult = await kaspaService.publishMove(gameState.gameId, uci, gameState.moves.length + 1);
      if (moveResult.success && moveResult.txId) {
        console.log("Move published to DAG:", moveResult.txId);
        
        // Update game state
        setGameState(prev => prev ? {
          ...prev,
          fen: newFen,
          turn: newTurn,
          moves: [...prev.moves, uci],
        } : prev);

        // Sync to server with txid
        if (walletAddress && gameState.gameId) {
          const ok = await indexerService.recordMove(gameState.gameId, walletAddress, uci, moveResult.txId);
          console.log('[Move] Server sync:', ok ? 'success' : 'failed');
        }

        setTxPopup({ show: true, type: '♟ Move On-Chain!', txId: moveResult.txId, error: undefined });

        // Check if game over
        const gameOver = game.isGameOver();
        if (gameOver.over) {
          console.log("Game over:", gameOver.result);
          game.updateState({ status: "ended" });
          setGameState(game.getState());
        }

        return true;
      } else {
        // Failed to publish - revert the move
        console.error("Move failed to publish:", moveResult.error);
        setTxPopup({ show: true, type: 'Move Failed', txId: undefined, error: moveResult.error || 'Transaction failed' });
        // Revert the chess move
        chess.undo();
        return false;
      }
    } catch (e) {
      console.error('[Move] Error:', e);
      return false;
    }
  };

  const handlePromotion = async (piece: "q" | "r" | "b" | "n") => {
    if (!game || !promotionMove) return;
    
    // Check wallet balance first - use same logic as transaction publishing
    const utxos = await kaspaService.getUtxos();
    if (!utxos || utxos.length === 0) {
      setTxPopup({ 
        show: true, 
        type: 'Wallet Needs Funding', 
        txId: undefined, 
        error: 'Send at least 0.00002 KAS to your wallet address to make moves. Use any Kaspa wallet or exchange.' 
      });
      return;
    }

    // Calculate total balance from UTXOs
    let totalBalance = 0n;
    for (const utxo of utxos) {
      totalBalance += BigInt(utxo.utxoEntry?.amount || 0);
    }

    // Check minimum balance for moves (1 KAS)
    const minBalance = 100000000n; // 1 KAS in sompi
    if (totalBalance < minBalance) {
      const needed = Number(minBalance) / 1e8;
      const have = Number(totalBalance) / 1e8;
      setTxPopup({ 
        show: true, 
        type: 'Insufficient Balance', 
        txId: undefined, 
        error: `Need at least ${needed.toFixed(5)} KAS to make moves. You have ${have.toFixed(8)} KAS. Send more funds to: ${walletAddress}` 
      });
      return;
    }
    
    const move = game.handlePromotion(promotionMove.from, promotionMove.to, piece);
    if (move) {
      const newState = game.getState();
      
      // Publish move to DAG (MANDATORY)
      const uci = newState.moves[newState.moves.length - 1];
      const result = await kaspaService.publishMove(
        newState.gameId,
        uci,
        newState.moves.length
      );
      
      if (result.success && result.txId) {
        console.log("Promotion published to DAG:", result.txId);
        setGameState(newState);
        setTxPopup({ show: true, type: '♛ Promotion On-Chain!', txId: result.txId, error: undefined });
      } else {
        // Failed to publish - cannot make promotion
        console.error("Promotion failed to publish:", result.error);
        setTxPopup({ show: true, type: 'Promotion Failed', txId: undefined, error: result.error || 'Transaction failed' });
        // Revert the move
        game.getChess().undo();
        setGameState(game.getState());
      }
    }
    
    setShowPromotion(false);
    setPromotionMove(null);
  };

  const handleSendMessage = async (message: string) => {
    if (!gameState?.gameId || !walletAddress) return;

    // Check wallet balance first
    const utxos = await kaspaService.getUtxos();
    if (!utxos || utxos.length === 0) {
      setTxPopup({ 
        show: true, 
        type: 'Wallet Needs Funding', 
        txId: undefined, 
        error: 'Send at least 0.00002 KAS to your wallet address to send chat messages. Use any Kaspa wallet or exchange.' 
      });
      return;
    }

    // Calculate total balance from UTXOs
    let totalBalance = 0n;
    for (const utxo of utxos) {
      totalBalance += BigInt(utxo.utxoEntry?.amount || 0);
    }

    // Check minimum balance for chat (1 KAS)
    const minBalance = 100000000n; // 1 KAS in sompi
    if (totalBalance < minBalance) {
      const needed = Number(minBalance) / 1e8;
      const have = Number(totalBalance) / 1e8;
      setTxPopup({ 
        show: true, 
        type: 'Insufficient Balance', 
        txId: undefined, 
        error: `Need at least ${needed.toFixed(5)} KAS to send chat messages. You have ${have.toFixed(8)} KAS. Send more funds to: ${walletAddress}` 
      });
      return;
    }

    // Show popup
    setTxPopup({ show: true, type: 'Sending Chat...', txId: undefined, error: undefined });

    try {
      // Publish chat message to blockchain
      const seq = chatSeq;
      setChatSeq(prev => prev + 1);

      const result = await kaspaService.publishChat(gameState.gameId, message, seq);
      
      if (result.success && result.txId) {
        console.log("Chat published to DAG:", result.txId);
        
        // Add message to local chat
        const newMessage = {
          id: result.txId,
          from: walletAddress.slice(0, 10) + '...',
          text: message,
          ts: Date.now()
        };
        setChatMessages(prev => [...prev, newMessage]);
        
        setTxPopup({ show: true, type: '💬 Chat On-Chain!', txId: result.txId, error: undefined });
      } else {
        console.error("Chat failed to publish:", result.error);
        setTxPopup({ show: true, type: 'Chat Failed', txId: undefined, error: result.error || 'Transaction failed' });
        // Revert sequence counter
        setChatSeq(prev => prev - 1);
      }
    } catch (e: any) {
      console.error("Chat publish error:", e);
      setTxPopup({ show: true, type: 'Chat Failed', txId: undefined, error: 'Network error' });
      // Revert sequence counter
      setChatSeq(prev => prev - 1);
    }
  };

  const getSquareStyles = () => {
    if (!gameState) return {};
    
    const styles: Record<string, React.CSSProperties> = {};
    
    // Highlight selected square
    if (gameState.selectedSquare) {
      styles[gameState.selectedSquare] = {
        backgroundColor: theme.selectedSquare,
      };
    }
    
    // Highlight legal move destinations
    gameState.legalMoves.forEach((move) => {
      styles[move.to] = {
        background: `radial-gradient(circle, ${theme.legalMoveIndicator} 25%, transparent 25%)`,
        borderRadius: "50%",
      };
    });
    
    // Highlight last move
    if (gameState.lastMove) {
      styles[gameState.lastMove.from] = {
        backgroundColor: "rgba(255, 255, 0, 0.4)",
      };
      styles[gameState.lastMove.to] = {
        backgroundColor: "rgba(255, 255, 0, 0.4)",
      };
    }
    
    return styles;
  };

  if (screen === "wallet-setup") {
    // Show mnemonic backup screen
    if (showMnemonic) {
      const wordCount = showMnemonic.split(" ").length;
      return (
        <div className="app wallet-setup-screen">
          <KaspaSidePanel position="left" />
          <div className="wallet-setup chess-theme">
            <div className="chess-header">
              <span className="chess-piece">♜</span>
              <h2>Secure Your Kingdom</h2>
              <span className="chess-piece">♜</span>
            </div>
            <div className="warning-box">
              <span className="warning-icon">⚠️</span>
              <div>
                <strong>Write these down NOW!</strong>
                <p>This is your ONLY way to recover funds. We never store your keys.</p>
              </div>
            </div>
            <div className="key-section">
              <div className="key-header">
                <span>📝 Recovery Phrase</span>
                <span className="key-badge">{wordCount} words</span>
              </div>
              <div className="mnemonic-display">
                {showMnemonic.split(" ").map((word, i) => (
                  <div key={i} className="mnemonic-word">
                    <span className="word-number">{i + 1}</span>
                    <span className="word-text">{word}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleCopyMnemonic} className="btn btn-ghost" style={{ marginTop: '12px' }}>
                📋 Copy Phrase
              </button>
            </div>
            
            {showPrivateKeyHex && (
              <div className="key-section">
                <div className="key-header">
                  <span>🔑 Private Key</span>
                  <span className="key-badge">64 hex</span>
                </div>
                <div className="private-key-display">
                  <code className={privateKeyRevealed ? 'revealed' : 'blurred'}>
                    {privateKeyRevealed ? showPrivateKeyHex : '●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●'}
                  </code>
                  <div className="key-actions">
                    <button onClick={() => setPrivateKeyRevealed(!privateKeyRevealed)} className="btn btn-small">
                      {privateKeyRevealed ? '🙈 Hide' : '👁 Show'}
                    </button>
                    {privateKeyRevealed && (
                      <button 
                        onClick={() => { navigator.clipboard.writeText(showPrivateKeyHex); alert('Private key copied!'); }}
                        className="btn btn-small"
                      >
                        📋 Copy
                      </button>
                    )}
                  </div>
                </div>
                <p className="key-hint">💡 Works with Kasware, Kastle & other Kaspa wallets</p>
              </div>
            )}
            
            <div className="wallet-info">
              <p className="wallet-label">Your Address</p>
              <code className="wallet-address" onClick={handleCopyAddress} title="Click to copy">
                {walletAddress}
              </code>
              <p className="wallet-label">Balance</p>
              <code className="wallet-balance">
                {walletBalance !== null ? `${(Number(walletBalance) / 1e8).toFixed(8)} KAS` : 'Loading...'}
              </code>
              {walletBalance !== null && walletBalance === 0n && (
                <p className="balance-warning">
                  ⚠️ Send Kaspa to this address to enable transactions
                </p>
              )}
            </div>
            <button onClick={handleContinueAfterBackup} className="btn btn-primary btn-large">
              ♔ Enter the Arena
            </button>
          </div>
          <KaspaSidePanel position="right" />
        </div>
      );
    }

    // Show hex-only backup screen
    if (showPrivateKeyHex && !showMnemonic) {
      return (
        <div className="app wallet-setup-screen">
          <KaspaSidePanel position="left" />
          <div className="wallet-setup chess-theme">
            <div className="chess-header">
              <span className="chess-piece">♝</span>
              <h2>Your Secret Key</h2>
              <span className="chess-piece">♝</span>
            </div>
            <div className="warning-box">
              <span className="warning-icon">⚠️</span>
              <div>
                <strong>Store this safely!</strong>
                <p>This 64-character key is your only access. Never share it.</p>
              </div>
            </div>
            
            <div className="key-section large">
              <div className="key-header">
                <span>🔐 Private Key</span>
                <span className="key-badge">256-bit hex</span>
              </div>
              <div className="private-key-display large">
                <code className={privateKeyRevealed ? 'revealed' : 'blurred'}>
                  {privateKeyRevealed ? showPrivateKeyHex : '●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●'}
                </code>
                <div className="key-actions">
                  <button onClick={() => setPrivateKeyRevealed(!privateKeyRevealed)} className="btn btn-small">
                    {privateKeyRevealed ? '🙈 Hide' : '👁 Show'}
                  </button>
                  {privateKeyRevealed && (
                    <button 
                      onClick={() => { navigator.clipboard.writeText(showPrivateKeyHex); alert('Private key copied!'); }}
                      className="btn btn-small"
                    >
                      📋 Copy
                    </button>
                  )}
                </div>
              </div>
              <p className="key-hint">💡 Import directly into Kasware, Kastle, or any Kaspa wallet</p>
            </div>
            
            <div className="wallet-info">
              <p className="wallet-label">Your Address</p>
              <code className="wallet-address" onClick={handleCopyAddress} title="Click to copy">
                {walletAddress}
              </code>
            </div>
            <button onClick={handleContinueAfterBackup} className="btn btn-primary btn-large">
              ♔ Enter the Arena
            </button>
          </div>
          <KaspaSidePanel position="right" />
        </div>
      );
    }

    // Word count picker
    if (showWordCountPicker) {
      return (
        <div className="app wallet-setup-screen">
          <KaspaSidePanel position="left" />
          <div className="wallet-setup chess-theme">
            <div className="chess-header">
              <span className="chess-piece">♛</span>
              <h2>Choose Your Key</h2>
              <span className="chess-piece">♛</span>
            </div>
            <p className="subtitle">Select the format for your new wallet</p>
            
            <div className="type-grid two-col">
              <button 
                onClick={() => setWordCountChoice(12)}
                className={`type-card ${wordCountChoice === 12 ? 'selected' : ''}`}
              >
                <span className="type-icon">📝</span>
                <span className="type-value">12</span>
                <span className="type-label">Words</span>
                <span className="type-desc">Standard</span>
                <span className="type-bits">128-bit</span>
              </button>
              
              <button 
                onClick={() => setWordCountChoice(24)}
                className={`type-card ${wordCountChoice === 24 ? 'selected' : ''}`}
              >
                <span className="type-icon">📜</span>
                <span className="type-value">24</span>
                <span className="type-label">Words</span>
                <span className="type-desc">Maximum</span>
                <span className="type-bits">256-bit</span>
              </button>
            </div>
            
            <p className="type-note">🔑 Both options include the 64-character hex private key</p>
            
            <button onClick={handleCreateWallet} className="btn btn-primary btn-large" style={{ width: '100%' }}>
              ⚡ Generate {wordCountChoice}-Word Wallet
            </button>
            <button onClick={() => setShowWordCountPicker(false)} className="btn btn-ghost" style={{ width: '100%', marginTop: '10px' }}>
              ← Back to options
            </button>
          </div>
          <KaspaSidePanel position="right" />
        </div>
      );
    }

    return (
      <div className="app wallet-setup-screen">
        <KaspaSidePanel position="left" />
        <div className="wallet-setup chess-theme">
          {/* Theme Toggle */}
          <button 
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          
          <div className="chess-header main">
            <span className="chess-piece large">♔</span>
            <div>
              <h1>Kasparov</h1>
              <p className="tagline">On-chain chess • Powered by Kaspa</p>
            </div>
            <span className="chess-piece large">♚</span>
          </div>
          
          <div className="chess-board-decoration" />
          
          {!importMode ? (
            <div className="wallet-options">
              <div className="section-label">
                <span>🔗</span> Connect External Wallet <span>🔗</span>
              </div>
              
              {availableWallets?.kasware && (
                <button onClick={handleConnectKasware} className="btn btn-primary btn-large">
                  <span className="btn-icon">🦊</span> Connect Kasware
                </button>
              )}
              
              {availableWallets?.kastle && (
                <button onClick={handleConnectKastle} className="btn btn-primary btn-large">
                  <span className="btn-icon">🦊</span> Connect Kastle
                </button>
              )}
              
              {(!availableWallets?.kasware && !availableWallets?.kastle) && (
                <div className="wallet-info-box">
                  <p>No external wallets detected. Install <a href="https://kasware.wallet" target="_blank" rel="noopener noreferrer">Kasware</a> or <a href="https://kastle.app" target="_blank" rel="noopener noreferrer">Kastle</a> to connect.</p>
                </div>
              )}
              
              <div className="divider">
                <span>or use internal wallet</span>
              </div>
              
              <div className="section-label">
                <span>♟</span> Get Started <span>♟</span>
              </div>
              <button onClick={() => setShowWordCountPicker(true)} className="btn btn-primary btn-large">
                <span className="btn-icon">♕</span> Create New Wallet
              </button>
              
              <div className="divider">
                <span>or import existing</span>
              </div>
              
              <button onClick={() => setImportMode('mnemonic')} className="btn btn-secondary btn-large">
                Import Seed Phrase
              </button>
              <button onClick={() => setImportMode('privateKey')} className="btn btn-secondary btn-large">
                Import Private Key
              </button>
              
              <div className="config-section">
                <button onClick={() => setImportMode('nodeConfig')} className="btn btn-ghost btn-small">
                  ⚙️ Configure Node
                </button>
                <p className="node-info">
                  {nodeEndpoint.replace('wss://', '').replace('ws://', '').slice(0, 30)}...
                </p>
              </div>
            </div>
          ) : importMode === 'mnemonic' ? (
            <div className="wallet-import-card">
              <div className="import-header">
                <div className="import-icon-wrap">
                  <span className="import-icon">📝</span>
                </div>
                <h3>Import Recovery Phrase</h3>
                <p>Enter your 12 or 24-word seed phrase to restore your wallet</p>
              </div>
              <div className="import-body">
                <label className="import-label">Recovery Phrase</label>
                <textarea
                  value={mnemonicInput}
                  onChange={(e) => setMnemonicInput(e.target.value)}
                  placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
                  className="import-textarea"
                  rows={4}
                  spellCheck={false}
                />
                <p className="import-hint">💡 Words should be separated by spaces</p>
              </div>
              <div className="import-actions">
                <button onClick={() => setImportMode(false)} className="btn-back-icon">
                  ←
                </button>
                <button onClick={handleImportWallet} className="btn-import-primary">
                  <span>🔐</span> Restore Wallet
                </button>
              </div>
            </div>
          ) : importMode === 'privateKey' ? (
            <div className="wallet-import-card">
              <div className="import-header">
                <div className="import-icon-wrap key">
                  <span className="import-icon">🔑</span>
                </div>
                <h3>Import Private Key</h3>
                <p>Enter your 64-character hexadecimal private key</p>
              </div>
              <div className="import-body">
                <label className="import-label">Private Key (Hex)</label>
                <input
                  type="password"
                  value={privateKeyInput}
                  onChange={(e) => setPrivateKeyInput(e.target.value)}
                  placeholder="a1b2c3d4e5f6...64 characters total"
                  className="import-input mono"
                  spellCheck={false}
                />
              </div>
              <div className="import-actions">
                <button onClick={() => setImportMode(false)} className="btn-back-icon">
                  ←
                </button>
                <button onClick={handleImportPrivateKey} className="btn-import-primary">
                  <span>🔐</span> Restore Wallet
                </button>
              </div>
            </div>
          ) : importMode === 'nodeConfig' ? (
            <div className="wallet-import-card">
              <div className="import-header">
                <div className="import-icon-wrap node">
                  <span className="import-icon">🔗</span>
                </div>
                <h3>Node Configuration</h3>
                <p>Connect to a Kaspa node for blockchain access</p>
              </div>
              <div className="import-body">
                <label className="import-label">WebSocket Endpoint</label>
                <input
                  type="text"
                  value={nodeEndpoint}
                  onChange={(e) => setNodeEndpoint(e.target.value)}
                  placeholder="wss://kaspa.aspectron.com/mainnet"
                  className="import-input mono"
                  spellCheck={false}
                />
                
                <div className="node-presets">
                  <label className="import-label">Quick Select</label>
                  <div className="preset-grid">
                    <button 
                      className={`preset-btn ${nodeEndpoint === 'wss://kaspa.aspectron.com/mainnet' ? 'active' : ''}`}
                      onClick={() => setNodeEndpoint('wss://kaspa.aspectron.com/mainnet')}
                    >
                      <span className="preset-icon">🌐</span>
                      <div className="preset-info">
                        <strong>Public Mainnet</strong>
                        <span>Recommended</span>
                      </div>
                    </button>
                    <button 
                      className={`preset-btn ${nodeEndpoint === 'ws://localhost:16110' ? 'active' : ''}`}
                      onClick={() => setNodeEndpoint('ws://localhost:16110')}
                    >
                      <span className="preset-icon">🐳</span>
                      <div className="preset-info">
                        <strong>Docker Node</strong>
                        <span>Port 16110</span>
                      </div>
                    </button>
                    <button 
                      className={`preset-btn ${nodeEndpoint === 'ws://127.0.0.1:16110' ? 'active' : ''}`}
                      onClick={() => setNodeEndpoint('ws://127.0.0.1:16110')}
                    >
                      <span className="preset-icon">🏠</span>
                      <div className="preset-info">
                        <strong>Local Mainnet</strong>
                        <span>127.0.0.1:16110</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
              <div className="import-actions">
                <button onClick={() => setImportMode(false)} className="btn-back-icon">
                  ←
                </button>
                <button 
                  onClick={() => {
                    setWrpcEndpoint(nodeEndpoint);
                    alert('Node endpoint saved!');
                    setImportMode(false);
                  }} 
                  className="btn-import-primary"
                >
                  <span>💾</span> Save Configuration
                </button>
              </div>
            </div>
          ) : (
            <div className="wallet-import">
              <h3>Import with Private Key</h3>
              <p>Enter your 64-character hex private key</p>
              <input
                type="password"
                value={privateKeyInput}
                onChange={(e) => setPrivateKeyInput(e.target.value)}
                placeholder="64-character hex private key"
                className="mnemonic-input"
                style={{ fontFamily: 'monospace', height: 'auto', padding: '12px' }}
              />
              <div className="wallet-import-buttons">
                <button onClick={handleImportPrivateKey} className="btn btn-primary">
                  Import Wallet
                </button>
                <button onClick={() => setImportMode(false)} className="btn btn-secondary">
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
        <KaspaSidePanel position="right" />
      </div>
    );
  }

  if (screen === "welcome") {
    return (
      <div className="app">
        <div className="welcome">
          <h1>Kasparov Chess</h1>
          <p>On-chain chess powered by Kaspa</p>
          
          {walletAddress && (
            <div className="wallet-info">
              <p className="wallet-label">Connected Wallet:</p>
              <code className="wallet-address">{walletAddress}</code>
              <button onClick={handleDisconnect} className="btn btn-small btn-secondary" style={{ marginTop: '8px' }}>
                Disconnect
              </button>
            </div>
          )}
          
          <div className="welcome-buttons">
            <button onClick={handleCreateGame} className="btn btn-primary">
              Create Game
            </button>
            <button
              onClick={() => {
                const gameId = prompt("Enter game ID:");
                if (gameId) handleJoinGame(gameId);
              }}
              className="btn btn-secondary"
            >
              Join Game
            </button>
          </div>
        </div>
        
        {txPopup?.show && (
          <TxPopup 
            type={txPopup.type} 
            txId={txPopup.txId} 
            error={txPopup.error}
            onClose={() => setTxPopup(null)} 
          />
        )}
      </div>
    );
  }

  if (screen === "lobby" && gameState) {
    return (
      <div className="app">
        <div className="lobby">
          <h2>Game Lobby</h2>
          
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <p style={{ margin: 0, opacity: 0.7 }}>Share this Game ID with your friend</p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <code style={{ fontSize: '1.5rem', padding: '8px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(73, 234, 203, 0.3)', color: '#49eacb' }}>
                {gameState.gameId}
              </code>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(gameState.gameId);
                  playSound('notify');
                }} 
                className="btn btn-secondary"
                title="Copy Game ID"
              >
                📋 Copy
              </button>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#888' }}>
              Your color: <strong style={{ color: gameState.myColor === 'w' ? '#fff' : '#aaa' }}>{gameState.myColor === "w" ? "White" : "Black"}</strong>
            </p>
          </div>

          <div className="waiting-pulse" style={{ marginBottom: '20px', color: '#49eacb', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <span className="pulse-dot"></span> Waiting for opponent to join...
          </div>
          
          <div className="board-preview-large">
            <Chessboard
              position={gameState.fen}
              boardOrientation={gameState.myColor === "b" ? "black" : "white"}
              customDarkSquareStyle={{ backgroundColor: theme.darkSquare }}
              customLightSquareStyle={{ backgroundColor: theme.lightSquare }}
              arePiecesDraggable={false}
              showBoardNotation={true}
              boardWidth={boardSize}
            />
          </div>
          
          {!gameState.blackPub ? (
            <p>Waiting for opponent to join...</p>
          ) : (
            <button onClick={handleStartGame} className="btn btn-primary">
              Start Game
            </button>
          )}
        </div>
        
        {txPopup?.show && (
          <TxPopup 
            type={txPopup.type} 
            txId={txPopup.txId} 
            error={txPopup.error}
            onClose={() => setTxPopup(null)} 
          />
        )}
      </div>
    );
  }

  if (screen === "playing" && gameState && game) {
    const orientation = manualOrientation !== 'auto' ? manualOrientation : (gameState.myColor === 'b' ? 'black' : 'white');
    
    return (
      <div className="app game-layout-wrapper">
        {/* Left Stats Panel */}
        <div className="game-panel left-panel">
           <KaspaSidePanel position="left" />
           
           <div className="player-info-card opponent">
              <div className="avatar-placeholder" style={{background: gameState.turn === (gameState.myColor === 'w' ? 'b' : 'w') ? '#49eacb' : '#333'}}></div>
              <div className="player-details">
                 <span className="player-label">Opponent</span>
                 <span className="player-name">{gameState.myColor === "w" ? "Black" : "White"}</span>
                 <span className="player-status">{gameState.turn === (gameState.myColor === 'w' ? 'b' : 'w') ? 'Thinking...' : 'Waiting'}</span>
              </div>
           </div>
        </div>

        {/* Center Board Area */}
        <div className="game-center-area">
          <div className="game-header-compact">
            <h3 style={{margin: 0, fontSize: '1.2rem'}}>Game: <span className="highlight-text">{gameState.gameId}</span></h3>
            <div className="turn-indicator" style={{
                background: gameState.turn === gameState.myColor ? 'rgba(73, 234, 203, 0.2)' : 'rgba(255,255,255,0.1)',
                color: gameState.turn === gameState.myColor ? '#49eacb' : '#aaa',
                border: gameState.turn === gameState.myColor ? '1px solid #49eacb' : '1px solid transparent'
            }}>
                {gameState.turn === gameState.myColor ? "🟢 YOUR TURN" : "⏳ OPPONENT'S TURN"}
            </div>
          </div>

          <div className="board-container-large" style={{ 
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: 1000,
            padding: '10px',
            border: '2px solid rgba(73, 234, 203, 0.3)',
            boxShadow: '0 0 30px rgba(0,0,0,0.5)',
            background: '#1a1a24'
          }}>
            <Chessboard
              id="PlayableBoard"
              key={orientation} 
              position={gameState.fen}
              boardOrientation={orientation}
              onPieceDrop={(source: string, target: string, piece: string) => handlePieceDrop(source as Square, target as Square, piece)}
              arePiecesDraggable={true}
              boardWidth={boardSize}
              customDarkSquareStyle={{ backgroundColor: '#2d3748' }}
              customLightSquareStyle={{ backgroundColor: '#49eacb', opacity: 0.8 }}
              customBoardStyle={{
                borderRadius: '4px',
                boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)'
              }}
            />
          </div>
          
          <div className="game-controls-bottom">
             <button onClick={() => setManualOrientation(prev => prev === 'white' ? 'black' : 'white')} className="btn btn-secondary icon-btn">
                 🔄 Flip Board
             </button>
             <button 
                  onClick={() => {
                    navigator.clipboard.writeText(gameState.gameId);
                    playSound('notify');
                  }} 
                  className="btn btn-secondary icon-btn"
              >
                  📋 Copy ID
              </button>
          </div>
        </div>

        {/* Right Info Panel */}
        <div className="game-panel right-panel">
            <KaspaSidePanel position="right" hideBlueScore={window.innerHeight < 800} />

            <div className="player-info-card self">
              <div className="avatar-placeholder" style={{background: gameState.turn === gameState.myColor ? '#49eacb' : '#333'}}></div>
              <div className="player-details">
                 <span className="player-label">You</span>
                 <span className="player-name">{gameState.myColor === "w" ? "White" : "Black"}</span>
                 <span className="player-status">{gameState.turn === gameState.myColor ? 'Your Turn' : 'Waiting'}</span>
              </div>
           </div>

           <div className="donate-card">
             <a
               href="https://kas.coffee/kasparov"
               target="_blank"
               rel="noopener noreferrer"
               className="donate-link"
             >
               <span role="img" aria-label="coffee">☕</span> Support Kasparov
             </a>
           </div>

           <div className="game-info-box">
            <h4>Move History</h4>
            <div className="moves-list-scroll">
              {gameState.moves.map((move, i) => (
                <div key={i} className={`move-row ${i === gameState.moves.length - 1 ? 'latest' : ''}`}>
                  <span className="move-num">{Math.floor(i / 2) + 1}.</span>
                  <span className="move-alg">{i % 2 === 0 ? "" : "..."} {move}</span>
                </div>
              ))}
              <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
            </div>
          </div>

          <ChatPanel 
            game={{ id: gameState.gameId, messages: chatMessages }}
            session={walletAddress ? { address: walletAddress } : null}
            onSendMessage={handleSendMessage}
          />
        </div>

        {gameState.status === "ended" && (
            <div className="game-over-modal">
              <h3>Game Over</h3>
              <p className="result-text">{game.isGameOver().result}</p>
              <button onClick={() => window.location.reload()} className="btn btn-primary">New Game</button>
            </div>
        )}

        {showPromotion && (
          <div className="promotion-modal">
            <div className="promotion-content">
              <h3>Choose Promotion</h3>
              <div className="promotion-pieces">
                <button onClick={() => handlePromotion("q")}>Queen</button>
                <button onClick={() => handlePromotion("r")}>Rook</button>
                <button onClick={() => handlePromotion("b")}>Bishop</button>
                <button onClick={() => handlePromotion("n")}>Knight</button>
              </div>
            </div>
          </div>
        )}

        {txPopup?.show && (
          <TxPopup 
            type={txPopup.type} 
            txId={txPopup.txId} 
            error={txPopup.error}
            onClose={() => setTxPopup(null)} 
          />
        )}
      </div>
    );
  }

  return null;
}
