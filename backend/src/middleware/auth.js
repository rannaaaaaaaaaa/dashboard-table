const { botCanSeeGuild } = require("../discordApi");

function loginRequired(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "No iniciaste sesión." });
  }
  next();
}

/** Verifica que el usuario logueado sea admin del server Y que el bot esté
 * en ese server, antes de dejarlo entrar a cualquier ruta con :guildId.
 * Se revisa en cada request (no se confía en cache vieja). */
function guildAdminRequired(req, res, next) {
  const { guildId } = req.params;
  const adminGuilds = (req.session && req.session.admin_guilds) || {};
  if (!adminGuilds[guildId]) {
    return res.status(403).json({ error: "No tenés permiso de Administrador en ese servidor." });
  }
  botCanSeeGuild(guildId)
    .then((presente) => {
      if (!presente) {
        return res.status(403).json({ error: "El bot no está en ese servidor." });
      }
      next();
    })
    .catch(next);
}

module.exports = { loginRequired, guildAdminRequired };
