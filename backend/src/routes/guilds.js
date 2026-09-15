const express = require("express");
const dc = require("../discordApi");
const db = require("../db");
const { buildMessagePayload, BuilderError } = require("../components");
const { loginRequired, guildAdminRequired } = require("../middleware/auth");

const router = express.Router();

router.use("/api/guild/:guildId", loginRequired, guildAdminRequired);

router.get("/api/guild/:guildId", async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const info = req.session.admin_guilds[guildId];
    const rows = await db.listarGrupos(guildId);
    const grupos = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        nombre: r.nombre,
        actualizado_en: r.actualizado_en,
        enviado: Object.keys(await db.getMensajesEnviados(r.id)).length > 0,
      }))
    );
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

router.get("/api/guild/:guildId/grupos", async (req, res, next) => {
  try {
    const rows = await db.listarGrupos(req.params.guildId);
    const grupos = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        nombre: r.nombre,
        actualizado_en: r.actualizado_en,
        enviado: Object.keys(await db.getMensajesEnviados(r.id)).length > 0,
      }))
    );
    res.json(grupos);
  } catch (e) {
    next(e);
  }
});

router.post("/api/guild/:guildId/grupos", async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const body = req.body || {};
    const nombre = (body.nombre || "Sin título").trim().slice(0, 100);
    const payload = body.payload || { accent_color: null, blocks: [] };
    const id = await db.crearGrupo(guildId, req.session.user.id, nombre, payload);
    res.json({ id });
  } catch (e) {
    next(e);
  }
});

router.get("/api/guild/:guildId/grupos/:grupoId", async (req, res, next) => {
  try {
    const { guildId, grupoId } = req.params;
    const row = await db.getGrupo(grupoId, guildId);
    if (!row) return res.status(404).json({ error: "No existe ese grupo." });
    res.json({
      id: row.id,
      nombre: row.nombre,
      payload: JSON.parse(row.payload),
      canales: row.canales ? row.canales.split(",") : [],
      mensajes_enviados: await db.getMensajesEnviados(row.id),
    });
  } catch (e) {
    next(e);
  }
});

router.put("/api/guild/:guildId/grupos/:grupoId", async (req, res, next) => {
  try {
    const { guildId, grupoId } = req.params;
    const row = await db.getGrupo(grupoId, guildId);
    if (!row) return res.status(404).json({ error: "No existe ese grupo." });
    const body = req.body || {};
    const nombre = (body.nombre || row.nombre).trim().slice(0, 100);
    const payload = body.payload || JSON.parse(row.payload);
    await db.actualizarGrupo(grupoId, guildId, nombre, payload);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete("/api/guild/:guildId/grupos/:grupoId", async (req, res, next) => {
  try {
    const { guildId, grupoId } = req.params;
    const row = await db.getGrupo(grupoId, guildId);
    if (!row) return res.status(404).json({ error: "No existe ese grupo." });
    await db.eliminarGrupo(grupoId, guildId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/api/guild/:guildId/grupos/:grupoId/preview", async (req, res, next) => {
  try {
    const { guildId, grupoId } = req.params;
    const row = await db.getGrupo(grupoId, guildId);
    if (!row) return res.status(404).json({ error: "No existe ese grupo." });
    const payload = buildMessagePayload(JSON.parse(row.payload));
    res.json(payload);
  } catch (e) {
    if (e instanceof BuilderError) return res.status(400).json({ error: e.message });
    next(e);
  }
});

router.post("/api/guild/:guildId/grupos/:grupoId/enviar", async (req, res, next) => {
  try {
    const { guildId, grupoId } = req.params;
    const row = await db.getGrupo(grupoId, guildId);
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

    await db.setCanales(grupoId, guildId, canalIds.join(","));

    const enviadosPrevios = await db.getMensajesEnviados(grupoId);
    const resultados = [];
    for (const cid of canalIds) {
      const messageIdPrevio = enviadosPrevios[cid];
      try {
        if (messageIdPrevio) {
          await dc.editMessage(cid, messageIdPrevio, payload);
          resultados.push({ channel_id: cid, ok: true, accion: "editado" });
        } else {
          const nuevo = await dc.sendMessage(cid, payload);
          await db.registrarMensajeEnviado(grupoId, cid, nuevo.id);
          resultados.push({ channel_id: cid, ok: true, accion: "enviado" });
        }
      } catch (e) {
        if (e instanceof dc.DiscordAPIError) {
          const mensajeBorrado = e.statusCode === 404 && /"code"\s*:\s*10008/.test(e.body || "");
          if (mensajeBorrado) {
            try {
              const nuevo = await dc.sendMessage(cid, payload);
              await db.registrarMensajeEnviado(grupoId, cid, nuevo.id);
              resultados.push({ channel_id: cid, ok: true, accion: "reenviado (el mensaje anterior ya no existía)" });
              continue;
            } catch (e2) {
              resultados.push({ channel_id: cid, ok: false, error: e2.message });
              continue;
            }
          }
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
