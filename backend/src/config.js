require("dotenv").config();
const path = require("path");

const isProd = process.env.NODE_ENV === "production";

const FRONTEND_URLS = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
];

const ALLOWED_ORIGINS = isProd
  ? FRONTEND_URLS
  : [...new Set([...FRONTEND_URLS, ...DEFAULT_DEV_ORIGINS])];

const LOCAL_DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "..", "data", "dashboard.sqlite3");

module.exports = {
  isProd,
  PORT: parseInt(process.env.PORT || "8080", 10),
  HOST: "0.0.0.0",

  FRONTEND_HOME_URL: process.env.FRONTEND_HOME_URL || FRONTEND_URLS[0] || "http://localhost:5173",

  ALLOWED_ORIGINS,

  SESSION_SECRET: process.env.SESSION_SECRET || "dev-secret-cambiame-en-produccion",

  DISCORD: {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    REDIRECT_URI: process.env.DISCORD_REDIRECT_URI,
    BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  },

  DB_URL: process.env.TURSO_DATABASE_URL || `file:${LOCAL_DB_PATH}`,
  DB_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
};
