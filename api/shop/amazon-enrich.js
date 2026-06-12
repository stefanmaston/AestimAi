// Enrich shop catalog with live Amazon data (images, titles, prices) via PA-API 5.
const { GetItemsV2, SearchItemsV2 } = require('amazon-paapi');

function getCredentials() {
  const accessKey = process.env.AMAZON_PAAPI_ACCESS_KEY
    || process.env.AMAZON_ACCESS_KEY_ID
    || process.env.PAAPI_ACCESS_KEY;
  const secretKey = process.env.AMAZON_PAAPI_SECRET_KEY
    || process.env.AMAZON_SECRET_ACCESS_KEY
    || process.env.PAAPI_SECRET_KEY;
  const partnerTag = process.env.AMAZON_AFFILIATE_TAG
    || process.env.AMAZON_PARTNER_TAG
    || 'aestimai21-21';

  if (!accessKey || !secretKey) return null;

  return {
    AccessKey: accessKey,
    SecretKey: secretKey,
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Marketplace: process.env.AMAZON_MARKETPLACE || 'www.amazon.se',
  };
}

const RESOURCES = [
  'Images.Primary.Large',
  'Images.Primary.Medium',
  'ItemInfo.Title',
  'OffersV2.Listings.Price',
];

function parseItem(item) {
  if (!item) return null;
  const imageUrl = item?.Images?.Primary?.Large?.URL
    || item?.Images?.Primary?.Medium?.URL
    || null;
  const title = item?.ItemInfo?.Title?.DisplayValue || null;
  const listing = item?.OffersV2?.Listings?.[0] || item?.Offers?.Listings?.[0];
  const money = listing?.Price?.Money || listing?.Price;
  const priceDisplay = money?.DisplayAmount || listing?.Price?.DisplayAmount || null;
  const priceAmount = money?.Amount ?? listing?.Price?.Amount ?? null;
  const currency = money?.Currency || listing?.Price?.Currency || 'SEK';

  return {
    imageUrl,
    title,
    priceDisplay,
    priceAmount,
    currency,
    asin: item.ASIN || null,
  };
}

function formatSekPrice(parsed) {
  if (!parsed?.priceDisplay) return null;
  const raw = String(parsed.priceDisplay).replace(/\s*kr\s*$/i, '').trim();
  return raw || null;
}

async function fetchItemsByAsin(creds, asins) {
  const map = {};
  if (!asins.length) return map;

  for (let i = 0; i < asins.length; i += 10) {
    const batch = asins.slice(i, i + 10);
    try {
      const data = await GetItemsV2(creds, {
        ItemIds: batch,
        ItemIdType: 'ASIN',
        Condition: 'New',
        Resources: RESOURCES,
      });
      for (const item of data?.ItemsResult?.Items || []) {
        const parsed = parseItem(item);
        if (item?.ASIN && parsed) map[item.ASIN] = parsed;
      }
    } catch (err) {
      console.error('[shop/amazon] GetItemsV2 failed:', err?.message || err);
    }
  }

  return map;
}

async function searchItem(creds, query) {
  if (!query) return null;
  try {
    const data = await SearchItemsV2(creds, {
      Keywords: query,
      SearchIndex: 'All',
      ItemCount: 1,
      Resources: RESOURCES,
    });
    return parseItem(data?.SearchResult?.Items?.[0]);
  } catch (err) {
    console.error('[shop/amazon] SearchItemsV2 failed:', query, err?.message || err);
    return null;
  }
}

async function enrichProducts(products) {
  const creds = getCredentials();
  if (!creds) {
    return { products, live: false, reason: 'missing_credentials' };
  }

  const asins = products.map(p => p.asin).filter(Boolean);
  const asinMap = await fetchItemsByAsin(creds, asins);

  const enriched = [];
  for (const product of products) {
    let live = product.asin ? asinMap[product.asin] : null;
    if (!live && product.searchQuery) {
      live = await searchItem(creds, product.searchQuery);
    }

    if (!live) {
      enriched.push(product);
      continue;
    }

    const priceSEK = formatSekPrice(live) || product.priceSEK;
    enriched.push({
      ...product,
      name: live.title || product.name,
      imageUrl: live.imageUrl || null,
      priceSEK,
      priceLive: !!live.priceDisplay,
      asin: live.asin || product.asin,
    });
  }

  return { products: enriched, live: true };
}

module.exports = { getCredentials, enrichProducts };
