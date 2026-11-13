# AGENTS.md — Guía de Arquitectura y Reglas del Proyecto

## Descripción del Proyecto
**MiBalance** es una Progressive Web App (PWA) 100% client-side para el control personal de ingresos, gastos, cálculo de quincenas y protección de saldo (Stop Loss).

## Stack Tecnológico (Inmutable)
- **HTML5 semántico** (`index.html`)
- **CSS3 Vanilla** (`styles.css`) con sistema de diseño líquido basado en `clamp()` y variables CSS.
- **JavaScript Vanilla ES6+** (`app.js`) sin frameworks (NO React, Vue, Tailwind ni bundlers como Vite/Webpack).
- **PWA** (`manifest.json` + `sw.js` con estrategia Cache-First + Stale-While-Revalidate).

## Reglas Estrictas para Modificaciones
1. **Cero Backend / Cero Dependencias Externas:** Nunca agregar llamadas a APIs externas, CDNs de fuentes/iconos ni bases de datos en la nube. Toda la persistencia debe vivir en `localStorage` (`mibalance_transactions_v1` y `mibalance_settings_v1`).
2. **Invalidación de Caché:** Cualquier cambio en `index.html`, `styles.css`, `app.js` o `manifest.json` REQUIERE incrementar la versión de `CACHE_NAME` en `sw.js` (ej. `mibalance-pwa-v5`).
3. **Diseño Mobile-First / Liquid UI:** Mantener compatibilidad estricta hasta `320px` de ancho (iPhone SE). Prohibido usar tamaños de fuente fijos que rompan en pantallas estrechas o inputs menores a `16px` (evita el auto-zoom en iOS Safari).
4. **Seguridad:** Prohibido usar `eval()` o `innerHTML` con datos ingresados por el usuario (usar siempre `textContent` y `createElement`).
5. **Compatibilidad de Respaldos:** Mantener retrocompatibilidad con el esquema JSON de exportación/importación (`version: 1`).
