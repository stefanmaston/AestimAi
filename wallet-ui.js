/**
 * AestimAi — Wallet UI
 * Binder wallet.js till DOM-element.
 * Körs som ES-modul för att stödja top-level imports.
 */

import {
  connectWallet,
  disconnectWallet,
  switchToBaseSepolia,
  readOnChainUCI,
  loadContractAddress,
  autoConnect,
  getBalance,
  shortAddress,
  isMetaMaskInstalled,
  wallet,
} from './wallet.js';

function wtr(key, vars, fb) {
  if (typeof window.str === 'function') return window.str(key, vars, fb);
  let s = window.AestimI18n?.t?.(key) || fb || key;
  if (vars && s) Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(String(v)); });
  return s;
}

function walletLocale() {
  return window.AestimI18n?.localeTag?.() || 'en-US';
}

// ── DOM-referenser ─────────────────────────────────────────

const btnConnect      = document.getElementById('btnConnectWallet');
const btnDisconnect   = document.getElementById('btnDisconnectWallet');
const btnSwitch       = document.getElementById('btnSwitchNetwork');
const btnRefreshChain = document.getElementById('btnRefreshChain');

const walletDisconnected = document.getElementById('walletDisconnected');
const walletConnected    = document.getElementById('walletConnected');
const walletAddressEl    = document.getElementById('walletAddress');
const walletNetworkEl    = document.getElementById('walletNetwork');
const walletBalanceEl    = document.getElementById('walletBalance');
const walletDotEl        = document.getElementById('walletDot');

const onchainNoWallet   = document.getElementById('onchainNoWallet');
const onchainNoContract = document.getElementById('onchainNoContract');
const onchainData       = document.getElementById('onchainData');

const tickerOnchain  = document.getElementById('tickerOnchain');
const tickerChainLabel = document.getElementById('tickerChainLabel');
const panelTickerValue = document.getElementById('panelTickerValue');
const panelTickerSub   = document.getElementById('panelTickerSub');

// ── Rendera wallet-state ────────────────────────────────────

function renderWallet(w) {
  if (!w.isConnected) {
    walletDisconnected?.classList.remove('hidden');
    walletConnected?.classList.add('hidden');
    btnSwitch?.classList.add('hidden');
    showOnchainState('no-wallet');
    return;
  }

  walletDisconnected?.classList.add('hidden');
  walletConnected?.classList.remove('hidden');

  // Adress
  if (walletAddressEl) walletAddressEl.textContent = shortAddress(w.address);

  // Nätverk
  const networkName = w.chainId === 8453   ? 'Base Mainnet'
    : w.chainId === 84532  ? 'Base Sepolia'
    : `Chain ${w.chainId}`;
  if (walletNetworkEl) walletNetworkEl.textContent = networkName;

  // Statusdot
  if (walletDotEl) {
    walletDotEl.className = 'wallet-dot ' + (w.isOnBase ? 'on-base' : 'wrong-network');
  }

  // Visa "byt nätverk"-knapp om inte på Base
  if (btnSwitch) btnSwitch.classList.toggle('hidden', w.isOnBase);

  // Hämta saldo asynkront
  getBalance().then(bal => {
    if (walletBalanceEl && bal !== null) walletBalanceEl.textContent = bal + ' ETH';
  });

  // On-chain panel
  showOnchainState('loading');
  readOnChainUCI().then(data => {
    if (!data) {
      showOnchainState('no-contract');
    } else {
      renderOnchainData(data);
    }
  });
}

// ── On-chain UCI-panel ──────────────────────────────────────

function showOnchainState(state) {
  onchainNoWallet?.classList.toggle('hidden',   state !== 'no-wallet');
  onchainNoContract?.classList.toggle('hidden', state !== 'no-contract');
  onchainData?.classList.toggle('hidden',       state !== 'data');
}

