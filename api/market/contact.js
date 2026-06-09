// Vercel serverless-funktion: kontakta en annonsör i UCI Bytesmarknad.
// Slår upp annonsens ägare via Supabase service-role och mejlar ägaren med
// avsändarens e-post som reply-to. Själva affären sker utanför AestimAi.
//
// Krävda miljövariabler (Vercel):
//   SUPABASE_URL                (default: hostade projektet)
//   SUPABASE_SERVICE_ROLE_KEY   (hemlig – server-side endast)
//   RESEND_API_KEY              (e-postleverantör)
//   MAIL_FROM                   (verifierad avsändaradress, default nedan)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const MAIL_FROM    = process.env.MAIL_FROM || 'AestimAi Bytesmarknad <bytesmarknad@aestimai.org>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { listingId, fromEmail, name, message, hp } = await readJson(req);

  // Honeypot: bottar fyller i det dolda fältet → låtsas att det gick bra.
  if (hp) { res.status(200).json({ ok: true }); return; }

  if (!listingId)                          { res.status(400).json({ error: 'Annons saknas.' }); return; }
  if (!fromEmail || !EMAIL_RE.test(fromEmail)) { res.status(400).json({ error: 'Ogiltig e-postadress.' }); return; }
  if (!message || message.trim().length < 3)   { res.status(400).json({ error: 'Skriv ett meddelande.' }); return; }
  if (message.length > 5000)               { res.status(400).json({ error: 'Meddelandet är för långt.' }); return; }

  if (!SERVICE_KEY || !RESEND_KEY) {
    console.error('[contact] saknar SUPABASE_SERVICE_ROLE_KEY eller RESEND_API_KEY');
    res.status(500).json({ error: 'Kontaktfunktionen är inte konfigurerad ännu.' });
    return;
  }

  try {
    // 1) Hämta annonsen (endast publik) + ägarens user_id.
    const lr = await fetch(
      `${SUPABASE_URL}/rest/v1/aestimai_valuations?id=eq.${encodeURIComponent(listingId)}&is_public=eq.true&select=user_id,object_data,marketplace`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const listings = await lr.json();
    const listing = Array.isArray(listings) ? listings[0] : null;
    if (!listing) { res.status(404).json({ error: 'Annonsen hittades inte.' }); return; }

    // 2) Hämta ägarens e-post via admin-API (service role).
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${listing.user_id}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const owner = await ur.json();
    const ownerEmail = owner && owner.email;
    if (!ownerEmail) { res.status(422).json({ error: 'Annonsören saknar kontaktbar e-post.' }); return; }

    const title = (listing.marketplace && listing.marketplace.title)
      || (listing.object_data && (listing.object_data.title || listing.object_data.description))
      || 'din annons';
    const safeName = (name || 'En intresserad användare').toString().slice(0, 120);
    const safeMsg  = message.toString();

    // 3) Skicka mejl via Resend.
    const er = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [ownerEmail],
        reply_to: fromEmail,
        subject: `UCI Bytesmarknad: intresse för "${title}"`,
        text:
          `Hej!\n\n${safeName} (${fromEmail}) är intresserad av din annons "${title}" på UCI Bytesmarknad.\n\n` +
          `Meddelande:\n${safeMsg}\n\n` +
          `Svara direkt på det här mejlet för att kontakta personen. Affären gör ni upp själva, utanför AestimAi.\n`,
      }),
    });

    if (!er.ok) {
      const detail = await er.text();
      console.error('[contact] Resend-fel:', er.status, detail);
      res.status(502).json({ error: 'Kunde inte skicka mejlet just nu.' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[contact] fel:', e);
    res.status(500).json({ error: 'Internt fel.' });
  }
};
