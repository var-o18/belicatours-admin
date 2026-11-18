# Contexto: la web pública y cómo enlazarla con el panel

Repositorio de la web: [var-o18/belicatours-web](https://github.com/var-o18/belicatours-web)
(carpeta local `~/Desktop/BELICA TOURS`). Vite + React, GSAP + Lenis, sin backend.

## Situación actual de la web (noviembre 2026)

- **Los formularios NO envían nada a ningún servidor.** Guardan en `localStorage` del
  navegador del cliente, así que hoy las reservas no le llegan a nadie (salvo el botón de WhatsApp):
  - Reserva de plaza → `belica-bookings` (`src/components/BookingModal.jsx`)
  - Excursiones escolares → `belica-school-requests` (`src/components/SchoolQuoteModal.jsx`)
  - Grupos → `belica-group-quotes` (`src/components/GroupQuoteModal.jsx`)
  - Newsletter → `belica-newsletter` (`src/components/FinalCTA.jsx`)
  - `src/components/BookingDrawer.jsx` es un componente antiguo sin usar.
- **Las actividades están escritas a mano** en `src/data/toursData.js`:
  `TOURS` (id de texto tipo `"tabarca"`, title, subtitle, category, categoryLabel,
  description, longDescription, duration, difficulty?, meeting, adult, child, capacity,
  image, highlights) y `SESSIONS` (id, tourId, date `YYYY-MM-DD`, time `HH:MM`, seats).
  Categorías actuales: experiencias, visitas, gastronomia.
- Destinos escolares en `src/components/SchoolsSection.jsx` y `SchoolQuoteModal.jsx`.
- Fotos locales en `public/images` (la web antigua belicatours.com desaparecerá).
- La reserva genera hoy un código `BEL-XXXXXX` en el navegador (inseguro): debe pasar a
  generarse en la base de datos (`RES-XXXXXX`) según los requisitos.
- Datos de una reserva web hoy: sesión (fecha/hora), adultos, niños (precios distintos),
  nombre, apellidos, email, teléfono, observaciones, total.

## Plan de enlace (a decidir al empezar)

1. Modelar en Supabase `activities` + **sesiones/fechas** (la web reserva por sesión concreta)
   + `reservations` (con adultos/niños, no solo `guests`).
2. Migrar los datos de `toursData.js` a Supabase (script de semilla) conservando un `slug`.
3. Inserción pública de reservas: función/RPC o Edge Function que valide, genere el código
   y envíe el correo de recepción; RLS sin lectura pública de reservas.
4. La web lee actividades y sesiones publicadas desde Supabase en vez de `toursData.js`
   (clave publicable en la web, nunca la secreta).
5. Decidir si las solicitudes escolares y de grupos también van al panel.

## Supabase

- Proyecto: `ollerqgwzswmrnekytwm` (enlazado con `supabase link`).
- Plan gratuito: se pausa tras 7 días sin peticiones → prever un "keep-alive" programado.
- Claves en `.env.local` (no versionado). Solo clave publicable `sb_publishable_…` en el navegador.
