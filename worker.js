const BACKEND_URL = "https://dashboard-table.onrender.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    const backendUrl = new URL(
      url.pathname + url.search,
      BACKEND_URL
    );

    const headers = new Headers(request.headers);

    // El backend debe ver el dominio real de Render.
    headers.delete("Host");

    const backendRequest = new Request(backendUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : request.body,
      redirect: "manual",
    });

    const response = await fetch(backendRequest);

    const responseHeaders = new Headers(response.headers);

    /*
     * El backend crea la cookie para onrender.com.
     * La reescribimos para que el navegador la guarde
     * para el dominio del Worker.
     */
    const setCookie = responseHeaders.get("Set-Cookie");

    if (setCookie) {
      responseHeaders.delete("Set-Cookie");

      responseHeaders.append(
        "Set-Cookie",
        setCookie
          .replace(/;\s*Domain=[^;]*/gi, "")
          .replace(/;\s*SameSite=[^;]*/gi, "")
          .replace(/;\s*Secure/gi, "")
          + "; Path=/; SameSite=Lax; Secure"
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};