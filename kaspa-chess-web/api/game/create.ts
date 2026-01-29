import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createGame } from "../../server/gameStore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const game = createGame(body?.whiteName ?? "White");
  res.status(200).json({ game });
}
