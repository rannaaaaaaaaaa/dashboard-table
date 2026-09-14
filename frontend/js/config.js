// Config centralizada del frontend. Única fuente de la URL del backend:
// no se repite en ningún otro archivo. Editá PROD_API_URL después de
// desplegar el backend en Railway.

(function () {
  const PROD_API_URL = "https://dashboard-table.onrender.com";

  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);

  window.APP_CONFIG = {
    API_BASE_URL: isLocal ? "http://localhost:8080" : PROD_API_URL,
  };
})();
