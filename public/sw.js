if (navigator.userAgent.includes("Firefox")) {
    Object.defineProperty(globalThis, "crossOriginIsolated", {
        value: true,
        writable: false,
    });
}

importScripts("/math/uv.bundle.js");
importScripts("/math/uv.config.js");
importScripts("/math/uv.sw.js");
importScripts("/learn/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const uv = new UVServiceWorker(self.__uv$config);
const scramjet = new ScramjetServiceWorker();

const STATIC_CACHE = "bolt-static-v1";
const STATIC_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
                     ".woff", ".woff2", ".ttf", ".otf", ".eot",
                     ".css", ".mp4", ".webm"];

function isStaticAsset(url) {
    try {
        const u = new URL(url);
        return STATIC_EXTS.some(ext => u.pathname.endsWith(ext));
    } catch {
        return false;
    }
}

async function handleRequest(event) {
    try {
        await scramjet.loadConfig().catch(err => console.error("Scramjet Config Load Failed", err));

        if (uv.route(event)) {
            const response = await uv.fetch(event);
            return response;
        }

        if (scramjet.route(event)) {
            const response = await scramjet.fetch(event);
            return response;
        }
    } catch (error) {
        console.error("Proxy Error:", error);

        try {
            if (uv.route(event)) {
                return await uv.fetch(event);
            }
            if (scramjet.route(event)) {
                return await scramjet.fetch(event);
            }
        } catch (retryError) {
            console.error("Proxy retry failed:", retryError);
            return new Response(
                `<html><body style="font-family:sans-serif;padding:2rem;background:#111;color:#eee">
                    <h2>Proxy Error</h2>
                    <p>${error.message || "Failed to load resource."}</p>
                    <button onclick="history.back()" style="padding:.5rem 1rem;cursor:pointer">Go Back</button>
                </body></html>`,
                { status: 503, headers: { "Content-Type": "text/html" } }
            );
        }
    }

    return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("install", () => {
    self.skipWaiting();
});

let playgroundData;
self.addEventListener("message", ({ data }) => {
    if (data.type === "playgroundData") {
        playgroundData = data;
    }
});

scramjet.addEventListener("request", (e) => {
    if (playgroundData && e.url.href.startsWith(playgroundData.origin)) {
        const headers = {};
        const origin = playgroundData.origin;
        if (e.url.href === origin + "/") {
            headers["content-type"] = "text/html";
            e.response = new Response(playgroundData.html, { headers });
        } else if (e.url.href === origin + "/style.css") {
            headers["content-type"] = "text/css";
            e.response = new Response(playgroundData.css, { headers });
        } else if (e.url.href === origin + "/script.js") {
            headers["content-type"] = "application/javascript";
            e.response = new Response(playgroundData.js, { headers });
        } else {
            e.response = new Response("empty response", { headers });
        }
        e.response.rawHeaders = headers;
        e.response.rawResponse = {
            body: e.response.body,
            headers: headers,
            status: e.response.status,
            statusText: e.response.statusText,
        };
        e.response.finalURL = e.url.toString();
    } else {
        return;
    }
});
