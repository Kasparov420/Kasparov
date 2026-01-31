# Kasparov Chess - Feature Demonstration

## 🎮 Interactive Features

### 1. Welcome Screen
- Shows generated Kaspa address (K-style wallet)
- "K-style: cheap, rapid transactions" hint
- Two options: Create Game or Join Game

### 2. Lobby Screen (Before Game Starts)
**Visual Effects:**
- Board theme changes every 800ms (random colors)
  - Blue theme → Green theme → Brown theme → Purple theme → Olive theme → Coral theme
- Shows game ID for sharing
- Shows assigned color (White or Black)
- Waiting message until opponent joins

**Example Game ID:** `abc123xyz`

### 3. Playing Screen (Game Active)

#### Board Features
**Legal Move Suggestions:**
```
Click white pawn on e2
  → Green circles appear on e3 and e4
  → Shows all legal moves for that piece
```

**Board Orientation:**
```
White player sees:
  8 [r][n][b][q][k][b][n][r]
  7 [p][p][p][p][p][p][p][p]
  ...
  1 [R][N][B][Q][K][B][N][R]

Black player sees (flipped):
  1 [R][N][B][Q][K][B][N][R]
  ...
  7 [p][p][p][p][p][p][p][p]
  8 [r][n][b][q][k][b][n][r]
```

**Highlighting:**
- Selected piece: Yellow background
- Legal moves: Green circles
- Last move: Yellow tint on from/to squares

**Move Execution:**
```
1. Click piece (e.g., white pawn on e2)
   → Square e2 turns yellow
   → Green circles on e3, e4

2. Click destination (e.g., e4)
   → Piece moves instantly (optimistic UI)
   → Console: "Move published to DAG: mock-tx-1234567890"
   → Move appears in move list: "1. e2e4"

3. Opponent's turn indicator updates
   → "Turn: Black (You)" or "Turn: Black"
```

### 4. Move List
Displays all moves in chronological order:
```
1. e2e4
1.. e7e5
2. g1f3
2.. b8c6
3. f1c4
```

### 5. Theme System

**In Lobby (Random):**
- Every 800ms, board changes to random theme
- Gives dynamic, "waiting" feel
- Stops when game becomes active

**During Game (Locked):**
- Theme deterministically chosen from game seed
- Both players see same theme
- Consistent throughout game

**Available Themes:**
1. **Blue:** Light squares #DEE3E6, Dark squares #8CA2AD
2. **Green:** Light squares #FFFFDD, Dark squares #86A666
3. **Brown:** Light squares #F0D9B5, Dark squares #B58863 (chess.com style)
4. **Purple:** Light squares #E8E9F0, Dark squares #9F90B0
5. **Olive:** Light squares #E8E9B0, Dark squares #A8A65A
6. **Coral:** Light squares #FFE4E1, Dark squares #CD8C95

### 6. Promotion Dialog
When pawn reaches last rank:
```
[     Choose Promotion     ]
[  Queen  ] [  Rook   ]
[ Bishop  ] [ Knight  ]
```
Click choice → move completes → publishes to DAG

### 7. Game Over Screen
```
┌─────────────────────┐
│     Game Over       │
│                     │
│      1-0            │
│  (White wins by     │
│   checkmate)        │
└─────────────────────┘
```

## 🔍 Console Output Example

```javascript
// On load
"Wallet initialized: kaspa:qz7g3k2m9..."

// Create game
"Game published to DAG: mock-tx-1706789012345"

// Make move
"Move published to DAG: mock-tx-1706789023456"
"Move made: { from: 'e2', to: 'e4', piece: 'p', color: 'w' }"

// Opponent joins
"Join published to DAG: mock-tx-1706789034567"

// Game over
"Game over: 1-0"
```

## 🎯 User Flow Examples

### Scenario A: Create and Play
1. Alice opens app → sees address `kaspa:qzABC...`
2. Clicks "Create Game"
3. Board cycles through random themes while waiting
4. Gets game ID: `7k9m2p`
5. Shares ID with Bob
6. Bob enters game ID and joins
7. Both see "Start Game" button
8. Game starts → theme locks → Alice is White
9. Alice clicks e2 pawn → sees e3, e4 highlighted
10. Alice clicks e4 → move made, published to DAG
11. Bob sees Alice's move instantly (via indexer poll)
12. Game continues...

### Scenario B: Join Existing Game
1. Bob receives game ID `7k9m2p` from Alice
2. Opens app → clicks "Join Game"
3. Enters game ID
4. Fetches game from indexer
5. Sees he's Black player
6. Board oriented with black pieces at bottom
7. Waits for Alice to start
8. Game begins...

## 🔄 Real-Time Sync (Mock)

Currently uses **local mock indexer** + **optimistic updates**:

```
Player A makes move
  ↓
Local UI updates instantly
  ↓
"Publishes" to mock DAG
  ↓
Mock indexer stores event
  ↓
Player B polls indexer (every 2s)
  ↓
Player B's UI updates
```

**In production:** Replace with WebSocket for instant sync.

## 📱 Responsive Design

- Mobile-friendly board
- Touch-friendly piece selection
- Scales to screen size
- Dark theme reduces eye strain

## 🎨 Color Scheme

**Main colors:**
- Background: `#1a1a2e` (dark navy)
- Secondary: `#16213e` (darker navy)
- Text: `#eee` (light gray)
- Accent: `#667eea` → `#764ba2` (purple gradient)
- Danger: `#e94560` (coral red)

## 🚀 Performance

- Instant move validation (chess.js is fast)
- Optimistic UI updates (no waiting for chain confirmation)
- Smooth theme transitions (CSS animations)
- Lightweight bundle (minimal dependencies)

## ✨ Polish Details

1. **Hover effects** on buttons (scale + glow)
2. **Smooth transitions** on all state changes
3. **Clear visual feedback** for every action
4. **No illegal moves** possible (blocked by chess.js)
5. **Proper chess notation** in move list
6. **Game ID copyable** (click to select)
7. **Clear turn indicator** (whose turn it is)
8. **Status messages** for waiting/active/ended

## 🎓 Educational Value

This implementation demonstrates:
- Modern React patterns (hooks, state management)
- TypeScript best practices
- Clean architecture (separation of concerns)
- Chess engine integration
- Blockchain protocol design (minimal, efficient)
- Client-side cryptography (wallet management)
- Real-time polling (indexer sync)
- Optimistic UI patterns

Perfect for learning both chess programming and blockchain integration!
