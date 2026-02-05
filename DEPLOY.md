# Deploying Kasparov

To deploy the Kasparov chess app with multiplayer support, you need a persistent data store for the game state. This app is configured to use **Upstash Redis** when deployed to Vercel (or any other environment).

## 1. Setup Vercel Project

1. Push your code to a Git repository.
2. Import the project into Vercel.
3. Select `apps/web` as the root directory if asked.

## 2. Configure Storage (Redis)

Because Vercel Serverless Functions are stateless, you need an external database. We use Upstash Redis.

1. Go to the [Upstash Console](https://console.upstash.com/) and create a new Redis database.
2. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In your Vercel Project Settings > **Environment Variables**, add:
   - `UPSTASH_REDIS_REST_URL`: (your url)
   - `UPSTASH_REDIS_REST_TOKEN`: (your token)

Alternatively, you can use Vercel KV directly from the Vercel dashboard "Storage" tab, which automatically sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the app supports these too).

## 3. Deployment

Once the environment variables are set, redeploy your application. The API routes in `apps/web/api/` will now use Redis to store games, allowing you to:
- Create games that persist
- Share game links with other players
- Play across different devices/browsers

## 4. Funding Wallets

To create transactions on the Kaspa DAG (for game events like moves, joins, etc.), your wallet needs Kaspa coins (KAS). The app uses minimal fees (~0.00001 KAS per transaction).

Visit [Kaspa Hub](https://kaspahub.org/) to find:
- **Wallets**: Download a Kaspa wallet to receive funds (e.g., Kaspium, KaspaCom Wallet, Kaspian)
- **Exchanges**: Buy KAS from centralized or decentralized exchanges (e.g., NOWPayments, CoinPal, CryptocurrencyCheckout for payments; or exchanges like BitMart, LBank, Exmo)
- **Faucets**: Get testnet KAS for development (check Kaspa Hub for available faucets)

For mainnet deployment, ensure your wallet has sufficient KAS to cover transaction fees.
## Does it work without Redis?
Yes, but only for **local development** (`npm run dev`) where the game state is held in the memory of the `server/index.ts` process. On Vercel, without Redis, games will disappear instantly between requests (refreshing will lose the game).
