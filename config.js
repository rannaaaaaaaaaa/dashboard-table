// Configuración centralizada del backend. Todo lo que cambia entre
// local/producción sale de variables de entorno, nunca hardcodeado.

require("dotenv").config();

const isProd = process.env.NODE_ENV === "production";

// Orígenes permitidos para CORS: el frontend en Cloudflare Pages +
// localhost para desarrollo. Se puede pasar más de uno separado por comas
// en FRONTEND_URL (ej: "https://mi-panel.pages.dev,https://mi-dominio.com").
const FRONTEND_URLS = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8788", // wrangler pages dev
  "http://127.0.0.1:8788",
];

const ALLOWED_ORIGINS = isProd
  ? FRONTEND_URLS
  : [...new Set([...FRONTEND_URLS, ...DEFAULT_DEV_ORIGINS])];

module.exports = {
  isProd,
  PORT: parseInt(process.env.PORT || "8080", 10),
  HOST: "0.0.0.0",

  // A dónde redirigir al navegador después del login/logout con Discord.
  // Debe ser la URL pública del frontend (Cloudflare Pages).
  FRONTEND_HOME_URL: process.env.FRONTEND_HOME_URL || FRONTEND_URLS[0] || "http://localhost:5173",

  ALLOWED_ORIGINS,

  SESSION_SECRET: process.env.SESSION_SECRET || "dev-secret-cambiame-en-produccion",

  DISCORD: {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    // URL pública del backend + /auth/callback. Debe coincidir EXACTO con
    // lo configurado en el portal de desarrolladores de Discord.
    REDIRECT_URI: process.env.DISCORD_REDIRECT_URI,
    BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  },

  DB_PATH: process.env.DB_PATH || require("path").join(__dirname, "..", "data", "dashboard.sqlite3"),
};
