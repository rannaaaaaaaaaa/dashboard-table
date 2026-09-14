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
 * thumbnail_url, footer_text} */
function buildMessagePayload(payload) {
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

  return {
    flags: IS_COMPONENTS_V2,
    components: [container],
  };
}

module.exports = { BuilderError, buildMessagePayload };
