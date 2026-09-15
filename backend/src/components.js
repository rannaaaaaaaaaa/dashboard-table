// Traduce los "bloques" del builder visual (JSON simple, pensado para el
// drag & drop del front) al formato real de Components V2 de Discord.
// Port directo de components.py.
//
// Referencia de tipos usados:
//   17 = Container      10 = Text Display     14 = Separator
//   12 = Media Gallery    1 = Action Row        2 = Button
//    3 = String Select
//
// Flag de mensaje IS_COMPONENTS_V2 = 1 << 15 (32768). Un mensaje con ese
// flag no puede tener "content" ni "embeds" clásicos: todo el texto va en
// bloques Text Display.

const IS_COMPONENTS_V2 = 1 << 15;

// Límites duros que impone Discord para mensajes con Components V2.
const MAX_COMPONENTES_MENSAJE = 40;
const MAX_CARACTERES_MENSAJE = 4000;

const BUTTON_STYLES = {
  primary: 1,
  secondary: 2,
  success: 3,
  danger: 4,
  link: 5,
};

const MAX_BUTTONS_POR_FILA = 5;
const MAX_OPCIONES_MENU = 25;

class BuilderError extends Error {}

function validarNoVacio(valor, campo) {
  if (!valor || !String(valor).trim()) {
    throw new BuilderError(`Falta completar: ${campo}`);
  }
}

function botonToComponent(btn) {
  const style = BUTTON_STYLES[btn.style || "secondary"] ?? 2;
  const comp = { type: 2, style };
  const label = (btn.label || "").trim();
  const emoji = (btn.emoji || "").trim();
  if (!label && !emoji) {
    throw new BuilderError("Un botón necesita al menos texto o un emoji.");
  }
  if (label) comp.label = label.slice(0, 80);
  if (emoji) comp.emoji = { name: emoji };
  if (style === 5) {
    validarNoVacio(btn.url, "URL del botón de enlace");
    comp.url = btn.url.trim();
  } else {
    const customId = (btn.custom_id || "").trim() || `btn_${btn.id || ""}`;
    comp.custom_id = customId.slice(0, 100);
  }
  if (btn.disabled) comp.disabled = true;
  return comp;
}

function menuToComponent(block) {
  const opciones = block.options || [];
  if (!opciones.length) throw new BuilderError("El menú necesita al menos una opción.");
  if (opciones.length > MAX_OPCIONES_MENU) {
    throw new BuilderError(`Un menú no puede tener más de ${MAX_OPCIONES_MENU} opciones.`);
  }
  const optsOut = opciones.map((o) => {
    validarNoVacio(o.label, "el nombre de cada opción del menú");
    const opt = {
      label: o.label.trim().slice(0, 100),
      value: (o.value || o.label).trim().slice(0, 100),
    };
    if (o.description) opt.description = o.description.trim().slice(0, 100);
    if (o.emoji) opt.emoji = { name: o.emoji.trim() };
    if (o.default) opt.default = true;
    return opt;
  });
  const menu = {
    type: 3,
    custom_id: (block.custom_id || `menu_${block.id || ""}`).slice(0, 100),
    options: optsOut,
  };
  if (block.placeholder) menu.placeholder = block.placeholder.trim().slice(0, 150);
  if (block.min_values !== undefined && block.min_values !== null) {
    menu.min_values = parseInt(block.min_values, 10);
  }
  if (block.max_values !== undefined && block.max_values !== null) {
    menu.max_values = parseInt(block.max_values, 10);
  }
  return menu;
}

function separatorToComponent(block) {
  return {
    type: 14,
    divider: block.divider !== undefined ? Boolean(block.divider) : true,
    spacing: block.spacing === "large" ? 2 : 1,
  };
}

function imageToComponent(block) {
  let urls = block.images || (block.url ? [block.url] : []);
  urls = urls.filter((u) => u && u.trim()).map((u) => u.trim());
  if (!urls.length) throw new BuilderError("El bloque de imagen necesita al menos una URL.");
  if (urls.length > 10) throw new BuilderError("Un bloque de imágenes no puede tener más de 10.");
  return { type: 12, items: urls.map((u) => ({ media: { url: u } })) };
}

/** Traduce título / descripción / imagen (equivalentes al embed clásico) a
 * componentes. La imagen se puede ubicar en 3 posiciones:
 *  - "arriba": banner de ancho completo (Media Gallery) antes del texto.
 *  - "medio" (default): miniatura chica al costado del texto (Section +
 *    accessory Thumbnail), igual que el comportamiento original.
 *  - "abajo": imagen grande de ancho completo después del texto. */
function headerComponents(payload) {
  const title = (payload.title || "").trim();
  const description = (payload.description || "").trim();
  const imageUrl = (payload.thumbnail_url || "").trim();
  const position = ["arriba", "medio", "abajo"].includes(payload.image_position)
    ? payload.image_position
    : "medio";

  const textos = [];
  if (title) textos.push({ type: 10, content: `### ${title.slice(0, 256)}` });
  if (description) textos.push({ type: 10, content: description.slice(0, 4000) });

  if (!textos.length && !imageUrl) return [];

  if (!imageUrl) return textos;

  const banner = { type: 12, items: [{ media: { url: imageUrl } }] };

  if (position === "arriba") return textos.length ? [banner, ...textos] : [banner];
  if (position === "abajo") return textos.length ? [...textos, banner] : [banner];

  // "medio": imagen chica al costado del texto
  if (!textos.length) return [banner];
  return [
    {
      type: 9,
      components: textos,
      accessory: { type: 11, media: { url: imageUrl } },
    },
  ];
}

