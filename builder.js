(function () {
    "use strict";

    const API_BASE = window.APP_CONFIG.API_BASE_URL;
    const GUILD_ID = window.GUILD_ID;
    const GRUPO_INICIAL = window.GRUPO_INICIAL;

    const canvas = document.getElementById("canvas");
    const panelPropiedades = document.getElementById("panelPropiedades");
    const inputNombre = document.getElementById("nombreGrupo");
    const inputColor = document.getElementById("colorAccent");
    const btnGuardar = document.getElementById("btnGuardar");
    const btnEnviar = document.getElementById("btnEnviar");
    const modalEnviar = document.getElementById("modalEnviar");
    const listaCanales = document.getElementById("listaCanales");
    const resultadosEnvio = document.getElementById("resultadosEnvio");
    const btnCerrarModal = document.getElementById("btnCerrarModal");
    const btnConfirmarEnvio = document.getElementById("btnConfirmarEnvio");

    const state = {
        grupoId: null,
        nombre: "",
        accent_color: 0x5865f2,
        blocks: [],
        selectedId: null,
        header: { title: "", description: "", thumbnail_url: "", footer_text: "", image_position: "medio" },
    };

    if (GRUPO_INICIAL) {
        const p = GRUPO_INICIAL.payload || {};
        state.grupoId = GRUPO_INICIAL.id;
        state.nombre = GRUPO_INICIAL.nombre || "";
        state.accent_color = p.accent_color ?? 0x5865f2;
        state.blocks = p.blocks || [];
        state.header = {
            title: p.title || "",
            description: p.description || "",
            thumbnail_url: p.thumbnail_url || "",
            footer_text: p.footer_text || "",
            image_position: p.image_position || "medio",
        };
    }

    inputNombre.value = state.nombre;
    inputColor.value = "#" + (state.accent_color || 0).toString(16).padStart(6, "0");

    function applyAccentColor() {
        canvas.style.setProperty("--accent-color", inputColor.value);
    }
    applyAccentColor();

    function uid() {
        return "b" + Math.random().toString(36).slice(2, 10);
    }

    function defaultBlock(tipo) {
        const id = uid();
        switch (tipo) {
            case "text":
                return { id, type: "text", content: "Escribí acá tu texto..." };
            case "image":
                return { id, type: "image", images: [""] };
            case "separator":
                return { id, type: "separator", divider: true, spacing: "small" };
            case "buttons":
                return {
                    id, type: "buttons",
                    buttons: [{ id: uid(), label: "Botón", style: "primary", custom_id: "", url: "", emoji: "", disabled: false }],
                };
            case "menu":
                return {
                    id, type: "menu", custom_id: "", placeholder: "Elegí una opción",
                    min_values: 1, max_values: 1,
                    options: [{ label: "Opción 1", value: "opcion_1", description: "", emoji: "" }],
                };
            default:
                throw new Error("Tipo desconocido: " + tipo);
        }
    }

    function findBlock(id) {
        return state.blocks.find((b) => b.id === id);
    }

    function selectBlock(id) {
        state.selectedId = id;
        render();
    }

    function updateBlock(id, patch) {
        const b = findBlock(id);
        if (!b) return;
        Object.assign(b, patch);
        // Solo repintamos la vista previa, no el panel de propiedades:
        // si reconstruyéramos el panel en cada tecla, el campo perdería el
        // foco y habría que hacer clic de nuevo para seguir escribiendo.
        renderCanvas();
    }

    function deleteBlock(id) {
        state.blocks = state.blocks.filter((b) => b.id !== id);
        if (state.selectedId === id) state.selectedId = null;
        render();
    }

    function moveBlock(id, dir) {
        const idx = state.blocks.findIndex((b) => b.id === id);
        const nuevo = idx + dir;
        if (nuevo < 0 || nuevo >= state.blocks.length) return;
        const [b] = state.blocks.splice(idx, 1);
        state.blocks.splice(nuevo, 0, b);
        render();
    }

    // ------------------------------------------------------------------
    // render: canvas (preview) + panel de propiedades
    // ------------------------------------------------------------------

    function escapeHtml(s) {
        const div = document.createElement("div");
        div.textContent = s ?? "";
        return div.innerHTML;
    }

    function renderBlockInner(block) {
        switch (block.type) {
            case "text":
                return `<div class="bloque-texto">${escapeHtml(block.content)}</div>`;
            case "image": {
                const urls = (block.images || []).filter(Boolean);
                if (urls.length === 0) return `<div class="muted" style="font-size:13px">(sin imagen todavía)</div>`;
                if (urls.length === 1) {
                    return `<div class="bloque-imagen"><img src="${escapeHtml(urls[0])}" onerror="this.style.opacity=0.25"></div>`;
                }
                return `<div class="bloque-imagen-galeria">${urls
                    .map((u) => `<img src="${escapeHtml(u)}" onerror="this.style.opacity=0.25">`)
                    .join("")}</div>`;
            }
            case "separator":
                return `<div class="bloque-separador ${block.spacing === "large" ? "large" : ""}"><hr></div>`;
            case "buttons":
                return (block.buttons || [])
                    .map((btn) => {
                        const label = btn.emoji ? `${btn.emoji} ${btn.label || ""}` : (btn.label || "(sin texto)");
                        return `<span class="discord-btn style-${btn.style}">${escapeHtml(label)}</span>`;
                    })
                    .join("");
            case "menu": {
                const primera = (block.options || [])[0];
                const texto = block.placeholder || (primera ? primera.label : "Elegí una opción");
                return `<div class="discord-select">${escapeHtml(texto)}  ▾</div>`;
            }
            default:
                return "";
        }
    }

    function render() {
        renderCanvas();
        renderPropiedades();
    }

    function renderHeaderBlock() {
        const h = state.header;
        const tieneContenido = h.title || h.description || h.thumbnail_url || h.footer_text;
        let inner;
        if (!tieneContenido) {
            inner = `<div class="muted" style="font-size:13px">+ Agregar título, descripción, imagen o pie de página (opcional)</div>`;
        } else {
            const textoHtml = `<div class="header-preview-text">
                    ${h.title ? `<div class="header-preview-title">${escapeHtml(h.title)}</div>` : ""}
                    ${h.description ? `<div class="header-preview-desc">${escapeHtml(h.description)}</div>` : ""}
                </div>`;
            const bannerImg = (cls) => `<img class="header-preview-banner ${cls}" src="${escapeHtml(h.thumbnail_url)}" onerror="this.style.opacity=0.25">`;

            let cuerpo;
            if (!h.thumbnail_url) {
                cuerpo = textoHtml;
            } else if (h.image_position === "arriba") {
                cuerpo = `${bannerImg("top")}${textoHtml}`;
            } else if (h.image_position === "abajo") {
                cuerpo = `${textoHtml}${bannerImg("bottom")}`;
            } else {
                // "medio": imagen chica al lado del texto (como la miniatura clásica)
                cuerpo = `<div class="header-preview-row">
                    ${textoHtml}
                    <img class="header-preview-thumb" src="${escapeHtml(h.thumbnail_url)}" onerror="this.style.opacity=0.25">
                </div>`;
            }
            inner = `${cuerpo}${h.footer_text ? `<div class="header-preview-footer">${escapeHtml(h.footer_text)}</div>` : ""}`;
        }
        return `<div class="bloque bloque-header ${state.selectedId === "__header__" ? "selected" : ""}" data-id="__header__">
            <div class="bloque-header-label">🏷️ Encabezado (título / descripción / imagen / footer)</div>
            ${inner}
        </div>`;
    }

    function renderCanvas() {
        if (state.blocks.length === 0) {
            canvas.innerHTML = renderHeaderBlock() + `<div class="canvas-empty">Arrastrá bloques acá desde el panel de la izquierda (o tocalos para agregarlos)</div>`;
            return;
        }
        canvas.innerHTML = renderHeaderBlock() + state.blocks
            .map(
                (block) => `
            <div class="bloque ${state.selectedId === block.id ? "selected" : ""}" draggable="true" data-id="${block.id}">
                <div class="bloque-controles">
                    <button type="button" data-accion="subir" title="Subir">▲</button>
                    <button type="button" data-accion="bajar" title="Bajar">▼</button>
                    <button type="button" data-accion="borrar" title="Borrar">🗑</button>
                </div>
                ${renderBlockInner(block)}
            </div>`
            )
            .join("");
    }

    function campoTexto(label, valor, onInput, tipo = "text") {
        const id = "campo_" + Math.random().toString(36).slice(2, 8);
        return { id, html: `
            <div class="campo">
                <label for="${id}">${label}</label>
                <input type="${tipo}" id="${id}" value="${escapeHtml(valor ?? "")}">
            </div>` , onInput };
    }

    function renderPropiedades() {
        if (state.selectedId === "__header__") {
            renderPropiedadesHeader();
            return;
        }

        const block = findBlock(state.selectedId);
        if (!block) {
            panelPropiedades.innerHTML = `<h3>Propiedades</h3><div class="propiedades-vacio">Seleccioná un bloque para editarlo.</div>`;
            return;
        }

        let html = `<h3>Propiedades</h3>`;

        if (block.type === "text") {
            html += `
                <div class="campo">
                    <label>Texto (admite **negrita**, *cursiva*, saltos de línea, etc.)</label>
                    <textarea id="p_content">${escapeHtml(block.content)}</textarea>
                </div>`;
        } else if (block.type === "image") {
            html += `<div class="campo"><label>URLs de imagen (una por línea, hasta 10)</label>
                <textarea id="p_images" placeholder="https://...">${escapeHtml((block.images || []).join("\n"))}</textarea></div>`;
        } else if (block.type === "separator") {
            html += `
                <div class="campo">
                    <label>Tamaño del espacio</label>
                    <select id="p_spacing">
                        <option value="small" ${block.spacing !== "large" ? "selected" : ""}>Chico</option>
                        <option value="large" ${block.spacing === "large" ? "selected" : ""}>Grande</option>
                    </select>
                </div>
                <div class="campo campo-check">
                    <input type="checkbox" id="p_divider" ${block.divider ? "checked" : ""}>
                    <label for="p_divider" style="margin:0">Mostrar línea divisoria</label>
                </div>`;
        } else if (block.type === "buttons") {
            html += (block.buttons || [])
                .map(
                    (btn, i) => `
                <div class="sub-lista-item" data-idx="${i}">
                    <button type="button" class="quitar" data-accion="quitar-boton" data-idx="${i}">✕</button>
                    <div class="campo"><label>Texto</label><input type="text" data-campo="label" data-idx="${i}" value="${escapeHtml(btn.label)}"></div>
                    <div class="campo"><label>Emoji (opcional)</label><input type="text" data-campo="emoji" data-idx="${i}" value="${escapeHtml(btn.emoji)}"></div>
                    <div class="campo"><label>Estilo</label>
                        <select data-campo="style" data-idx="${i}">
                            ${["primary", "secondary", "success", "danger", "link"]
                                .map((s) => `<option value="${s}" ${btn.style === s ? "selected" : ""}>${s}</option>`)
                                .join("")}
                        </select>
                    </div>
                    ${
                        btn.style === "link"
                            ? `<div class="campo"><label>URL</label><input type="url" data-campo="url" data-idx="${i}" value="${escapeHtml(btn.url)}" placeholder="https://..."></div>`
                            : `<div class="campo"><label>ID interno (para que el bot reconozca el click)</label><input type="text" data-campo="custom_id" data-idx="${i}" value="${escapeHtml(btn.custom_id)}" placeholder="ej: rol_novato"></div>`
                    }
                </div>`
                )
                .join("");
            if ((block.buttons || []).length < 5) {
                html += `<button type="button" class="btn-agregar-sub" data-accion="agregar-boton">+ Agregar botón</button>`;
            } else {
                html += `<p class="muted" style="font-size:12px">Máximo 5 botones por bloque.</p>`;
            }
        } else if (block.type === "menu") {
            html += `
                <div class="campo"><label>Texto cuando no hay nada elegido</label>
                    <input type="text" id="p_placeholder" value="${escapeHtml(block.placeholder)}"></div>
                <div class="campo"><label>ID interno (para que el bot reconozca la elección)</label>
                    <input type="text" id="p_custom_id" value="${escapeHtml(block.custom_id)}" placeholder="ej: menu_roles"></div>`;
            html += (block.options || [])
                .map(
                    (op, i) => `
                <div class="sub-lista-item" data-idx="${i}">
                    <button type="button" class="quitar" data-accion="quitar-opcion" data-idx="${i}">✕</button>
                    <div class="campo"><label>Nombre</label><input type="text" data-campo="label" data-idx="${i}" value="${escapeHtml(op.label)}"></div>
                    <div class="campo"><label>Descripción (opcional)</label><input type="text" data-campo="description" data-idx="${i}" value="${escapeHtml(op.description)}"></div>
                    <div class="campo"><label>Emoji (opcional)</label><input type="text" data-campo="emoji" data-idx="${i}" value="${escapeHtml(op.emoji)}"></div>
                </div>`
                )
                .join("");
            if ((block.options || []).length < 25) {
                html += `<button type="button" class="btn-agregar-sub" data-accion="agregar-opcion">+ Agregar opción</button>`;
            }
        }

        panelPropiedades.innerHTML = html;
        bindPropiedadesEventos(block);
    }

    function renderPropiedadesHeader() {
        const h = state.header;
        panelPropiedades.innerHTML = `
            <h3>Propiedades</h3>
            <p class="muted" style="font-size:12px;margin-top:-8px">Encabezado del mensaje (equivalente al título/descripción/miniatura/footer de un embed clásico). Todos los campos son opcionales.</p>
            <div class="campo"><label>Título</label><input type="text" id="p_h_title" maxlength="256" value="${escapeHtml(h.title)}"></div>
            <div class="campo"><label>Descripción</label><textarea id="p_h_description" maxlength="4000">${escapeHtml(h.description)}</textarea></div>
            <div class="campo"><label>Imagen del encabezado (URL)</label><input type="url" id="p_h_thumb" placeholder="https://..." value="${escapeHtml(h.thumbnail_url)}"></div>
            <div class="campo">
                <label>Posición de la imagen</label>
                <select id="p_h_position">
                    <option value="arriba" ${h.image_position === "arriba" ? "selected" : ""}>Arriba (banner, ancho completo)</option>
                    <option value="medio" ${h.image_position !== "arriba" && h.image_position !== "abajo" ? "selected" : ""}>En el medio (chica, al lado del texto)</option>
                    <option value="abajo" ${h.image_position === "abajo" ? "selected" : ""}>Abajo (imagen grande, ancho completo)</option>
                </select>
            </div>
            <div class="campo"><label>Pie de página (footer)</label><input type="text" id="p_h_footer" maxlength="150" value="${escapeHtml(h.footer_text)}"></div>
        `;
        const bind = (selector, campo, evento = "input") => {
            const el = panelPropiedades.querySelector(selector);
            if (el) el.addEventListener(evento, () => {
                state.header[campo] = el.value;
                renderCanvas();
            });
        };
        bind("#p_h_title", "title");
        bind("#p_h_description", "description");
        bind("#p_h_thumb", "thumbnail_url");
        bind("#p_h_position", "image_position", "change");
        bind("#p_h_footer", "footer_text");
    }

    function bindPropiedadesEventos(block) {
        const p = panelPropiedades;

        const simple = (selector, campo, transform = (v) => v) => {
            const el = p.querySelector(selector);
            if (el) el.addEventListener("input", () => updateBlock(block.id, { [campo]: transform(el.value) }));
        };

        if (block.type === "text") {
            simple("#p_content", "content");
        } else if (block.type === "image") {
            simple("#p_images", "images", (v) => v.split("\n").map((s) => s.trim()).filter(Boolean));
        } else if (block.type === "separator") {
            const spacing = p.querySelector("#p_spacing");
            if (spacing) spacing.addEventListener("change", () => updateBlock(block.id, { spacing: spacing.value }));
            const divider = p.querySelector("#p_divider");
            if (divider) divider.addEventListener("change", () => updateBlock(block.id, { divider: divider.checked }));
        } else if (block.type === "buttons") {
            p.querySelectorAll("[data-campo]").forEach((el) => {
                el.addEventListener("input", () => {
                    const idx = Number(el.dataset.idx);
                    const campo = el.dataset.campo;
                    block.buttons[idx][campo] = el.value;
                    // Cambiar el "estilo" puede mostrar/ocultar el campo de
                    // URL vs. ID interno, así que ahí sí hace falta redibujar
                    // el panel entero. Para el resto, solo la vista previa.
                    if (campo === "style") render();
                    else renderCanvas();
                });
            });
            const btnAgregar = p.querySelector('[data-accion="agregar-boton"]');
            if (btnAgregar) btnAgregar.addEventListener("click", () => {
                block.buttons.push({ id: uid(), label: "Botón", style: "secondary", custom_id: "", url: "", emoji: "", disabled: false });
                render();
            });
            p.querySelectorAll('[data-accion="quitar-boton"]').forEach((el) => {
                el.addEventListener("click", () => {
                    block.buttons.splice(Number(el.dataset.idx), 1);
                    render();
                });
            });
        } else if (block.type === "menu") {
            simple("#p_placeholder", "placeholder");
            simple("#p_custom_id", "custom_id");
            p.querySelectorAll("[data-campo]").forEach((el) => {
                el.addEventListener("input", () => {
                    const idx = Number(el.dataset.idx);
                    const campo = el.dataset.campo;
                    block.options[idx][campo] = el.value;
                    renderCanvas();
                });
            });
            const btnAgregar = p.querySelector('[data-accion="agregar-opcion"]');
            if (btnAgregar) btnAgregar.addEventListener("click", () => {
                block.options.push({ label: "Nueva opción", value: "", description: "", emoji: "" });
                render();
            });
            p.querySelectorAll('[data-accion="quitar-opcion"]').forEach((el) => {
                el.addEventListener("click", () => {
                    block.options.splice(Number(el.dataset.idx), 1);
                    render();
                });
            });
        }
    }

    // ------------------------------------------------------------------
    // eventos de canvas: click (seleccionar/controles) y drag & drop
    // ------------------------------------------------------------------

    canvas.addEventListener("click", (e) => {
        const controlBtn = e.target.closest("[data-accion]");
        const bloqueEl = e.target.closest(".bloque");
        if (!bloqueEl) return;
        const id = bloqueEl.dataset.id;

        if (controlBtn) {
            const accion = controlBtn.dataset.accion;
            if (accion === "subir") moveBlock(id, -1);
            else if (accion === "bajar") moveBlock(id, 1);
            else if (accion === "borrar") deleteBlock(id);
            e.stopPropagation();
            return;
        }
        selectBlock(id);
    });

    let dropIndicator = null;
    function mostrarIndicador(index) {
        quitarIndicador();
        dropIndicator = document.createElement("div");
        dropIndicator.className = "drop-indicator";
        const hijos = [...canvas.querySelectorAll(".bloque")].filter((el) => el.dataset.id !== "__header__");
        if (index >= hijos.length) {
            canvas.appendChild(dropIndicator);
        } else {
            canvas.insertBefore(dropIndicator, hijos[index]);
        }
    }
    function quitarIndicador() {
        if (dropIndicator && dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);
        dropIndicator = null;
    }

    function getInsertIndex(clientY, excludeId) {
        const hijos = [...canvas.querySelectorAll(".bloque")].filter(
            (el) => el.dataset.id !== excludeId && el.dataset.id !== "__header__"
        );
        for (let i = 0; i < hijos.length; i++) {
            const rect = hijos[i].getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) return i;
        }
        return hijos.length;
    }

    canvas.addEventListener("dragover", (e) => {
        e.preventDefault();
        canvas.classList.add("drag-over");
        const excludeId = e.dataTransfer.getData("text/x-block-id") || null;
        mostrarIndicador(getInsertIndex(e.clientY, excludeId));
    });

    canvas.addEventListener("dragleave", (e) => {
        if (e.target === canvas) {
            canvas.classList.remove("drag-over");
            quitarIndicador();
        }
    });

    canvas.addEventListener("drop", (e) => {
        e.preventDefault();
        canvas.classList.remove("drag-over");
        const nuevoTipo = e.dataTransfer.getData("text/x-block-type");
        const idExistente = e.dataTransfer.getData("text/x-block-id");
        const index = getInsertIndex(e.clientY, idExistente || null);
        quitarIndicador();

        if (idExistente) {
            const idx = state.blocks.findIndex((b) => b.id === idExistente);
            if (idx === -1) return;
            const [b] = state.blocks.splice(idx, 1);
            state.blocks.splice(index, 0, b);
            render();
        } else if (nuevoTipo) {
            const nuevoBloque = defaultBlock(nuevoTipo);
            state.blocks.splice(index, 0, nuevoBloque);
            state.selectedId = nuevoBloque.id;
            render();
        }
    });

    canvas.addEventListener("dragstart", (e) => {
        const bloqueEl = e.target.closest(".bloque");
        if (!bloqueEl) return;
        e.dataTransfer.setData("text/x-block-id", bloqueEl.dataset.id);
        e.dataTransfer.effectAllowed = "move";
    });

    document.querySelectorAll(".paleta-item").forEach((el) => {
        el.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/x-block-type", el.dataset.tipo);
            e.dataTransfer.effectAllowed = "copy";
        });
        // En celular no hay drag & drop nativo, así que tocar un bloque
        // de la paleta también lo agrega directamente (al final).
        el.addEventListener("click", () => {
            const nuevoBloque = defaultBlock(el.dataset.tipo);
            state.blocks.push(nuevoBloque);
            state.selectedId = nuevoBloque.id;
            render();
        });
    });

    // ------------------------------------------------------------------
    // nombre / color
    // ------------------------------------------------------------------

    inputNombre.addEventListener("input", () => (state.nombre = inputNombre.value));
    inputColor.addEventListener("input", () => {
        state.accent_color = parseInt(inputColor.value.slice(1), 16);
        applyAccentColor();
    });

    // ------------------------------------------------------------------
    // guardar / enviar
    // ------------------------------------------------------------------

    function payload() {
        return {
            accent_color: state.accent_color,
            blocks: state.blocks,
            title: state.header.title,
            description: state.header.description,
            thumbnail_url: state.header.thumbnail_url,
            image_position: state.header.image_position,
            footer_text: state.header.footer_text,
        };
    }

    function encabezadoVacio() {
        const h = state.header;
        return !h.title && !h.description && !h.thumbnail_url && !h.footer_text;
    }

    async function guardar() {
        const body = { nombre: state.nombre || "Sin título", payload: payload() };
        const url = state.grupoId
            ? `${API_BASE}/api/guild/${GUILD_ID}/grupos/${state.grupoId}`
            : `${API_BASE}/api/guild/${GUILD_ID}/grupos`;
        const method = state.grupoId ? "PUT" : "POST";
        const res = await fetch(url, {
            method,
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "No se pudo guardar.");
        }
        const data = await res.json();
        if (!state.grupoId && data.id) {
            state.grupoId = data.id;
            history.replaceState(null, "", `builder.html?guild=${GUILD_ID}&grupo=${data.id}`);
        }
    }

    function toast(msg, tipo = "ok") {
        const el = document.createElement("div");
        el.className = `toast ${tipo}`;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    btnGuardar.addEventListener("click", async () => {
        btnGuardar.disabled = true;
        try {
            await guardar();
            toast("Guardado ✅");
        } catch (e) {
            toast(e.message, "error");
        } finally {
            btnGuardar.disabled = false;
        }
    });

    let canalesCache = null;
    let canalesSeleccionados = new Set();

    btnEnviar.addEventListener("click", async () => {
        if (state.blocks.length === 0 && encabezadoVacio()) {
            toast("Agregá al menos un bloque, título o descripción antes de enviar.", "error");
            return;
        }
        try {
            await guardar();
        } catch (e) {
            toast(e.message, "error");
            return;
        }
        resultadosEnvio.innerHTML = "";
        modalEnviar.style.display = "flex";
        if (!canalesCache) {
            listaCanales.innerHTML = `<p class="muted">Cargando canales...</p>`;
            const res = await fetch(`${API_BASE}/api/guild/${GUILD_ID}/canales`, { credentials: "include" });
            canalesCache = await res.json();
        }
        // preseleccionar canales ya guardados en el grupo, si los hay
        if (canalesSeleccionados.size === 0 && GRUPO_INICIAL && GRUPO_INICIAL.canales) {
            GRUPO_INICIAL.canales.forEach((c) => canalesSeleccionados.add(c));
        }
        listaCanales.innerHTML = canalesCache
            .map(
                (c) => `
            <label class="canal-check">
                <input type="checkbox" value="${c.id}" ${canalesSeleccionados.has(c.id) ? "checked" : ""}>
                # ${escapeHtml(c.name)}
            </label>`
            )
            .join("");
        listaCanales.querySelectorAll("input[type=checkbox]").forEach((cb) => {
            cb.addEventListener("change", () => {
                if (cb.checked) canalesSeleccionados.add(cb.value);
                else canalesSeleccionados.delete(cb.value);
            });
        });
    });

    btnCerrarModal.addEventListener("click", () => (modalEnviar.style.display = "none"));

    btnConfirmarEnvio.addEventListener("click", async () => {
        const ids = [...canalesSeleccionados];
        if (ids.length === 0) {
            toast("Elegí al menos un canal.", "error");
            return;
        }
        btnConfirmarEnvio.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/api/guild/${GUILD_ID}/grupos/${state.grupoId}/enviar`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ canal_ids: ids }),
            });
            const data = await res.json();
            if (!res.ok) {
                resultadosEnvio.innerHTML = `<div class="resultado-envio error">${escapeHtml(data.error || "Error al enviar.")}</div>`;
                return;
            }
            resultadosEnvio.innerHTML = data.resultados
                .map((r) => {
                    const canal = (canalesCache || []).find((c) => c.id === r.channel_id);
                    const nombre = canal ? canal.name : r.channel_id;
                    return r.ok
                        ? `<div class="resultado-envio ok">✅ #${escapeHtml(nombre)} — ${r.accion}</div>`
                        : `<div class="resultado-envio error">❌ #${escapeHtml(nombre)} — ${escapeHtml(r.error)}</div>`;
                })
                .join("");
            toast("Listo ✅");
        } catch (e) {
            resultadosEnvio.innerHTML = `<div class="resultado-envio error">Error de red al enviar.</div>`;
        } finally {
            btnConfirmarEnvio.disabled = false;
        }
    });

    render();
})();
