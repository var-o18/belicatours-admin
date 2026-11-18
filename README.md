# Bélica Tours · Panel de administración

Panel privado para gestionar las **reservas** recibidas desde la web
([belicatours-web](https://github.com/var-o18/belicatours-web)) o creadas a mano,
y las **actividades/visitas** que se ofrecen al público.

> Estado: proyecto inicializado, desarrollo **no iniciado**.
> Requisitos completos en [`docs/requisitos-panel-administracion.pdf`](docs/requisitos-panel-administracion.pdf).

## Stack

- **Vite + React** (aplicación web del panel)
- **Supabase**: base de datos Postgres, Auth (email + contraseña), Storage (fotos) y RLS
- Correos automáticos desde una función segura en servidor (Edge Function), nunca desde el navegador

## Estructura

```
docs/                 Documento de requisitos
src/                  Aplicación del panel
src/lib/supabase.js   Cliente Supabase (clave pública anon)
supabase/config.toml  Configuración local de Supabase
supabase/migrations/  Migraciones SQL (tablas, RLS, funciones)
```

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # rellenar URL y clave anon del proyecto Supabase
npm run dev
```

### Conectar con el proyecto de Supabase

```bash
npx supabase login
npx supabase link --project-ref <REF_DEL_PROYECTO>
```

## Resumen de requisitos

- **Reservas**: listado, detalle, alta manual, edición y cancelación con confirmación;
  estados *Pendiente → Aceptada → Pagada* con historial (quién y cuándo);
  código público legible (p. ej. `RES-7K4P92`) + UUID interno no expuesto;
  filtros por actividad, estado y fechas, búsqueda y calendario.
- **Pagos**: Bizum y transferencia configurables desde el panel; el cliente indica el
  código de reserva en el concepto. «Pagada» siempre lo marca el administrador.
- **Correos**: al recibir la reserva y al aceptarla (con importe e instrucciones de pago),
  sin duplicados y con registro de envíos y reintento.
- **Actividades**: CRUD, fotos en Storage, publicar/despublicar/archivar, horarios y plazas.
- **Seguridad**: Supabase Auth, rol de administrador y RLS en todas las tablas.

### Modelo de datos orientativo

| Tabla | Uso |
|---|---|
| `activities` | Actividades/visitas publicadas en la web |
| `activity_images` | Fotos de cada actividad (Supabase Storage) |
| `reservations` | Reservas web y manuales |
| `reservation_events` | Historial de cambios de estado |
| `email_log` | Registro de correos automáticos |