/** Footer emulado con una separación chica + texto pequeño (el prefijo
 * "-# " de Discord lo muestra como "subtexto" gris, igual que un footer). */
function footerComponents(payload) {
  const footerText = (payload.footer_text || "").trim();
  if (!footerText) return [];
  return [
    { type: 14, divider: true, spacing: 1 },
    { type: 10, content: `-# ${footerText.slice(0, 150)}` },
  ];
}

/** Devuelve una lista porque un bloque de botones/menú se traduce a un
 * Action Row completo (puede contener varios elementos). */
function blockToComponents(block) {
  const tipo = block.type;
  if (tipo === "text") {
    validarNoVacio(block.content, "el texto de un bloque de texto");
    return [{ type: 10, content: block.content.slice(0, 4000) }];
  }
  if (tipo === "separator") return [separatorToComponent(block)];
  if (tipo === "image") return [imageToComponent(block)];
  if (tipo === "buttons") {
    const botones = block.buttons || [];
    if (!botones.length) throw new BuilderError("Un bloque de botones necesita al menos un botón.");
    if (botones.length > MAX_BUTTONS_POR_FILA) {
      throw new BuilderError(`Máximo ${MAX_BUTTONS_POR_FILA} botones por fila.`);
    }
    return [{ type: 1, components: botones.map(botonToComponent) }];
  }
  if (tipo === "menu") {
    return [{ type: 1, components: [menuToComponent(block)] }];
  }
  throw new BuilderError(`Tipo de bloque desconocido: ${tipo}`);
}

/** payload = {accent_color: number|null, blocks: [...], title, description,
 * thumbnail_url, footer_text} -> UN Container (type 17) listo para meter
 * en el array "components" de un mensaje. No valida límites globales del
 * mensaje: eso lo hacen buildMessagePayload / buildCombinedPayload, que
 * son quienes saben cuántos containers va a haber en total. */
function payloadToContainer(payload) {
  const blocks = payload.blocks || [];
  const header = headerComponents(payload);
  const footer = footerComponents(payload);

  if (!blocks.length && !header.length && !footer.length) {
    throw new BuilderError("Agregá al menos un bloque, título o descripción antes de guardar.");
  }

  const inner = [...header];
  for (const block of blocks) inner.push(...blockToComponents(block));
  inner.push(...footer);

  const container = { type: 17, components: inner };
  const accent = payload.accent_color;
  if (accent !== undefined && accent !== null) {
    container.accent_color = parseInt(accent, 10);
  }
  return container;
}

/** Cuenta un componente y todo lo que cuelga de él (components anidados +
 * accessory), tal como Discord los cuenta para el límite de 40 por mensaje.
 * Los "items" de un Media Gallery NO cuentan como componentes aparte. */
function contarComponentes(nodo) {
  let total = 1;
  if (Array.isArray(nodo.components)) {
    for (const hijo of nodo.components) total += contarComponentes(hijo);
  }
  if (nodo.accessory) total += contarComponentes(nodo.accessory);
  return total;
}

/** Suma los caracteres de todos los Text Display (type 10) anidados en un
 * componente, para chequear el límite global de 4000 caracteres. */
function contarCaracteresTexto(nodo) {
  let total = nodo.type === 10 ? (nodo.content || "").length : 0;
  if (Array.isArray(nodo.components)) {
    for (const hijo of nodo.components) total += contarCaracteresTexto(hijo);
  }
  if (nodo.accessory) total += contarCaracteresTexto(nodo.accessory);
  return total;
}

/** payload -> mensaje completo de UN solo embed (comportamiento original). */
function buildMessagePayload(payload) {
  const container = payloadToContainer(payload);
  return {
    flags: IS_COMPONENTS_V2,
    components: [container],
  };
}

/** payloads (array de payloads de distintos grupos) -> UN mensaje con
 * varios containers, uno por cada embed, respetando los límites duros de
 * Discord para Components V2 (40 componentes / 4000 caracteres totales). */
function buildCombinedPayload(payloads) {
  if (!payloads || !payloads.length) {
    throw new BuilderError("Elegí al menos un embed para combinar.");
  }

  const containers = payloads.map((p) => payloadToContainer(p));

  const totalComponentes = containers.reduce((acc, c) => acc + contarComponentes(c), 0);
  if (totalComponentes > MAX_COMPONENTES_MENSAJE) {
    throw new BuilderError(
      `Esta combinación usa ${totalComponentes} componentes y Discord permite ` +
      `${MAX_COMPONENTES_MENSAJE} por mensaje. Sacá algún embed o simplificalo (menos ` +
      `botones, imágenes o bloques de texto) e intentá de nuevo.`
    );
  }

  const totalCaracteres = containers.reduce((acc, c) => acc + contarCaracteresTexto(c), 0);
  if (totalCaracteres > MAX_CARACTERES_MENSAJE) {
    throw new BuilderError(
      `El texto combinado tiene ${totalCaracteres} caracteres y Discord permite ` +
      `${MAX_CARACTERES_MENSAJE} por mensaje. Achicá algún texto e intentá de nuevo.`
    );
  }

  return {
    flags: IS_COMPONENTS_V2,
    components: containers,
  };
}

module.exports = {
  BuilderError,
  buildMessagePayload,
  buildCombinedPayload,
  MAX_COMPONENTES_MENSAJE,
  MAX_CARACTERES_MENSAJE,
};
