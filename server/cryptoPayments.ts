import { ethers } from 'ethers';

const BASE_CHAIN_ID = 8453;
const BASE_USDC_CONTRACT = process.env.BASE_USDC_CONTRACT || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const CRYPTO_INVOICE_EXP_MINUTES = parseInt(process.env.CRYPTO_INVOICE_EXP_MINUTES || '20');
const ETH_USD_PRICE_FIXED = process.env.ETH_USD_PRICE ? parseFloat(process.env.ETH_USD_PRICE) : null;

const USDC_DECIMALS = 6;
const USDC_TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

let cachedEthPrice: { price: number; timestamp: number } | null = null;
const ETH_PRICE_CACHE_DURATION = 5 * 60 * 1000;

export function isCryptoPaymentsEnabled(): boolean {
  return process.env.ENABLE_CRYPTO_PAYMENTS === 'true';
}

export function getInvoiceExpirationMinutes(): number {
  return CRYPTO_INVOICE_EXP_MINUTES;
}

export function calculateInvoiceExpiry(): Date {
  return new Date(Date.now() + CRYPTO_INVOICE_EXP_MINUTES * 60 * 1000);
}

export async function getEthUsdPrice(): Promise<number | null> {
  if (ETH_USD_PRICE_FIXED) {
    return ETH_USD_PRICE_FIXED;
  }

  if (cachedEthPrice && Date.now() - cachedEthPrice.timestamp < ETH_PRICE_CACHE_DURATION) {
    return cachedEthPrice.price;
  }

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    if (!response.ok) return null;
    const data = await response.json();
    const price = data.ethereum?.usd;
    if (price) {
      cachedEthPrice = { price, timestamp: Date.now() };
      return price;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch ETH price:', error);
    return null;
  }
}

export function calculateUsdcAmount(amountUsd: number): string {
  return amountUsd.toFixed(2);
}

export async function calculateEthAmount(amountUsd: number): Promise<string | null> {
  const ethPrice = await getEthUsdPrice();
  if (!ethPrice) return null;
  const ethAmount = amountUsd / ethPrice;
  return ethAmount.toFixed(8);
}

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID);
}

export interface VerificationResult {
  success: boolean;
  error?: string;
  blockNumber?: number;
  timestamp?: number;
}

export async function verifyEthPayment(
  txHash: string,
  recipientWallet: string,
  expectedAmountEth: string
): Promise<VerificationResult> {
  try {
    const provider = getProvider();
    const tx = await provider.getTransaction(txHash);
    
    if (!tx) {
      return { success: false, error: 'Transaction not found' };
    }

    if (tx.chainId !== BigInt(BASE_CHAIN_ID)) {
      return { success: false, error: 'Transaction is not on Base network' };
    }

    if (!tx.to || tx.to.toLowerCase() !== recipientWallet.toLowerCase()) {
      return { success: false, error: 'Transaction recipient does not match' };
    }

    const expectedWei = ethers.parseEther(expectedAmountEth);
    if (tx.value < expectedWei) {
      return { success: false, error: `Insufficient amount. Expected ${expectedAmountEth} ETH, got ${ethers.formatEther(tx.value)} ETH` };
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { success: false, error: 'Transaction not yet confirmed' };
    }

    if (receipt.status !== 1) {
      return { success: false, error: 'Transaction failed' };
    }

    const block = await provider.getBlock(receipt.blockNumber);
    
    return {
      success: true,
      blockNumber: receipt.blockNumber,
      timestamp: block?.timestamp
    };
  } catch (error) {
    console.error('ETH verification error:', error);
    return { success: false, error: 'Failed to verify transaction' };
  }
}

export async function verifyUsdcPayment(
  txHash: string,
  recipientWallet: string,
  expectedAmountUsdc: string
): Promise<VerificationResult> {
  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      return { success: false, error: 'Transaction not found or not yet confirmed' };
    }

    if (receipt.status !== 1) {
      return { success: false, error: 'Transaction failed' };
    }

    const transferLog = receipt.logs.find(log => 
      log.address.toLowerCase() === BASE_USDC_CONTRACT.toLowerCase() &&
      log.topics[0] === USDC_TRANSFER_EVENT_SIGNATURE
    );

    if (!transferLog) {
      return { success: false, error: 'No USDC transfer found in transaction' };
    }

    const toAddress = '0x' + transferLog.topics[2].slice(-40);
    if (toAddress.toLowerCase() !== recipientWallet.toLowerCase()) {
      return { success: false, error: 'USDC transfer recipient does not match' };
    }

    const amountRaw = BigInt(transferLog.data);
    const expectedAmount = ethers.parseUnits(expectedAmountUsdc, USDC_DECIMALS);
    
    if (amountRaw < expectedAmount) {
      const receivedAmount = ethers.formatUnits(amountRaw, USDC_DECIMALS);
      return { success: false, error: `Insufficient USDC. Expected ${expectedAmountUsdc}, got ${receivedAmount}` };
    }

    const block = await provider.getBlock(receipt.blockNumber);
    
    return {
      success: true,
      blockNumber: receipt.blockNumber,
      timestamp: block?.timestamp
    };
  } catch (error) {
    console.error('USDC verification error:', error);
    return { success: false, error: 'Failed to verify USDC transaction' };
  }
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}
