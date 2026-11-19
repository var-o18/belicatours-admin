// Edge Function «send-emails»
//
// Envía por Gmail los correos que están «pendientes» en public.email_log.
// La llama la base de datos (pg_net) cada vez que apunta un correo nuevo.
// No acepta datos de quien la llama: solo procesa la cola.
//
// Secretos necesarios (npx supabase secrets set ...):
//   GMAIL_USER          belicatours@gmail.com
//   GMAIL_APP_PASSWORD  contraseña de aplicación de Google (16 letras)
// Opcionales:
//   ADMIN_EMAIL         dónde llegan los avisos de reservas (por defecto GMAIL_USER)
//   ADMIN_PANEL_URL     dirección del panel, para poner un enlace en el aviso
//   WEB_URL             dirección de la web pública

import nodemailer from 'npm:nodemailer@6.9.16';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const TZ = 'Europe/Madrid';
const WHATSAPP = 'https://wa.me/34634787479';
const PHONE = '+34 634 787 479';
const MAX_ATTEMPTS = 5;

const env = (k: string) => Deno.env.get(k) ?? '';
const GMAIL_USER = env('GMAIL_USER');
const GMAIL_APP_PASSWORD = env('GMAIL_APP_PASSWORD').replace(/\s+/g, '');
const ADMIN_EMAIL = env('ADMIN_EMAIL') || GMAIL_USER;
const ADMIN_PANEL_URL = env('ADMIN_PANEL_URL').replace(/\/$/, '');
const WEB_URL = env('WEB_URL').replace(/\/$/, '');

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

