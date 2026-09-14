const BACKEND_URL = "https://dashboard-table.onrender.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Archivos del frontend: los sirve Cloudflare normalmente.
    // Las rutas de backend se envían a Render.
    const backendPaths = [
      "/auth/",
      "/api/",
    ];

    const isBackendRequest = backendPaths.some((path) =>
      url.pathname.startsWith(path)
    );

    if (!isBackendRequest) {
      return env.ASSETS.fetch(request);
    }

    const backendUrl = new URL(
      url.pathname + url.search,
      BACKEND_URL
    );

    const headers = new Headers(request.headers);
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