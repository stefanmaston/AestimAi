// AestimAi Lab — produktdata med Amazon affiliate-länkar
// GET /api/shop/products
// Returnerar produktlista med affiliate-länk till amazon.se

const AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || 'aestimai21-21';

// Produktkatalog med Amazon-söktermer och ASIN (verifieras via amazon.se)
const PRODUCTS = [
  {
    id: 'shelly-pro-3em',
    name: 'Shelly Pro 3EM',
    icon: '⚡',
    category: 'energy',
    categoryLabel: 'Energi',
    description: 'Trefas energimätare med WiFi och lokal API. Mät exakt förbrukning i realtid och exportera data till UCI-plattformen.',
    specs: ['3-fas upp till 120A', 'REST + MQTT API', 'DIN-skena'],
    priceSEK: '1 890',
    priceUCI: '18,9',
    asin: 'B09NTPS54L',
    searchQuery: 'Shelly Pro 3EM energimätare',
  },
  {
    id: 'victron-smartshunt',
    name: 'Victron SmartShunt 500A',
    icon: '☀️',
    category: 'energy',
    categoryLabel: 'Energi',
    description: 'Batteriövervakare med Bluetooth för solcellssystem. Spåra energiflöden och beräkna UCI-värde på egenproducerad energi.',
    specs: ['500A kontinuerlig mätning', 'Bluetooth + VE.Direct', 'Victron Connect app'],
    priceSEK: '1 290',
    priceUCI: '12,9',
    asin: 'B08GQFVKBR',
    searchQuery: 'Victron SmartShunt 500A',
  },
  {
    id: 'acr122u-nfc',
    name: 'ACR122U NFC-läsare',
    icon: '📡',
    category: 'nfc',
    categoryLabel: 'NFC & Handel',
    description: 'USB NFC-läsare/skrivare. Skriv UCI-transaktioner till NFC-taggar för offline-handel på bytesmarknaden.',
    specs: ['ISO 14443 A/B, Mifare', 'USB-A, drivrutinsfri', 'SDK medföljer'],
    priceSEK: '590',
    priceUCI: '5,9',
    asin: 'B07KRKPWYC',
    searchQuery: 'ACR122U NFC reader',
  },
  {
    id: 'ntag215-50pack',
    name: 'NTAG215 NFC-taggar (50-pack)',
    icon: '🏷️',
    category: 'nfc',
    categoryLabel: 'NFC & Handel',
    description: 'Högkapacitets NFC-taggar. Märk varor på bytesmarknaden med UCI-värde och ursprung.',
    specs: ['504 bytes EEPROM', 'ISO/IEC 14443-3 Type A', '30mm runda etiketter'],
    priceSEK: '290',
    priceUCI: '2,9',
    asin: 'B07MFZLM4X',
    searchQuery: 'NTAG215 NFC stickers 50',
  },
  {
    id: 'rpi5-starter',
    name: 'Raspberry Pi 5 (4GB)',
    icon: '🖥️',
    category: 'compute',
    categoryLabel: 'Datorkraft',
    description: 'Kör din egna UCI-nod, lokal värderingsserver eller bytesmarknads-gateway.',
    specs: ['Raspberry Pi 5, 4GB RAM', 'Quad-core Cortex-A76', 'USB 3.0 + PCIe'],
    priceSEK: '899',
    priceUCI: '9,0',
    asin: 'B0CK4SLHFQ',
    searchQuery: 'Raspberry Pi 5 4GB',
  },
  {
    id: 'ruuvitag-4pack',
    name: 'Ruuvi Tag (4-pack)',
    icon: '📊',
    category: 'iot',
    categoryLabel: 'IoT & Sensorer',
    description: 'Öppen källkod Bluetooth-sensorer. Spåra miljövärden för UCI-prissättning av råvaror.',
    specs: ['Temp, fuktig, tryck, rörelse', 'Bluetooth 5, 2+ år batteri', 'IP67 vattentät'],
    priceSEK: '990',
    priceUCI: '9,9',
    asin: null,
    searchQuery: 'Ruuvi Tag sensor 4-pack',
  },
  {
    id: 'yubikey-5c-nfc',
    name: 'YubiKey 5C NFC',
    icon: '🔑',
    category: 'security',
    categoryLabel: 'Säkerhet',
    description: 'Hardware security key med NFC och USB-C. WebAuthn/FIDO2 för UCI-kontoinloggning utan lösenord.',
    specs: ['USB-C + NFC', 'FIDO2, WebAuthn, TOTP', 'IP68 vattentät'],
    priceSEK: '590',
    priceUCI: '5,9',
    asin: 'B08DHL1YDL',
    searchQuery: 'YubiKey 5C NFC',
  },
  {
    id: 'ledger-nano-x',
    name: 'Ledger Nano X',
    icon: '🔐',
    category: 'security',
    categoryLabel: 'Säkerhet',
    description: 'Hårdvaruplånbok med Bluetooth för säker signering av UCI-transaktioner och förvaring av kryptografiska nycklar.',
    specs: ['Bluetooth + USB-C', 'CC EAL5+ certifierad chip', 'Stöd för 5500+ kryptotillgångar'],
    priceSEK: '1 290',
    priceUCI: '12,9',
    asin: 'B07M6R4NK3',
    searchQuery: 'Ledger Nano X hardware wallet',
  },
  {
    id: 'aranet4-co2',
    name: 'Aranet4 CO₂-mätare',
    icon: '🌿',
    category: 'iot',
    categoryLabel: 'IoT & Sensorer',
    description: 'Portabel CO₂/luftkvalitetsmätare. Rapportera miljödata direkt till UCI:s ESG-kategori.',
    specs: ['CO₂, temp, fuktighet, alarm', 'E-ink display, 4 år batteri', 'Bluetooth + öppen API'],
    priceSEK: '2 190',
    priceUCI: '21,9',
    asin: 'B093M9HWML',
    searchQuery: 'Aranet4 CO2 monitor',
  },
  {
    id: 'dragino-lgt92',
    name: 'Dragino LGT-92 GPS Tracker',
    icon: '📦',
    category: 'iot',
    categoryLabel: 'IoT & Sensorer',
    description: 'LoRa GPS-tracker med lång räckvidd. Spåra varor på bytesmarknaden utan WiFi-beroende.',
    specs: ['LoRaWAN + GPS', '10km+ räckvidd', 'Upp till 1 år batteri'],
    priceSEK: '890',
    priceUCI: '8,9',
    asin: null,
    searchQuery: 'Dragino LGT-92 LoRa GPS tracker',
  },
];

function amazonLink(product) {
  const tag = AFFILIATE_TAG ? `&tag=${AFFILIATE_TAG}` : '';
  if (product.asin) {
    return `https://www.amazon.se/dp/${product.asin}?${tag ? tag.slice(1) : ''}`;
  }
  // Fallback: söksida
  return `https://www.amazon.se/s?k=${encodeURIComponent(product.searchQuery)}${tag}`;
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const products = PRODUCTS.map(p => ({
    ...p,
    buyUrl: amazonLink(p),
    affiliate: true,
    source: 'amazon.se',
  }));

  res.status(200).json({ products });
};
