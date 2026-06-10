// POST /api/auth/delete-account
// Raderar ett Supabase auth-konto server-side med service-role-nyckel.
// Värderingar anonymiseras av klienten (user_id = NULL) innan detta anropas.
// Kräver miljövariabel: SUPABASE_SERVICE_ROLE_KEY (aldrig i frontend)

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId krävs' });

  if (!SERVICE_ROLE) {
    // Om service-role-nyckeln saknas i miljön — logga och returnera fel
    console.error('[delete-account] SUPABASE_SERVICE_ROLE_KEY saknas');
    return res.status(500).json({ error: 'Serverkonfiguration saknas' });
  }

  try {
    // Admin-klient med service-role — har rätt att radera auth-användare
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[delete-account]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
