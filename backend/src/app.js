const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");
const { ALLOWED_ORIGINS, SESSION_SECRET, isProd } = require("./config");
const { DiscordAPIError } = require("./discordApi");

const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const guildRoutes = require("./routes/guilds");

const app = express();

app.set("trust proxy", 1); // Railway está detrás de proxy (necesario para cookies "secure")

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl/healthchecks sin Origin
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("Origen no permitido por CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(
  cookieSession({
    name: "ranaris_session",
    secret: SESSION_SECRET,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    httpOnly: true,
  })
);

app.use(healthRoutes);
app.use(authRoutes);
app.use(guildRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "No encontrado." });
});

// Manejo de errores centralizado (equivalente a @app.errorhandler de Flask)
app.use((err, req, res, next) => {
  if (err instanceof DiscordAPIError) {
    let msg = "No se pudo hablar con Discord. Revisá el token del bot y probá de nuevo.";
    if (err.statusCode === 401) msg = "El token del bot es inválido o expiró (DISCORD_BOT_TOKEN).";
    else if (err.statusCode === 403) msg = "Discord rechazó el pedido por permisos (403).";
    else if (err.statusCode === 429) msg = "Discord está limitando los pedidos por ahora (rate limit), esperá un momento.";
    return res.status(502).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

module.exports = app;
