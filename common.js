// Lógica común a todas las páginas: pinta el topbar (usuario / login /
// logout) usando /api/session del backend.

async function initHeader({ requireAuth = true } = {}) {
  const API_BASE = window.APP_CONFIG.API_BASE_URL;
  const res = await fetch(`${API_BASE}/api/session`, { credentials: "include" });
  const data = await res.json();

  const userChip = document.getElementById("userChip");
  if (data.user && userChip) {
    userChip.innerHTML = `
      <span>${escapeHtml(data.user.username)}</span>
      <a class="btn btn-ghost" id="btnLogout" href="#">Salir</a>
    `;
    document.getElementById("btnLogout").addEventListener("click", async (e) => {
      e.preventDefault();
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
      location.href = "index.html";
    });
  }

  if (requireAuth && !data.user) {
    location.href = "index.html";
    return null;
  }
  return data;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}
