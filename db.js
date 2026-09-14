// Acceso a datos (SQLite). Port directo de db.py del panel original.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { DB_PATH } = require("./config");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const conn = new Database(DB_PATH);
conn.pragma("foreign_keys = ON");
conn.pragma("journal_mode = WAL");

function initDb() {
  conn.exec(`
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
  conn.exec(`
    CREATE TABLE IF NOT EXISTS mensajes_enviados (
      grupo_id INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      PRIMARY KEY (grupo_id, channel_id),
      FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE CASCADE
    )
  `);
}
initDb();

function listarGrupos(guildId) {
  return conn
    .prepare("SELECT * FROM grupos WHERE guild_id=? ORDER BY actualizado_en DESC")
    .all(guildId);
}

function getGrupo(grupoId, guildId) {
  return conn
    .prepare("SELECT * FROM grupos WHERE id=? AND guild_id=?")
    .get(grupoId, guildId);
}

function crearGrupo(guildId, creadoPor, nombre, payload) {
  const now = Date.now() / 1000;
  const info = conn
    .prepare(
      `INSERT INTO grupos (guild_id, nombre, creado_por, payload, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, nombre, creadoPor, JSON.stringify(payload), now, now);
  return info.lastInsertRowid;
}

function actualizarGrupo(grupoId, guildId, nombre, payload) {
  conn
    .prepare(
      "UPDATE grupos SET nombre=?, payload=?, actualizado_en=? WHERE id=? AND guild_id=?"
    )
    .run(nombre, JSON.stringify(payload), Date.now() / 1000, grupoId, guildId);
}

function setCanales(grupoId, guildId, canalesCsv) {
  conn
    .prepare("UPDATE grupos SET canales=?, actualizado_en=? WHERE id=? AND guild_id=?")
    .run(canalesCsv, Date.now() / 1000, grupoId, guildId);
}

function eliminarGrupo(grupoId, guildId) {
  conn.prepare("DELETE FROM mensajes_enviados WHERE grupo_id=?").run(grupoId);
  conn.prepare("DELETE FROM grupos WHERE id=? AND guild_id=?").run(grupoId, guildId);
}

function getMensajesEnviados(grupoId) {
  const rows = conn
    .prepare("SELECT channel_id, message_id FROM mensajes_enviados WHERE grupo_id=?")
    .all(grupoId);
  const out = {};
  for (const r of rows) out[r.channel_id] = r.message_id;
  return out;
}

function registrarMensajeEnviado(grupoId, channelId, messageId) {
  conn
    .prepare(
      `INSERT INTO mensajes_enviados (grupo_id, channel_id, message_id) VALUES (?, ?, ?)
       ON CONFLICT(grupo_id, channel_id) DO UPDATE SET message_id=excluded.message_id`
    )
    .run(grupoId, channelId, messageId);
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
