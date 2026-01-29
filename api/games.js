module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json");
  
  try {
    res.status(200).json({ message: "API is working", method: req.method, url: req.url });
  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
