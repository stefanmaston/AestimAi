// UCI Lab — Stripe Checkout Session
// POST /api/shop/checkout  { productId: string, quantity?: number }
// Returns { url: string } — Stripe hosted checkout URL

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Map product IDs to Stripe Price IDs (set real IDs via STRIPE_PRICE_* env vars)
const PRICE_MAP = {
  'shelly-pro-3em':    process.env.STRIPE_PRICE_SHELLY_PRO_3EM    || null,
  'victron-smartshunt': process.env.STRIPE_PRICE_VICTRON_SMARTSHUNT || null,
  'acr122u-nfc':       process.env.STRIPE_PRICE_ACR122U_NFC        || null,
  'ntag215-50pack':    process.env.STRIPE_PRICE_NTAG215_50PACK      || null,
  'rpi5-starter':      process.env.STRIPE_PRICE_RPI5_STARTER        || null,
  'ruuvitag-4pack':    process.env.STRIPE_PRICE_RUUVITAG_4PACK      || null,
  'ledger-nano-x':     process.env.STRIPE_PRICE_LEDGER_NANO_X       || null,
  'aranet4-co2':       process.env.STRIPE_PRICE_ARANET4_CO2         || null,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, quantity = 1 } = req.body || {};

  if (!productId || !PRICE_MAP.hasOwnProperty(productId)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  const priceId = PRICE_MAP[productId];
  if (!priceId) {
    return res.status(503).json({
      error: 'Checkout not yet configured for this product. Contact us to order.',
    });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Payment system not configured' });
  }

  try {
    const origin = req.headers.origin || 'https://aestimai.org';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: Math.max(1, Math.min(10, Number(quantity))) }],
      success_url: `${origin}/?checkout=success&product=${productId}`,
      cancel_url:  `${origin}/?checkout=cancel#ucilab`,
      locale: 'sv',
      shipping_address_collection: {
        allowed_countries: ['SE', 'NO', 'DK', 'FI', 'DE', 'NL', 'FR', 'GB'],
      },
      metadata: { productId, source: 'uci-lab' },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[shop/checkout]', err.message);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
};
