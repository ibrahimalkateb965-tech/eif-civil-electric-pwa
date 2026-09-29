/**
 * sw.js - Service Worker for Engineer Islam Fouda Work Management System
 * Offline Field PWA & Cache-First Asset Engine
 * Version: 16.49
 */

const CACHE_NAME = 'eif-field-v16.49';

// Core shell assets to precache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './assets/css/style.css',
  './assets/css/works.css',
  './assets/js/db.js',
  './assets/js/backup.js',
  './assets/js/works.js',
  './assets/js/works_ui.js',
  './assets/vendor/pdf/pdf.min.js',
  './assets/vendor/pdf/pdf.worker.min.js',
  './assets/vendor/tesseract/tesseract.min.js',
  './assets/vendor/tesseract/worker.min.js',
  './assets/vendor/tesseract/tesseract-core.wasm.js',
  './assets/vendor/sql/sql-wasm.js',
  './assets/vendor/sql/sql-wasm.wasm',
  './assets/engineer_profile.png',
  './assets/engineer_eslam_original.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests; bypass Cache Storage for others
  if (event.request.method !== 'GET') {
    return;
  }

  // Navigation requests: serve cached index.html if offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = (await caches.match('./index.html')) || (await caches.match('index.html')) || (await caches.match('./'));
        if (cached) return cached;
        return new Response('<h1>Offline - Engineer Islam Fouda System</h1>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      })
    );
    return;
  }

  // Cache-First strategy with network fallback
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      try {
        const networkResponse = await fetch(event.request);
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' &&
          !networkResponse.url.endsWith('.pdf')
        ) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        const fallback = await caches.match(event.request);
        if (fallback) return fallback;
        return new Response('', { status: 503, statusText: 'Service Unavailable (Offline)' });
      }
    })()
  );
});
