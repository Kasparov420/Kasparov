import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.status(200).json({ message: "API is working", method: req.method, url: req.url });
  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ error: "Internal server error", msg: String(error) });
  }
}
