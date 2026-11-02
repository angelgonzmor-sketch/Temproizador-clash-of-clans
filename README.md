# ⏱️ Temporizador Clash

Aplicación web para gestionar los tiempos de mejora de **Clash of Clans**: edificios, héroes, hechizos, investigaciones y la Poción del Constructor.

## Funciones

- **Poción del Constructor ×10**: acelera los temporizadores activos y muestra la cuenta atrás.
- **Importar aldea desde JSON**: detecta mejoras del formato actual (`data`, `lvl` y `timer` en segundos) y del formato antiguo (`upgradeEndTime`, `endTime`, `remainingSeconds` o `finishDate`). Muestra mensajes de éxito, aviso o error.
- **Temporizadores manuales**: nombre, nivel, duración (`30s`, `5m`, `2h`, `1d`) o fecha/hora de fin.
- **Notificaciones**: aviso del navegador y pitido al completarse una mejora, incluso en segundo plano.
- **Guardado automático** en `localStorage` y sincronización entre dispositivos mediante código Base64.
- **Diseño responsive** con tema oscuro.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Compilación

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

## Despliegue

El proyecto se publica automáticamente en GitHub Pages mediante el workflow de `.github/workflows/deploy.yml` al hacer push a `main`.

Web: <https://angelgonzmor-sketch.github.io/Temproizador-clash-of-clans/>

## Tecnologías

React 18 · TypeScript · Vite 6 · Tailwind CSS 4 · Vitest
