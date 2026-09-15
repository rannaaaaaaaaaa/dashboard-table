const { createClient } = require("@libsql/client");
const { DB_URL, DB_AUTH_TOKEN } = require("./config");

const client = createClient({
  url: DB_URL,
  authToken: DB_AUTH_TOKEN,
  intMode: "number",
});

async function initDb() {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      nombre TEXT NOT NULL DEFAULT 'Sin título',
      creado_por TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{"accent_color": null, "blocks": []}',
      canales TEXT,
      creado_en REAL NOT NULL,
      actualizado_en REAL NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS mensajes_enviados (
      grupo_id INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      PRIMARY KEY (grupo_id, channel_id),
      FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE CASCADE
    )
  `);
}

const ready = initDb();

async function listarGrupos(guildId) {
  await ready;
  const { rows } = await client.execute({
    sql: "SELECT * FROM grupos WHERE guild_id=? ORDER BY actualizado_en DESC",
    args: [guildId],
  });
  return rows;
}

async function getGrupo(grupoId, guildId) {
  await ready;
  const { rows } = await client.execute({
    sql: "SELECT * FROM grupos WHERE id=? AND guild_id=?",
    args: [grupoId, guildId],
  });
  return rows[0];
}

async function crearGrupo(guildId, creadoPor, nombre, payload) {
  await ready;
  const now = Date.now() / 1000;
  const result = await client.execute({
    sql: `INSERT INTO grupos (guild_id, nombre, creado_por, payload, creado_en, actualizado_en)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [guildId, nombre, creadoPor, JSON.stringify(payload), now, now],
  });
  return Number(result.lastInsertRowid);
}

async function actualizarGrupo(grupoId, guildId, nombre, payload) {
  await ready;
  await client.execute({
    sql: "UPDATE grupos SET nombre=?, payload=?, actualizado_en=? WHERE id=? AND guild_id=?",
    args: [nombre, JSON.stringify(payload), Date.now() / 1000, grupoId, guildId],
  });
}

async function setCanales(grupoId, guildId, canalesCsv) {
  await ready;
  await client.execute({
    sql: "UPDATE grupos SET canales=?, actualizado_en=? WHERE id=? AND guild_id=?",
    args: [canalesCsv, Date.now() / 1000, grupoId, guildId],
  });
}

async function eliminarGrupo(grupoId, guildId) {
  await ready;
  await client.execute({ sql: "DELETE FROM mensajes_enviados WHERE grupo_id=?", args: [grupoId] });
  await client.execute({ sql: "DELETE FROM grupos WHERE id=? AND guild_id=?", args: [grupoId, guildId] });
}

async function getMensajesEnviados(grupoId) {
  await ready;
  const { rows } = await client.execute({
    sql: "SELECT channel_id, message_id FROM mensajes_enviados WHERE grupo_id=?",
    args: [grupoId],
  });
  const out = {};
  for (const r of rows) out[r.channel_id] = r.message_id;
  return out;
}

async function registrarMensajeEnviado(grupoId, channelId, messageId) {
  await ready;
  await client.execute({
    sql: `INSERT INTO mensajes_enviados (grupo_id, channel_id, message_id) VALUES (?, ?, ?)
          ON CONFLICT(grupo_id, channel_id) DO UPDATE SET message_id=excluded.message_id`,
    args: [grupoId, channelId, messageId],
  });
}

module.exports = {
  listarGrupos,
  getGrupo,
  crearGrupo,
  actualizarGrupo,
  setCanales,
  eliminarGrupo,
  getMensajesEnviados,
  registrarMensajeEnviado,
};
