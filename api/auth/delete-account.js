// POST /api/auth/delete-account
// Raderar ett Supabase auth-konto server-side med service-role-nyckel.
// Värderingar anonymiseras av klienten (user_id = NULL) innan detta anropas.
// Kräver miljövariabel: SUPABASE_SERVICE_ROLE_KEY (aldrig i frontend)
// Kräver Authorization: Bearer <access_token> som matchar userId i body.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_EJWkHcLuQmbEnwAGkaEANg_6rue2HsZ';
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Inloggning krävs' });
  }

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId krävs' });

  if (!SERVICE_ROLE) {
    console.error('[delete-account] SUPABASE_SERVICE_ROLE_KEY saknas');
    return res.status(500).json({ error: 'Serverkonfiguration saknas' });
  }

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Ogiltig session' });
    }
    if (user.id !== userId) {
      return res.status(403).json({ error: 'Du kan bara radera ditt eget konto' });
    }

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
