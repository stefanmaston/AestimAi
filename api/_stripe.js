// Lazy Stripe-klient — undviker krasch vid modulladdning om nyckel saknas.

let _client = null;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_client) _client = require('stripe')(key);
  return _client;
}

function requireStripe(res) {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: 'Betalningssystemet är inte konfigurerat ännu.' });
    return null;
  }
  return stripe;
}

module.exports = { getStripe, requireStripe };
