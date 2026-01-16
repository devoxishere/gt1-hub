const CACHE_NAME = 'gt1-manager-v1.0.4';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/midi.js',
    './js/storage.js',
    './js/app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});
