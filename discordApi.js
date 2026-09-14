// Todas las llamadas a la API de Discord del backend, en un solo lugar.
// Port directo de discord_client.py.
//
// Hay dos "identidades" distintas que usa esta app:
// - El USUARIO que inicia sesión (OAuth2, permite saber quién es y en qué
//   servidores tiene permiso de Administrador).
// - El BOT (DISCORD_BOT_TOKEN, solo en el backend), usado para listar en
//   qué servidores está metido, listar canales y mandar/editar mensajes.
//   El token del bot NUNCA se manda al frontend.

const { DISCORD } = require("./config");

const API_BASE = "https://discord.com/api/v10";
const ADMINISTRATOR_BIT = 0x8;

class DiscordAPIError extends Error {
  constructor(statusCode, body) {
    super(`Discord API ${statusCode}: ${body}`);
    this.statusCode = statusCode;
    this.body = body;
  }
}

// cache muy simple en memoria para no golpear la API de Discord en cada click
// (los servidores/canales del bot no cambian todo el tiempo)
const _cache = new Map();
const CACHE_TTL_MS = 60_000;

function cacheGet(key) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v;
  return null;
}
function cacheSet(key, v) {
  _cache.set(key, { t: Date.now(), v });
}

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new DiscordAPIError(0, `No se pudo conectar con Discord: ${e.message}`);
  }
  if (res.status >= 400) {
    const text = await res.text().catch(() => "");
    throw new DiscordAPIError(res.status, text);
  }
  return res;
}

function getOauthUrl(state) {
  const params = new URLSearchParams({
    client_id: DISCORD.CLIENT_ID,
    redirect_uri: DISCORD.REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
    state,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: DISCORD.CLIENT_ID,
    client_secret: DISCORD.CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: DISCORD.REDIRECT_URI,
  });
  const res = await request(`${API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.json();
}

async function getUser(accessToken) {
  const res = await request(`${API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

/** Servidores del usuario donde tiene permiso de Administrador (o es dueño). */
async function getUserAdminGuilds(accessToken) {
  const res = await request(`${API_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const guilds = await res.json();
  return guilds.filter((g) => {
    const perms = parseInt(g.permissions || "0", 10);
    return g.owner || (perms & ADMINISTRATOR_BIT) !== 0;
  });
}

/** IDs de todos los servidores en los que está metido el bot. */
async function getBotGuildIds() {
  const cached = cacheGet("bot_guilds");
  if (cached) return cached;

  const ids = new Set();
  let url = `${API_BASE}/users/@me/guilds?limit=200`;
  const headers = { Authorization: `Bot ${DISCORD.BOT_TOKEN}` };
  while (url) {
    const res = await request(url, { headers });
    const page = await res.json();
    if (!page.length) break;
    page.forEach((g) => ids.add(String(g.id)));
    if (page.length < 200) break;
    url = `${API_BASE}/users/@me/guilds?limit=200&after=${page[page.length - 1].id}`;
  }
  cacheSet("bot_guilds", ids);
  return ids;
}

/** Canales de texto/anuncios de un server, usando el token del bot. */
async function getGuildChannels(guildId) {
  const cacheKey = `channels:${guildId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const res = await request(`${API_BASE}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${DISCORD.BOT_TOKEN}` },
  });
  const all = await res.json();
  const canales = all
    .filter((c) => c.type === 0 || c.type === 5) // texto y anuncios
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  cacheSet(cacheKey, canales);
  return canales;
}

async function botCanSeeGuild(guildId) {
  const ids = await getBotGuildIds();
  return ids.has(String(guildId));
}

async function sendMessage(channelId, payload) {
  const res = await request(`${API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${DISCORD.BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function editMessage(channelId, messageId, payload) {
  const res = await request(`${API_BASE}/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${DISCORD.BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

module.exports = {
  DiscordAPIError,
  getOauthUrl,
  exchangeCode,
  getUser,
  getUserAdminGuilds,
  getBotGuildIds,
  getGuildChannels,
  botCanSeeGuild,
  sendMessage,
  editMessage,
};