// ── Formato ───────────────────────────────────────────────────────────
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDate = (iso: string) => {
  const s = new Intl.DateTimeFormat('es-ES', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const fmtMoney = (n: number, cur = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur }).format(Number(n));
const people = (a: number, c: number) =>
  [a ? `${a} adulto${a === 1 ? '' : 's'}` : '', c ? `${c} niño${c === 1 ? '' : 's'}` : ''].filter(Boolean).join(' y ');
const fmtIban = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

// ── Plantilla ─────────────────────────────────────────────────────────
type Row = [string, string];

function table(rows: Row[]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0">
${rows
  .map(
    ([k, v]) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #ece4d6;color:#7a6d5c;font-size:13px;width:38%;vertical-align:top">${esc(k)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #ece4d6;color:#1f1a14;font-size:14px;font-weight:600">${v}</td>
</tr>`
  )
  .join('\n')}
</table>`;
}

function layout(title: string, body: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f3eee4;font-family:Helvetica,Arial,sans-serif;color:#1f1a14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee4;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:#1f1a14;padding:22px 28px;color:#f3eee4;font-family:Georgia,serif;font-size:20px;letter-spacing:2px">
BÉLICA TOURS<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#c79a4b;margin-top:4px">PATRIMONIO &amp; HISTORIA</div>
</td></tr>
<tr><td style="padding:28px">
<h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 12px;color:#1f1a14">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 28px;background:#faf7f1;color:#7a6d5c;font-size:12px;line-height:1.6">
¿Dudas? Escríbenos por <a href="${WHATSAPP}" style="color:#9b3a24">WhatsApp (${PHONE})</a> o responde a este correo.${
    WEB_URL ? `<br><a href="${WEB_URL}" style="color:#9b3a24">${esc(WEB_URL.replace(/^https?:\/\//, ''))}</a>` : ''
  }
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

const p = (html: string) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${html}</p>`;

type Reservation = {
  id: string; booking_code: string; event_at: string; first_name: string; last_name: string;
  email: string | null; phone: string | null; adults: number; children: number; amount: number;
  currency: string; status: string; source: string; customer_notes: string | null;
  activities: { title: string; meeting_point: string | null; duration: string | null } | null;
};
type Payment = {
  bizum_enabled: boolean; bizum_phone: string | null; bizum_holder: string | null;
  transfer_enabled: boolean; transfer_holder: string | null; transfer_iban: string | null; transfer_bank: string | null;
};

function bookingRows(r: Reservation): Row[] {
  const rows: Row[] = [
    ['Código de reserva', `<span style="font-family:monospace;font-size:15px">${esc(r.booking_code)}</span>`],
    ['Actividad', esc(r.activities?.title ?? '—')],
    ['Fecha', esc(fmtDate(r.event_at))],
    ['Hora', esc(fmtTime(r.event_at))],
    ['Personas', esc(people(r.adults, r.children))],
    ['Importe', esc(fmtMoney(r.amount, r.currency))],
  ];
  if (r.activities?.meeting_point) rows.push(['Punto de encuentro', esc(r.activities.meeting_point)]);
  if (r.activities?.duration) rows.push(['Duración', esc(r.activities.duration)]);
  return rows;
}

function buildReception(r: Reservation) {
  const subject = `Hemos recibido tu solicitud de reserva · ${r.booking_code}`;
  const html = layout(
    `¡Gracias, ${r.first_name}!`,
    p('Hemos recibido tu solicitud de reserva. <strong>Todavía no está confirmada</strong>: revisamos la disponibilidad y en breve te enviaremos un correo con la confirmación y los datos para el pago.') +
      table(bookingRows(r)) +
      p('Guarda el código de reserva: lo necesitarás para el pago y si quieres hacer algún cambio.')
  );
  return { subject, html, payload: { subject } };
}

function buildAcceptance(r: Reservation, pay: Payment) {
  const subject = `Reserva confirmada · ${r.booking_code} · Datos de pago`;
  const methods: string[] = [];
  if (pay.bizum_enabled && pay.bizum_phone) {
    methods.push(
      `<div style="border:1px solid #ece4d6;border-radius:8px;padding:14px 16px;margin:0 0 10px">
<div style="font-size:12px;letter-spacing:1px;color:#9b3a24;font-weight:700;margin-bottom:6px">BIZUM</div>
<div style="font-size:15px">Teléfono: <strong>${esc(pay.bizum_phone)}</strong></div>${
        pay.bizum_holder ? `<div style="font-size:14px;color:#7a6d5c">A nombre de ${esc(pay.bizum_holder)}</div>` : ''
      }</div>`
    );
  }
  if (pay.transfer_enabled && pay.transfer_iban) {
    methods.push(
      `<div style="border:1px solid #ece4d6;border-radius:8px;padding:14px 16px;margin:0 0 10px">
<div style="font-size:12px;letter-spacing:1px;color:#9b3a24;font-weight:700;margin-bottom:6px">TRANSFERENCIA BANCARIA</div>
<div style="font-size:15px">IBAN: <strong style="font-family:monospace">${esc(fmtIban(pay.transfer_iban))}</strong></div>
<div style="font-size:14px;color:#7a6d5c">Titular: ${esc(pay.transfer_holder)}${pay.transfer_bank ? ` · ${esc(pay.transfer_bank)}` : ''}</div></div>`
    );
  }

  const payBlock = methods.length
    ? p(`Para completar la reserva, realiza el pago de <strong>${esc(fmtMoney(r.amount, r.currency))}</strong> por uno de estos medios:`) +
      methods.join('') +
      p(`Indica como concepto el código <strong style="font-family:monospace">${esc(r.booking_code)}</strong>. Cuando lo recibamos te lo confirmaremos.`)
    : p('En breve te contactaremos para indicarte cómo realizar el pago.');

  const html = layout(
    `¡Tu reserva está confirmada, ${r.first_name}!`,
    p('Tenemos plaza para ti. Estos son los datos de tu reserva:') + table(bookingRows(r)) + payBlock
  );
  // Copia de los datos de pago enviados, para saber qué recibió el cliente
  return { subject, html, payload: { subject, payment: pay } };
}

function buildAdminNotice(r: Reservation) {
  const subject = `Nueva reserva web · ${r.activities?.title ?? ''} · ${fmtDate(r.event_at)} ${fmtTime(r.event_at)}`;
  const rows: Row[] = [
    ...bookingRows(r).slice(0, 6),
    ['Cliente', esc(`${r.first_name} ${r.last_name}`.trim())],
    ['Correo', r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '—'],
    ['Teléfono', r.phone ? `<a href="tel:${esc(r.phone.replace(/\s+/g, ''))}">${esc(r.phone)}</a>` : '—'],
  ];
  if (r.customer_notes) rows.push(['Comentarios', esc(r.customer_notes).replace(/\n/g, '<br>')]);
  const link = ADMIN_PANEL_URL
    ? `<p style="margin:20px 0 0"><a href="${ADMIN_PANEL_URL}/reservas" style="display:inline-block;background:#9b3a24;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700">Abrir el panel</a></p>`
    : '';
  const html = layout(
    'Nueva solicitud de reserva',
    p('Ha llegado una reserva desde la web. Está <strong>pendiente</strong>: acéptala en el panel para que el cliente reciba los datos de pago.') +
      table(rows) +
      link
  );
  return { subject, html, payload: { subject } };
}

// ── Envío ─────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

async function processQueue() {
  // Sin credenciales no se toca la cola: los correos esperan como «pendientes»
  // y salen en cuanto se configuren los secretos y llegue otra reserva.
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('Faltan los secretos GMAIL_USER o GMAIL_APP_PASSWORD');
    return { sent: 0, failed: 0, configured: false };
  }
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: claimed, error } = await db
    .from('email_log')
    .update({ claimed_at: new Date().toISOString() })
    .eq('status', 'pendiente')
    .lt('attempts', MAX_ATTEMPTS)
    .or(`claimed_at.is.null,claimed_at.lt."${staleBefore}"`)
    .select('id, reservation_id, email_type, recipient, attempts');
  if (error) throw error;
  if (!claimed?.length) return { sent: 0, failed: 0 };

  const { data: pay } = await db.from('payment_settings').select('*').eq('id', 1).single();
  let sent = 0;
  let failed = 0;

  for (const log of claimed) {
    const attempts = log.attempts + 1;
    try {
      if (!log.reservation_id) throw new Error('La reserva ya no existe');

      const { data: r, error: rErr } = await db
        .from('reservations')
        .select('*, activities(title, meeting_point, duration)')
        .eq('id', log.reservation_id)
        .single();
      if (rErr || !r) throw new Error('La reserva ya no existe');

      let to = log.recipient;
      let replyTo = GMAIL_USER;
      let msg;
      if (log.email_type === 'recepcion') msg = buildReception(r);
      else if (log.email_type === 'aceptacion') {
        if (r.status !== 'aceptada') throw new Error('La reserva ya no está aceptada; no se envía');
        msg = buildAcceptance(r, pay as Payment);
      } else {
        to = ADMIN_EMAIL;
        replyTo = r.email || GMAIL_USER;
        msg = buildAdminNotice(r);
      }

      const info = await transporter.sendMail({
        from: `"Bélica Tours" <${GMAIL_USER}>`,
        to,
        replyTo,
        subject: msg.subject,
        html: msg.html,
      });

      await db
        .from('email_log')
        .update({
          status: 'enviado', sent_at: new Date().toISOString(), recipient: to,
          provider_id: info.messageId ?? null, payload: msg.payload, error: null, attempts,
        })
        .eq('id', log.id);
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Correo ${log.id} (${log.email_type}) no enviado:`, message);
      await db.from('email_log').update({ status: 'fallido', error: message.slice(0, 500), attempts }).eq('id', log.id);
      failed++;
    }
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const result = await processQueue();
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'No se pudo procesar la cola' }, { status: 500 });
  }
});
