import { VercelRequest, VercelResponse } from "@vercel/node";

export default (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({ ok: true, method: req.method });
};
