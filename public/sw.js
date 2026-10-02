/* Never cache account pages, conversations, uploads, or API responses. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Cast is offline</title><body style="font:18px system-ui;background:#f7f6f2;padding:40px"><h1>A moment offline.</h1><p>Your private conversations remain on the server. Reconnect to return to your cast.</p><button onclick="location.reload()">Try again</button></body></html>',
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          ),
      ),
    );
  }
});
