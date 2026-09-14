const express = require("express");
const dc = require("../discordApi");
const db = require("../db");
const { buildMessagePayload, BuilderError } = require("../components");
const { loginRequired, guildAdminRequired } = require("../middleware/auth");

const router = express.Router();

router.use("/api/guild/:guildId", loginRequired, guildAdminRequired);

/** Info básica del server (para la página de "grupos" y el builder, que en
 * el front estático ya no reciben esto server-side renderizado). */
router.get("/api/guild/:guildId", async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const info = req.session.admin_guilds[guildId];
    const grupos = db.listarGrupos(guildId).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      actualizado_en: r.actualizado_en,
      enviado: Object.keys(db.getMensajesEnviados(r.id)).length > 0,
    }));
    res.json({ guild_id: guildId, guild_name: info.name, grupos });
  } catch (e) {
    next(e);
  }
});

router.get("/api/guild/:guildId/canales", async (req, res, next) => {
  try {
    const canales = await dc.getGuildChannels(req.params.guildId);
    res.json(canales.map((c) => ({ id: c.id, name: c.name })));
  } catch (e) {
    next(e);
  }
});

router.get("/api/guild/:guildId/grupos", (req, res) => {
  const rows = db.listarGrupos(req.params.guildId);
  res.json(
    rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      actualizado_en: r.actualizado_en,
      enviado: Object.keys(db.getMensajesEnviados(r.id)).length > 0,
    }))
  );
});

router.post("/api/guild/:guildId/grupos", (req, res) => {
  const { guildId } = req.params;
  const body = req.body || {};
  const nombre = (body.nombre || "Sin título").trim().slice(0, 100);
  const payload = body.payload || { accent_color: null, blocks: [] };
  const id = db.crearGrupo(guildId, req.session.user.id, nombre, payload);
  res.json({ id });
});

router.get("/api/guild/:guildId/grupos/:grupoId", (req, res) => {
  const { guildId, grupoId } = req.params;
  const row = db.getGrupo(grupoId, guildId);
  if (!row) return res.status(404).json({ error: "No existe ese grupo." });
  res.json({
    id: row.id,
    nombre: row.nombre,
    payload: JSON.parse(row.payload),
    canales: row.canales ? row.canales.split(",") : [],
    mensajes_enviados: db.getMensajesEnviados(row.id),
  });
});

router.put("/api/guild/:guildId/grupos/:grupoId", (req, res) => {
  const { guildId, grupoId } = req.params;
  const row = db.getGrupo(grupoId, guildId);
  if (!row) return res.status(404).json({ error: "No existe ese grupo." });
  const body = req.body || {};
  const nombre = (body.nombre || row.nombre).trim().slice(0, 100);
  const payload = body.payload || JSON.parse(row.payload);
  db.actualizarGrupo(grupoId, guildId, nombre, payload);
  res.json({ ok: true });
});

router.delete("/api/guild/:guildId/grupos/:grupoId", (req, res) => {
  const { guildId, grupoId } = req.params;
  const row = db.getGrupo(grupoId, guildId);
  if (!row) return res.status(404).json({ error: "No existe ese grupo." });
  db.eliminarGrupo(grupoId, guildId);
  res.json({ ok: true });
});

router.get("/api/guild/:guildId/grupos/:grupoId/preview", (req, res) => {
  const { guildId, grupoId } = req.params;
  const row = db.getGrupo(grupoId, guildId);
  if (!row) return res.status(404).json({ error: "No existe ese grupo." });
  try {
    const payload = buildMessagePayload(JSON.parse(row.payload));
    res.json(payload);
  } catch (e) {
    if (e instanceof BuilderError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

router.post("/api/guild/:guildId/grupos/:grupoId/enviar", async (req, res, next) => {
  try {
    const { guildId, grupoId } = req.params;
    const row = db.getGrupo(grupoId, guildId);
    if (!row) return res.status(404).json({ error: "No existe ese grupo." });

    const body = req.body || {};
    const canalIds = (body.canal_ids || []).map(String);
    if (!canalIds.length) return res.status(400).json({ error: "Elegí al menos un canal." });

    const canalesValidos = new Set((await dc.getGuildChannels(guildId)).map((c) => c.id));
    for (const cid of canalIds) {
      if (!canalesValidos.has(cid)) {
        return res.status(400).json({ error: `El canal ${cid} no pertenece a este servidor.` });
      }
    }

    let payload;
    try {
      payload = buildMessagePayload(JSON.parse(row.payload));
    } catch (e) {
      if (e instanceof BuilderError) return res.status(400).json({ error: e.message });
      throw e;
    }

    db.setCanales(grupoId, guildId, canalIds.join(","));

    const enviadosPrevios = db.getMensajesEnviados(grupoId);
    const resultados = [];
    for (const cid of canalIds) {
      const messageIdPrevio = enviadosPrevios[cid];
      try {
        if (messageIdPrevio) {
          await dc.editMessage(cid, messageIdPrevio, payload);
          resultados.push({ channel_id: cid, ok: true, accion: "editado" });
        } else {
          const nuevo = await dc.sendMessage(cid, payload);
          db.registrarMensajeEnviado(grupoId, cid, nuevo.id);
          resultados.push({ channel_id: cid, ok: true, accion: "enviado" });
        }
      } catch (e) {
        if (e instanceof dc.DiscordAPIError) {
          resultados.push({ channel_id: cid, ok: false, error: e.message });
        } else {
          throw e;
        }
      }
    }
    res.json({ resultados });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