function renderOnchainData(data) {
  showOnchainState('data');

  document.getElementById('chainSEK').textContent     = data.rateSEK.toFixed(2) + ' SEK';
  document.getElementById('chainEUR').textContent     = data.rateEUR.toFixed(2) + ' EUR';
  document.getElementById('chainUSD').textContent     = data.rateUSD.toFixed(2) + ' USD';
  document.getElementById('chainUpdates').textContent = data.updateCount;

  const ts = new Date(data.timestamp * 1000);
  document.getElementById('chainTimestamp').textContent =
    wtr('wallet.chainUpdated', { date: ts.toLocaleString(walletLocale()) }, 'Updated: ' + ts.toLocaleString(walletLocale()));

  const link = document.getElementById('chainExplorerLink');
  if (link) {
    link.href = `https://sepolia.basescan.org/address/${data.contractAddress}`;
  }

  // Uppdatera ticker i höger panel
  if (panelTickerValue) panelTickerValue.textContent = `1 UCI = ${data.rateSEK.toFixed(2)} SEK`;
  if (panelTickerSub)   panelTickerSub.textContent   = `≈ €${data.rateEUR.toFixed(2)} / $${data.rateUSD.toFixed(2)}`;
  if (tickerOnchain)    tickerOnchain.classList.remove('hidden');
  if (tickerChainLabel) tickerChainLabel.textContent = wtr('wallet.onChainLive', null, '⬡ Live on Base');
}

function resetConnectButton() {
  if (!btnConnect) return;
  const label = wtr('wallet.connect', null, 'Connect MetaMask');
  const icon = btnConnect.querySelector('.wallet-icon');
  if (icon) btnConnect.innerHTML = `<span class="wallet-icon">⬡</span> ${label}`;
  else btnConnect.textContent = label;
  btnConnect.disabled = false;
}

// ── Event listeners ─────────────────────────────────────────

btnConnect?.addEventListener('click', async () => {
  if (!isMetaMaskInstalled()) {
    window.open('https://metamask.io/download/', '_blank');
    showToastWallet(wtr('wallet.toastNotInstalled', null, 'MetaMask is not installed — opening download page'));
    return;
  }
  btnConnect.textContent = wtr('wallet.connecting', null, 'Connecting…');
  btnConnect.disabled    = true;
  try {
    await connectWallet();
  } catch (err) {
    showToastWallet(wtr('wallet.toastConnectFailed', { msg: err.message }, 'Could not connect: ' + err.message));
    resetConnectButton();
  }
});

btnDisconnect?.addEventListener('click', () => {
  disconnectWallet();
  showToastWallet(wtr('wallet.toastDisconnected', null, 'Wallet disconnected'));
});

btnSwitch?.addEventListener('click', async () => {
  btnSwitch.textContent = wtr('wallet.switching', null, 'Switching…');
  try {
    await switchToBaseSepolia();
    showToastWallet(wtr('wallet.toastSwitched', null, '✓ Connected to Base Sepolia'));
  } catch (err) {
    showToastWallet(wtr('wallet.toastSwitchFailed', { msg: err.message }, 'Could not switch network: ' + err.message));
  }
  btnSwitch.textContent = wtr('wallet.switchNetwork', null, 'Switch to Base Sepolia');
});

btnRefreshChain?.addEventListener('click', async () => {
  btnRefreshChain.textContent = wtr('wallet.refreshing', null, '↻ Loading…');
  btnRefreshChain.disabled    = true;
  const data = await readOnChainUCI();
  if (data) {
    renderOnchainData(data);
    showToastWallet(wtr('wallet.toastChainUpdated', null, 'On-chain UCI updated'));
  } else {
    showToastWallet(wtr('wallet.toastNoContract', null, 'Contract is not deployed yet'));
  }
  btnRefreshChain.textContent = wtr('wallet.refreshChain', null, '↻ Refresh');
  btnRefreshChain.disabled    = false;
});

// ── Wallet-callback ─────────────────────────────────────────

wallet.onUpdate = renderWallet;

// ── Toast (lokal, undviker cirkulärt beroende med app.js) ───

function showToastWallet(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  t.style.cssText = `
    position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);
    background:var(--green);color:#fff;padding:0.75rem 1.5rem;
    border-radius:999px;font-size:0.95rem;font-weight:500;
    box-shadow:0 4px 20px rgba(0,0,0,0.18);z-index:999;
    animation:fadeIn 0.2s ease;
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Init ────────────────────────────────────────────────────

async function init() {
  await loadContractAddress();
  renderWallet(wallet);
  const w = await autoConnect();
  if (w) {
    showToastWallet(wtr('wallet.toastReconnected', { address: shortAddress(w.address) }, '✓ Wallet reconnected: ' + shortAddress(w.address)));
  }
}

init();
