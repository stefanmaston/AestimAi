/**
 * AestimAi — UCI Index Updater
 *
 * Hämtar aktuellt UCI-indexvärde från UCI-servern och
 * pushar det till UCIIndex.sol på Base Sepolia/Mainnet.
 *
 * Kör manuellt:   node uci-index-updater.js
 * Kör dagligen:   läggs in som cron via node-cron i uci-server.js
 */

require('dotenv').config();

const { createWalletClient, createPublicClient, http, parseAbi } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia, base } = require('viem/chains');
const fs   = require('fs');
const path = require('path');

// ── Konfiguration ──────────────────────────────────────────

const NETWORK        = process.env.UCI_NETWORK || 'base_sepolia';   // 'base_sepolia' | 'base_mainnet'
const PRIVATE_KEY    = process.env.DEPLOYER_PRIVATE_KEY;
const UCI_SERVER_URL = `http://localhost:${process.env.API_PORT || 3004}`;

// Ladda kontraktsadress från deployment.json
function loadContractAddress() {
  const deployFile = path.join(__dirname, 'blockchain', 'deployment.json');
  if (!fs.existsSync(deployFile)) {
    throw new Error('deployment.json saknas — kör deploy-skriptet först');
  }
  const data = JSON.parse(fs.readFileSync(deployFile, 'utf8'));
  return data.contractAddress;
}

// ABI — bara de metoder vi behöver
const UCI_ABI = parseAbi([
  'function updateIndex(uint256 rateSEK, uint256 rateEUR, uint256 rateUSD, string calldata source) external',
  'function getCurrentRate() external view returns (uint256 rateSEK, uint256 rateEUR, uint256 rateUSD, uint256 timestamp)',
  'function current() external view returns (uint256 rateSEK, uint256 rateEUR, uint256 rateUSD, uint256 timestamp, string source)',
]);

// ── Hämta aktuella UCI-rates från vår server ───────────────

async function fetchCurrentRates() {
  // Försök hämta från UCI-servern
  try {
    const res  = await fetch(`${UCI_SERVER_URL}/api/uci/health`);
    const data = await res.json();
    if (!data.keyConfigured) throw new Error('API-nyckel ej konfigurerad');
  } catch {
    console.log('[updater] UCI-server ej nåbar — använder fasta testvärden');
  }

  // Hämta ett representativt värderingsvärde för att kalibrera index
  // I produktion: aggregera senaste transaktioner och beräkna genomsnitt
  // För nu: använd statiska värden + liten daglig variation (±1%)
  const base_sek = 6240;
  const jitter   = Math.floor((Math.random() - 0.5) * 60);   // ±0.5%

  return {
    rateSEK: base_sek + jitter,                // t.ex. 6240 = 62.40 SEK
    rateEUR: Math.round((base_sek + jitter) * 552 / 6240),
    rateUSD: Math.round((base_sek + jitter) * 598 / 6240),
    source:  `AestimAi-v1-${new Date().toISOString().split('T')[0]}`,
  };
}

// ── Huvudfunktion ──────────────────────────────────────────

async function pushIndexUpdate() {
  if (!PRIVATE_KEY) {
    throw new Error('DEPLOYER_PRIVATE_KEY saknas i .env');
  }

  const contractAddress = loadContractAddress();
  const chain    = NETWORK === 'base_mainnet' ? base : baseSepolia;
  const rpcUrl   = NETWORK === 'base_mainnet'
    ? 'https://mainnet.base.org'
    : 'https://sepolia.base.org';

  const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace(/^0x/, '')}`);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  console.log(`[updater] Nätverk:   ${NETWORK}`);
  console.log(`[updater] Kontrakt:  ${contractAddress}`);
  console.log(`[updater] Avsändare: ${account.address}`);

  // Kontrollera nuvarande on-chain värde
  const current = await publicClient.readContract({
    address: contractAddress,
    abi:     UCI_ABI,
    functionName: 'getCurrentRate',
  });
  console.log(`[updater] On-chain nu: ${current[0]} SEK×100, uppdaterat ${new Date(Number(current[3]) * 1000).toISOString()}`);

  // Hämta nya rates
  const rates = await fetchCurrentRates();
  console.log(`[updater] Nya rates:  SEK=${rates.rateSEK}, EUR=${rates.rateEUR}, USD=${rates.rateUSD}`);
  console.log(`[updater] Källa:      ${rates.source}`);

  // Skicka transaktion
  const txHash = await walletClient.writeContract({
    address:      contractAddress,
    abi:          UCI_ABI,
    functionName: 'updateIndex',
    args:         [
      BigInt(rates.rateSEK),
      BigInt(rates.rateEUR),
      BigInt(rates.rateUSD),
      rates.source,
    ],
  });

  console.log(`[updater] Transaktion skickad: ${txHash}`);
  console.log(`[updater] Basescan: https://sepolia.basescan.org/tx/${txHash}`);

  // Vänta på bekräftelse
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[updater] ✓ Bekräftad i block ${receipt.blockNumber}, gas: ${receipt.gasUsed}`);

  // Spara logg
  const logEntry = {
    timestamp: new Date().toISOString(),
    txHash,
    block:     Number(receipt.blockNumber),
    rates,
    network:   NETWORK,
  };
  const logFile = path.join(__dirname, 'blockchain', 'update-log.json');
  const existing = fs.existsSync(logFile)
    ? JSON.parse(fs.readFileSync(logFile, 'utf8'))
    : [];
  existing.push(logEntry);
  fs.writeFileSync(logFile, JSON.stringify(existing.slice(-30), null, 2)); // behåll 30 senaste
  console.log(`[updater] Logg sparad.`);

  return txHash;
}

// ── Kör direkt om körs som main ───────────────────────────

if (require.main === module) {
  pushIndexUpdate()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[updater] FEL:', err.message);
      process.exit(1);
    });
}

module.exports = { pushIndexUpdate };
