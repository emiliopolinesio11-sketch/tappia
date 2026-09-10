# Tappia: guía del MVP

## Estado
Next.js App Router con `/r/A001`. No requiere Supabase ni variables de entorno.
El README original se conserva. Esta implementación se prepara en `feat/nextjs-redirect-mvp`.

## Probar localmente
Usa Node.js 22 o superior y pnpm. Ejecuta `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build` y `pnpm start`.
Abre http://localhost:3000 y prueba `/r/A001` (307), `/r/A002` (410) y `/r/NOEXISTE` (404).

## Cambiar un destino
Edita `data/links.json`. Conserva el `code`, cambia `destination` por una URL completa HTTPS y publica el cambio. `active: false` pausa la placa.
En este MVP las ediciones requieren un nuevo despliegue. No hay un panel ni almacenamiento mutable en memoria. No contiene métricas ni generación de QR todavía.
Los códigos distinguen mayúsculas y minúsculas. Usa letras mayúsculas, números, guion o guion bajo, hasta 32 caracteres.
Las respuestas de redirección son temporales (307) y no se almacenan en caché.
No se aceptan destinos proporcionados por parámetros de la URL pública.

## Publicar en Vercel de forma guiada
1. Revisa el cambio de la rama y ejecuta las pruebas antes de integrarlo en main.
2. En el proyecto conectado a este repositorio, selecciona **Next.js** como Framework Preset (la importación inicial mostraba Other).
3. Root Directory: raíz del repositorio. Conserva los valores automáticos de instalación, build y output. Usa Node.js 22.x o superior compatible.
4. No agregues claves de Supabase todavía. Prueba primero una Preview de la rama si tu configuración de Vercel lo permite.
5. Comprueba las tres rutas indicadas. Tras revisar la Preview, integra en main para desplegar producción.
6. Guarda en QR/NFC la URL real de Vercel seguida de `/r/A001`; la URL asignada no está garantizada como tappia.vercel.app.

Para revertir, revierte el commit de integración desde GitHub y vuelve a desplegar, o restaura un despliegue anterior desde Vercel.

## Conectar Supabase después
`lib/links.mjs` define `linkRepository.findByCode(code)` y `resolveLink` concentra validación/estado. Sustituye el repositorio JSON por un adaptador de servidor que devuelva `{code,business,destination,active}` o `null`. Mantén lecturas sin caché para que un cambio sea inmediato.
`supabase/schema.sql` propone una tabla con RLS habilitado y sin acceso público. Revisar y ejecutar una sola vez al crear el proyecto. `.env.example` enumera las variables futuras; el MVP no las consume.
Nunca uses un prefijo NEXT_PUBLIC para la clave de servicio ni la envíes al navegador. Antes de habilitar un panel, implementa autenticación, autorización de propietario, validación de destinos y protección de escrituras. Los errores de almacenamiento deben devolver 503, sin exponer detalles internos.

Referencia: https://nextjs.org/docs/app/api-reference/file-conventions/route
