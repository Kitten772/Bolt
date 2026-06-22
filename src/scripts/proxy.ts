import { BareMuxConnection } from '@mercuryworkshop/bare-mux';

const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";

function getTransport(): string {
    try {
        const settings = JSON.parse(localStorage.getItem('bolt-settings') || '{}');
        return settings.transport || 'libcurl';
    } catch {
        return 'libcurl';
    }
}

const transportPath = getTransport() === 'epoxy'
    ? '/epoxy-transport.mjs'
    : '/libcurl/index.mjs';

const { ScramjetController } = typeof $scramjetLoadController !== 'undefined' ? $scramjetLoadController() : {
    ScramjetController: class {
        init() { }
        encodeUrl(url: string) { return url; }
    } as any
};

// Standard Scramjet — fast, good general compatibility
const scramjet = new ScramjetController({
    files: {
        wasm: "/learn/scramjet.wasm.wasm",
        all: "/learn/scramjet.all.js",
        sync: "/learn/scramjet.sync.js",
    },
    flags: {
        rewriterLogs: false,
        scramitize: true,
        cleanErrors: true,
        sourcemaps: false,
    },
    siteFlags: {
        "youtube.com": { scramitize: true },
        "youtu.be": { scramitize: true },
        "googlevideo.com": { scramitize: true },
        "googleapis.com": { scramitize: true },
        "google.com": { scramitize: true },
        "reddit.com": { scramitize: true },
        "twitch.tv": { scramitize: true },
        "instagram.com": { scramitize: true },
        "tiktok.com": { scramitize: true },
    },
    prefix: '/$/'
});

if (scramjet.init) scramjet.init();

export const swReady = new Promise<void>((resolve) => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
            if (navigator.serviceWorker.controller) {
                resolve();
            } else {
                navigator.serviceWorker.addEventListener('controllerchange', () => resolve());
            }
            reg.update();
        }).catch(err => {
            console.error("Service worker registration failed:", err);
            resolve();
        });
    } else {
        resolve();
    }
});

const bmc = new BareMuxConnection("/baremux/worker.js");
export const transportReady: Promise<void> = (async () => {
    try {
        console.log('[Transport] Setting up with WISP URL:', wispUrl);
        await bmc.setTransport(transportPath, [{ wisp: wispUrl }]);
        console.log('[Transport] Transport ready');
    } catch (err) {
        console.error('[Transport] Setup failed:', err);
    }
})();

export function getProxyEngine(): string {
    try {
        const settings = JSON.parse(localStorage.getItem('bolt-settings') || '{}');
        return settings.proxyEngine || 'scramjet';
    } catch {
        return 'scramjet';
    }
}

// Base64 — handles YouTube's complex URLs correctly (special chars, long query strings)
function uvBase64Encode(str: string): string {
    if (!str) return str;
    try {
        return btoa(str);
    } catch {
        return btoa(unescape(encodeURIComponent(str)));
    }
}

function uvBase64Decode(str: string): string {
    if (!str) return str;
    try {
        return atob(str);
    } catch {
        try {
            return decodeURIComponent(escape(atob(str)));
        } catch {
            return str;
        }
    }
}

function encodeUrl(url: string): string {
    const engine = getProxyEngine();

    if (engine === 'ultraviolet' || engine === 'ultraviolet-max') {
        return '/maths/' + uvBase64Encode(url);
    }

    // scramjet and scramjet-max both use Scramjet
    return scramjet.encodeUrl(url);
}

function decodeProxiedUrl(proxiedUrl: string): string {
    if (proxiedUrl.includes('/maths/')) {
        const encoded = proxiedUrl.split('/maths/')[1];
        if (encoded) return uvBase64Decode(encoded.split('?')[0]);
    }

    if (proxiedUrl.includes('/$/')) {
        return decodeURIComponent(proxiedUrl.split('/$/')[1] || proxiedUrl);
    }

    return proxiedUrl;
}

function isProxiedUrl(url: string): boolean {
    return url.includes('/$/') || url.includes('/maths/');
}

function getProxyPrefix(): string {
    const engine = getProxyEngine();
    return (engine === 'ultraviolet' || engine === 'ultraviolet-max') ? '/maths/' : '/$/';
}

const proxy = {
    encodeUrl,
    decodeProxiedUrl,
    isProxiedUrl,
    getProxyPrefix,
    getProxyEngine,
    scramjet,
};

export default proxy;
