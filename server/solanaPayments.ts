import { Connection, PublicKey, ParsedTransactionWithMeta, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'mainnet-beta';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || (
  SOLANA_CLUSTER === 'devnet' 
    ? 'https://api.devnet.solana.com' 
    : 'https://api.mainnet-beta.solana.com'
);

const SOLANA_USDC_MINT = process.env.SOLANA_USDC_MINT || (
  SOLANA_CLUSTER === 'devnet'
    ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

const USDC_DECIMALS = 6;
const SOL_USD_PRICE_FIXED = process.env.SOL_USD_PRICE ? parseFloat(process.env.SOL_USD_PRICE) : null;

let cachedSolPrice: { price: number; timestamp: number } | null = null;
const SOL_PRICE_CACHE_DURATION = 5 * 60 * 1000;

export function isSolanaPaymentsEnabled(): boolean {
  return process.env.ENABLE_SOLANA_PAYMENTS === 'true';
}

export function getSolanaCluster(): string {
  return SOLANA_CLUSTER;
}

export function getSolanaUsdcMint(): string {
  return SOLANA_USDC_MINT;
}

export async function getSolUsdPrice(): Promise<number | null> {
  if (SOL_USD_PRICE_FIXED) {
    return SOL_USD_PRICE_FIXED;
  }

  if (cachedSolPrice && Date.now() - cachedSolPrice.timestamp < SOL_PRICE_CACHE_DURATION) {
    return cachedSolPrice.price;
  }

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (!response.ok) return null;
    const data = await response.json();
    const price = data.solana?.usd;
    if (price) {
      cachedSolPrice = { price, timestamp: Date.now() };
      return price;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch SOL price:', error);
    return null;
  }
}

export function calculateSolanaUsdcAmount(amountUsd: number): string {
  return amountUsd.toFixed(2);
}

export async function calculateSolAmount(amountUsd: number): Promise<string | null> {
  const solPrice = await getSolUsdPrice();
  if (!solPrice) return null;
  const solAmount = amountUsd / solPrice;
  return solAmount.toFixed(6);
}

function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

export interface SolanaVerificationResult {
  success: boolean;
  error?: string;
  slot?: number;
  blockTime?: number;
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function isValidSolanaTxSignature(signature: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature);
}

export async function verifySolPayment(
  txSignature: string,
  recipientWallet: string,
  expectedAmountSol: string
): Promise<SolanaVerificationResult> {
  try {
    const connection = getConnection();
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { success: false, error: 'Transaction not found or not yet confirmed' };
    }

    if (tx.meta?.err) {
      return { success: false, error: 'Transaction failed' };
    }

    const expectedLamports = Math.floor(parseFloat(expectedAmountSol) * LAMPORTS_PER_SOL);
    
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    const accountKeys = tx.transaction.message.accountKeys;
    
    let recipientReceived = BigInt(0);
    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys[i].pubkey.toBase58();
      if (key === recipientWallet) {
        const pre = BigInt(preBalances[i] || 0);
        const post = BigInt(postBalances[i] || 0);
        if (post > pre) {
          recipientReceived = post - pre;
        }
        break;
      }
    }

    if (recipientReceived < BigInt(expectedLamports)) {
      const receivedSol = Number(recipientReceived) / LAMPORTS_PER_SOL;
      return { 
        success: false, 
        error: `Insufficient amount. Expected ${expectedAmountSol} SOL, got ${receivedSol.toFixed(6)} SOL` 
      };
    }

    return {
      success: true,
      slot: tx.slot,
      blockTime: tx.blockTime || undefined,
    };
  } catch (error) {
    console.error('SOL verification error:', error);
    return { success: false, error: 'Failed to verify SOL transaction' };
  }
}

export async function verifySolanaUsdcPayment(
  txSignature: string,
  recipientWallet: string,
  expectedAmountUsdc: string
): Promise<SolanaVerificationResult> {
  try {
    const connection = getConnection();
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { success: false, error: 'Transaction not found or not yet confirmed' };
    }

    if (tx.meta?.err) {
      return { success: false, error: 'Transaction failed' };
    }

    const usdcMint = new PublicKey(SOLANA_USDC_MINT);
    const recipientPubkey = new PublicKey(recipientWallet);
    const recipientAta = await getAssociatedTokenAddress(usdcMint, recipientPubkey);

    const expectedAmount = Math.floor(parseFloat(expectedAmountUsdc) * Math.pow(10, USDC_DECIMALS));

    const preTokenBalances = tx.meta?.preTokenBalances || [];
    const postTokenBalances = tx.meta?.postTokenBalances || [];

    let recipientReceived = BigInt(0);

    for (const postBalance of postTokenBalances) {
      if (postBalance.mint !== SOLANA_USDC_MINT) continue;
      if (postBalance.owner !== recipientWallet) continue;

      const postAmount = BigInt(postBalance.uiTokenAmount.amount);
      
      const preBalance = preTokenBalances.find(
        pre => pre.accountIndex === postBalance.accountIndex && pre.mint === SOLANA_USDC_MINT
      );
      const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : BigInt(0);

      if (postAmount > preAmount) {
        recipientReceived = postAmount - preAmount;
      }
    }

    if (recipientReceived < BigInt(expectedAmount)) {
      const receivedUsdc = Number(recipientReceived) / Math.pow(10, USDC_DECIMALS);
      return { 
        success: false, 
        error: `Insufficient USDC. Expected ${expectedAmountUsdc}, got ${receivedUsdc.toFixed(2)}` 
      };
    }

    return {
      success: true,
      slot: tx.slot,
      blockTime: tx.blockTime || undefined,
    };
  } catch (error) {
    console.error('Solana USDC verification error:', error);
    return { success: false, error: 'Failed to verify Solana USDC transaction' };
  }
}
