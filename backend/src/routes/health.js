const express = require("express");
const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.get("/api/ping", (req, res) => {
  res.json({ status: "ok", pong: true, ts: Date.now() });
});

module.exports = router;
