'use strict';
// UI strings. The language follows the browser: Spanish for es-*, English otherwise.

const LANG = (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';

const I18N = {
  es: {
    title: 'Nueva pestaña',
    animals: { butterfly: 'Mariposa', koi: 'Koi', jellyfish: 'Medusa', dragonfly: 'Libélula', frog: 'Rana', crane: 'Grulla', crab: 'Cangrejo' },
    settings: 'Ajustes', detail: 'Resolución', amount: 'Cantidad', size: 'Tamaño', speed: 'Velocidad', name: 'Tu nombre',
    namePlaceholder: 'Opcional', reset: 'Restablecer', search: 'Buscá o escribí una dirección…', searchLabel: 'Buscar',
    engine: 'Cambiar buscador', scatter: 'clic para dispersar', feed: 'clic para alimentar', keys: '1–7 cambia de animal',
    update: (v) => `Actualizar a ${v}`, updateHint: 'Bajá el zip, reemplazá la carpeta y recargá la extensión',
    suggest: 'Sugerencias e historial', suggestHint: 'Predicciones del buscador y páginas de tu historial. Edge te pide permiso una vez.',
    searchWith: (e) => `Buscar en ${e}`, open: 'Ir al sitio',
    friend: 'amigo', editName: 'Tocá para cambiar tu nombre',
    greet: (h) => h < 5 ? ['¿Todavía despierto, ', '?'] : [h < 12 ? 'Buen día, ' : h < 20 ? 'Buenas tardes, ' : 'Buenas noches, ', ''],
  },
  en: {
    title: 'New tab',
    animals: { butterfly: 'Butterfly', koi: 'Koi', jellyfish: 'Jellyfish', dragonfly: 'Dragonfly', frog: 'Frog', crane: 'Crane', crab: 'Crab' },
    settings: 'Settings', detail: 'Resolution', amount: 'Amount', size: 'Size', speed: 'Speed', name: 'Your name',
    namePlaceholder: 'Optional', reset: 'Reset', search: 'Search or type a URL…', searchLabel: 'Search',
    engine: 'Change search engine', scatter: 'click to scatter', feed: 'click to feed', keys: '1–7 switch animal',
    update: (v) => `Update to ${v}`, updateHint: 'Download the zip, replace the folder and reload the extension',
    suggest: 'Suggestions and history', suggestHint: 'Predictions from your search engine and pages from your history. The browser asks once.',
    searchWith: (e) => `Search with ${e}`, open: 'Open site',
    friend: 'friend', editName: 'Click to change your name',
    greet: (h) => h < 5 ? ['Still up, ', '?'] : [h < 12 ? 'Good morning, ' : h < 20 ? 'Good afternoon, ' : 'Good evening, ', ''],
  },
};
const T = I18N[LANG];

// Fill every element marked with data-i18n (text), data-i18n-placeholder or data-i18n-label.
function applyI18n(root = document) {
  document.documentElement.lang = LANG;
  document.title = T.title;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = T[el.dataset.i18n];
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = T[el.dataset.i18nPlaceholder];
  for (const el of root.querySelectorAll('[data-i18n-label]')) {
    el.setAttribute('aria-label', T[el.dataset.i18nLabel]);
    el.title = T[el.dataset.i18nLabel];
  }
}
