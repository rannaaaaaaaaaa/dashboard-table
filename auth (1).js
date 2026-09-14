const express = require("express");
const crypto = require("crypto");
const dc = require("../discordApi");
const { FRONTEND_HOME_URL } = require("../config");
const { loginRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/auth/login", (req, res) => {
  const state = crypto.randomBytes(18).toString("base64url");
  req.session.oauth_state = state;
  res.redirect(dc.getOauthUrl(state));
});

router.get("/auth/callback", async (req, res, next) => {
  try {
    if (req.query.state !== req.session.oauth_state) {
      return res.status(400).send("Estado inválido, intentá loguearte de nuevo.");
    }
    const code = req.query.code;
    if (!code) return res.redirect("/auth/login");

    const tokenData = await dc.exchangeCode(code);
    const accessToken = tokenData.access_token;
    const user = await dc.getUser(accessToken);
    const adminGuilds = await dc.getUserAdminGuilds(accessToken);

    req.session.user = {
      id: user.id,
      username: user.global_name || user.username,
      avatar: user.avatar,
    };
    req.session.admin_guilds = Object.fromEntries(
      adminGuilds.map((g) => [g.id, { name: g.name, icon: g.icon }])
    );
    req.session.oauth_state = null;

    res.redirect(FRONTEND_HOME_URL);
  } catch (e) {
    next(e);
  }
});

router.post("/auth/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

/** Reemplaza a las páginas home()/login.html server-side: el frontend
 * (estático, en Cloudflare Pages) llama esto al cargar para saber si hay
 * sesión activa y con qué servidores puede trabajar. */
router.get("/api/session", async (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      return res.json({ user: null, servidores: [] });
    }
    const botGuildIds = await dc.getBotGuildIds();
    const adminGuilds = req.session.admin_guilds || {};
    const servidores = Object.entries(adminGuilds)
      .map(([gid, info]) => ({ id: gid, ...info, bot_presente: botGuildIds.has(gid) }))
      .sort((a, b) => {
        if (a.bot_presente !== b.bot_presente) return a.bot_presente ? -1 : 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    res.json({ user: req.session.user, servidores });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
