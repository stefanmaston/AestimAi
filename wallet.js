/**
 * AestimAi — MetaMask / wallet-integration
 * Använder window.ethereum direkt + viem via ESM CDN
 * för kontraktsläsning från Base Sepolia.
 */

import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  formatUnits,
} from 'https://esm.sh/viem@2.21.15';

import {
  baseSepolia,
  base,
} from 'https://esm.sh/viem@2.21.15/chains';

// ── Kontraktsadress (fylls i efter deploy) ─────────────────
// Sätts dynamiskt om deployment.json laddas, annars tomt
let UCI_CONTRACT_ADDRESS = null;

const UCI_ABI = [
  {
    name: 'getCurrentRate',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'rateSEK', type: 'uint256' },
      { name: 'rateEUR', type: 'uint256' },
      { name: 'rateUSD', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
  {
    name: 'historyLength',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getRecentHistory',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'n', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple[]',
      components: [
        { name: 'rateSEK',   type: 'uint256' },
        { name: 'rateEUR',   type: 'uint256' },
        { name: 'rateUSD',   type: 'uint256' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'source',    type: 'string'  },
      ],
    }],
  },
  {
    name: 'updateCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

// ── Base Sepolia nätverkskonfiguration ─────────────────────
const BASE_SEPOLIA_PARAMS = {
  chainId:         '0x14A34',   // 84532 decimalt
  chainName:       'Base Sepolia',
  nativeCurrency:  { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls:         ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};

// ── State ──────────────────────────────────────────────────
export const wallet = {
  address:       null,
  chainId:       null,
  isConnected:   false,
  isOnBase:      false,
  publicClient:  null,
  walletClient:  null,
  onUpdate:      null,   // callback när state ändras
};

// ── Hjälpfunktioner ────────────────────────────────────────

export function shortAddress(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export function isMetaMaskInstalled() {
  return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
}

function getChain(chainId) {
  return chainId === 8453 ? base : baseSepolia;
}

function notify() {
  if (typeof wallet.onUpdate === 'function') wallet.onUpdate({ ...wallet });
}

// ── Anslut wallet ──────────────────────────────────────────

export async function connectWallet() {
  if (!isMetaMaskInstalled()) {
    window.open('https://metamask.io/download/', '_blank');
    throw new Error('MetaMask är inte installerat');
  }

  // Begär åtkomst till konton
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) throw new Error('Inga konton valda');

  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
  const chainId    = parseInt(chainIdHex, 16);

  wallet.address     = accounts[0];
  wallet.chainId     = chainId;
  wallet.isConnected = true;
  wallet.isOnBase    = chainId === 84532 || chainId === 8453;

  wallet.walletClient = createWalletClient({
    account:   wallet.address,
    chain:     getChain(chainId),
    transport: custom(window.ethereum),
  });

  wallet.publicClient = createPublicClient({
    chain:     getChain(chainId),
    transport: wallet.isOnBase
      ? http('https://sepolia.base.org')
      : http('https://sepolia.base.org'),   // fallback alltid till Sepolia för läsning
  });

  setupEventListeners();
  notify();
  return wallet;
}

// ── Koppla från ────────────────────────────────────────────

export function disconnectWallet() {
  wallet.address     = null;
  wallet.chainId     = null;
  wallet.isConnected = false;
  wallet.isOnBase    = false;
  wallet.walletClient = null;
  notify();
}

// ── Byt till Base Sepolia ──────────────────────────────────

export async function switchToBaseSepolia() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_SEPOLIA_PARAMS.chainId }],
    });
  } catch (err) {
    // Nätverk finns inte i MetaMask → lägg till det
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [BASE_SEPOLIA_PARAMS],
      });
    } else {
      throw err;
    }
  }
}

// ── Läs on-chain UCI-index ─────────────────────────────────

export async function readOnChainUCI() {
  if (!UCI_CONTRACT_ADDRESS) return null;

  // Använd alltid en publik RPC för läsning (behöver ingen wallet)
  const client = createPublicClient({
    chain:     baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  try {
    const [rateSEK, rateEUR, rateUSD, timestamp] = await client.readContract({
      address:      UCI_CONTRACT_ADDRESS,
      abi:          UCI_ABI,
      functionName: 'getCurrentRate',
    });

    const updateCount = await client.readContract({
      address:      UCI_CONTRACT_ADDRESS,
      abi:          UCI_ABI,
      functionName: 'updateCount',
    });

    return {
      rateSEK:     Number(rateSEK) / 100,
      rateEUR:     Number(rateEUR) / 100,
      rateUSD:     Number(rateUSD) / 100,
      timestamp:   Number(timestamp),
      updateCount: Number(updateCount),
      contractAddress: UCI_CONTRACT_ADDRESS,
    };
  } catch (err) {
    console.warn('[wallet] Kunde inte läsa on-chain UCI:', err.message);
    return null;
  }
}

// ── Hämta ETH-saldo ────────────────────────────────────────

export async function getBalance() {
  if (!wallet.address || !wallet.publicClient) return null;
  try {
    const bal = await wallet.publicClient.getBalance({ address: wallet.address });
    return parseFloat(formatUnits(bal, 18)).toFixed(4);
  } catch {
    return null;
  }
}

// ── Lyssna på MetaMask-events ─────────────────────────────

function setupEventListeners() {
  if (!window.ethereum) return;

  window.ethereum.removeAllListeners?.('accountsChanged');
  window.ethereum.removeAllListeners?.('chainChanged');

  window.ethereum.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      wallet.address = accounts[0];
      if (wallet.walletClient) {
        wallet.walletClient = createWalletClient({
          account:   wallet.address,
          chain:     getChain(wallet.chainId),
          transport: custom(window.ethereum),
        });
      }
      notify();
    }
  });

  window.ethereum.on('chainChanged', (chainIdHex) => {
    const chainId    = parseInt(chainIdHex, 16);
    wallet.chainId   = chainId;
    wallet.isOnBase  = chainId === 84532 || chainId === 8453;
    if (wallet.walletClient) {
      wallet.walletClient = createWalletClient({
        account:   wallet.address,
        chain:     getChain(chainId),
        transport: custom(window.ethereum),
      });
    }
    notify();
  });
}

// ── Ladda kontraktsadress automatiskt ─────────────────────

export async function loadContractAddress() {
  try {
    const res  = await fetch('./blockchain/deployment.json');
    if (!res.ok) return null;
    const data = await res.json();
    UCI_CONTRACT_ADDRESS = data.contractAddress;
    return UCI_CONTRACT_ADDRESS;
  } catch {
    return null;
  }
}

// ── Auto-återanslut om redan godkänd ──────────────────────

export async function autoConnect() {
  if (!isMetaMaskInstalled()) return null;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts.length > 0) {
      return await connectWallet();
    }
  } catch {
    // tyst fel — användaren har inte godkänt än
  }
  return null;
}
