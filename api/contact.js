// POST /api/contact
// Tar emot kontaktformulär och skickar e-post via Resend.
// Kräver miljövariabel: RESEND_API_KEY

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email och message krävs' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.error('[contact] RESEND_API_KEY saknas');
    return res.status(500).json({ error: 'Serverkonfiguration saknas' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'AestimAi Kontakt <no-reply@aestimai.org>',
        to:      ['kontakt@aestimai.org'],
        reply_to: email,
        subject: `[Kontakt] ${subject || 'Allmän fråga'} — ${name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#1a1a2e;">Nytt kontaktmeddelande</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#666;width:120px;">Namn</td><td style="padding:6px 0;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">E-post</td><td style="padding:6px 0;"><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding:6px 0;color:#666;">Ämne</td><td style="padding:6px 0;">${subject || '—'}</td></tr>
            </table>
            <hr style="margin:1.5rem 0;border:none;border-top:1px solid #eee;">
            <p style="white-space:pre-wrap;line-height:1.6;">${message}</p>
            <hr style="margin:1.5rem 0;border:none;border-top:1px solid #eee;">
            <p style="color:#999;font-size:.8rem;">Skickat från AestimAi kontaktformulär — aestimai.org</p>
          </div>
        `,
      }),
    });

    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.message || 'Resend-fel');
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[contact]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
