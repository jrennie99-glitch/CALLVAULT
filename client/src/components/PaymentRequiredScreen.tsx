import { useState, useEffect } from 'react';
import { DollarSign, Phone, Video, AlertCircle, CreditCard, Zap, Loader2, Gift, Wallet, Copy, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/Avatar';
import { formatPrice } from '@/lib/policyStorage';
import { toast } from 'sonner';
import type { CallPricing } from '@shared/types';

interface CryptoInvoice {
  invoiceId: string;
  recipientWallet: string;
  chain: 'base' | 'solana';
  asset: 'USDC' | 'ETH' | 'SOL';
  amountAsset: string;
  amountUsd: number;
  expiresAt: string;
}

interface CryptoAvailability {
  base: { enabled: boolean; assets: string[] };
  solana: { enabled: boolean; cluster: string; assets: string[] };
}

interface PaymentRequiredScreenProps {
  recipientAddress: string;
  recipientName?: string;
  pricing: CallPricing;
  isVideo: boolean;
  isTestMode?: boolean;
  callerAddress?: string;
  signMessage?: (message: string) => string;
  onPay: (token?: string) => void;
  onCancel: () => void;
}

export function PaymentRequiredScreen({ 
  recipientAddress, 
  recipientName, 
  pricing, 
  isVideo, 
  isTestMode = false,
  callerAddress,
  signMessage,
  onPay,
  onCancel
}: PaymentRequiredScreenProps) {
  const [loading, setLoading] = useState(false);
  const [hasTrialAccess, setHasTrialAccess] = useState(false);
  const [checkingTrial, setCheckingTrial] = useState(true);
  
  const [showCryptoPayment, setShowCryptoPayment] = useState(false);
  const [cryptoAvailability, setCryptoAvailability] = useState<CryptoAvailability | null>(null);
  const [recipientWallets, setRecipientWallets] = useState<{ evm: string | null; solana: string | null }>({ evm: null, solana: null });
  const [selectedChain, setSelectedChain] = useState<'base' | 'solana'>('base');
  const [selectedAsset, setSelectedAsset] = useState<'USDC' | 'ETH' | 'SOL'>('USDC');
  const [cryptoInvoice, setCryptoInvoice] = useState<CryptoInvoice | null>(null);
  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [ethPriceAvailable, setEthPriceAvailable] = useState(true);
  const [solPriceAvailable, setSolPriceAvailable] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const cryptoEnabled = cryptoAvailability?.base?.enabled || cryptoAvailability?.solana?.enabled;
  const recipientHasWallet = (selectedChain === 'base' && recipientWallets.evm) || (selectedChain === 'solana' && recipientWallets.solana);
  const anyCryptoWallet = recipientWallets.evm || recipientWallets.solana;

  useEffect(() => {
    fetch('/api/crypto/enabled')
      .then(res => res.json())
      .then(data => setCryptoAvailability(data))
      .catch(() => {});
    
    fetch(`/api/crypto/recipient-wallets/${recipientAddress}`)
      .then(res => res.json())
      .then(data => setRecipientWallets(data))
      .catch(() => {});
    
    fetch('/api/crypto/eth-price')
      .then(res => res.json())
      .then(data => setEthPriceAvailable(data.available || false))
      .catch(() => setEthPriceAvailable(false));
    
    fetch('/api/crypto/sol-price')
      .then(res => res.json())
      .then(data => setSolPriceAvailable(data.available || false))
      .catch(() => setSolPriceAvailable(false));
  }, [recipientAddress]);

  useEffect(() => {
    if (callerAddress) {
      fetch(`/api/trial/check/${callerAddress}`)
        .then(res => res.json())
        .then(data => {
          setHasTrialAccess(data.hasAccess || false);
        })
        .catch(() => {})
        .finally(() => setCheckingTrial(false));
    } else {
      setCheckingTrial(false);
    }
  }, [callerAddress]);
  const displayName = recipientName || recipientAddress.slice(0, 16) + '...';
  
  const getPriceDisplay = () => {
    if (pricing.mode === 'per_session') {
      return {
        amount: formatPrice(pricing.session_price_cents || 0),
        amountCents: pricing.session_price_cents || 0,
        description: `${pricing.session_duration_minutes} minute session`,
        pricingType: 'per_session'
      };
    }
    return {
      amount: formatPrice(pricing.per_minute_price_cents || 0),
      amountCents: pricing.per_minute_price_cents || 0,
      description: `per minute (min ${pricing.minimum_minutes} min)`,
      pricingType: 'per_minute'
    };
  };

  const priceInfo = getPriceDisplay();

  const handleCreateCryptoInvoice = async (chain: 'base' | 'solana', asset: 'USDC' | 'ETH' | 'SOL') => {
    setCreatingInvoice(true);
    try {
      const tokenRes = await fetch('/api/checkout/paid-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorAddress: recipientAddress,
          callerAddress: callerAddress,
          amountCents: priceInfo.amountCents,
          callType: isVideo ? 'video' : 'audio',
          pricingType: priceInfo.pricingType,
        }),
      });

      if (!tokenRes.ok) throw new Error('Failed to create payment token');
      const { token } = await tokenRes.json();

      const invoiceRes = await fetch('/api/crypto-invoice/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payTokenId: token,
          chain,
          asset,
          payerCallId: callerAddress,
        }),
      });

      if (!invoiceRes.ok) {
        const error = await invoiceRes.json();
        throw new Error(error.error || 'Failed to create invoice');
      }

      const invoice = await invoiceRes.json();
      setCryptoInvoice(invoice);
      setSelectedChain(chain);
      setSelectedAsset(asset);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create crypto invoice');
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleVerifyCryptoPayment = async () => {
    if (!cryptoInvoice || !txHash.trim()) {
      toast.error('Please enter the transaction hash');
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch('/api/crypto-invoice/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: cryptoInvoice.invoiceId,
          txHash: txHash.trim(),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Verification failed');
      }

      setPaymentVerified(true);
      toast.success('Payment verified!');
      setTimeout(() => onPay(cryptoInvoice.invoiceId), 1500);
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify payment');
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const handlePayment = async () => {
    if (isTestMode) {
      toast.success('Payment simulated (test mode)');
      onPay();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/checkout/paid-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorAddress: recipientAddress,
          callerAddress: callerAddress,
          amountCents: priceInfo.amountCents,
          callType: isVideo ? 'video' : 'audio',
          pricingType: priceInfo.pricingType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url, token } = await response.json();
      
      if (url) {
        window.location.href = url;
      } else {
        onPay(token);
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Failed to start payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" data-testid="payment-required-screen">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-4">
            <Avatar address={recipientAddress} size="lg" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{displayName}</h2>
          
          <div className="flex items-center gap-2 mt-2">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-purple-400" />
            </div>
            <span className="text-slate-300">This call requires payment</span>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Call type</span>
            <span className="text-white flex items-center gap-2">
              {isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              {isVideo ? 'Video' : 'Voice'}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Price</span>
            <span className="text-white font-medium">{priceInfo.amount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Duration</span>
            <span className="text-slate-300 text-sm">{priceInfo.description}</span>
          </div>
        </div>

        {isTestMode && (
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
            <Zap className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-yellow-400 text-sm font-medium">Test Mode</p>
              <p className="text-yellow-400/70 text-xs">No charge — payment is simulated</p>
            </div>
          </div>
        )}

        {pricing.free_first_call && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-4">
            <AlertCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400 text-sm">First call is free for new contacts!</p>
          </div>
        )}

        {!checkingTrial && hasTrialAccess && (
          <div className="mb-4">
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg mb-3">
              <Gift className="w-5 h-5 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-green-400 text-sm font-medium">Trial Access Active</p>
                <p className="text-green-400/70 text-xs">You can use your free trial for this call</p>
              </div>
            </div>
            <Button
              onClick={async () => {
                if (!callerAddress || !signMessage) {
                  toast.error('Unable to use trial access');
                  return;
                }
                setLoading(true);
                try {
                  const minutes = pricing.mode === 'per_session' ? (pricing.session_duration_minutes || 30) : (pricing.minimum_minutes || 1);
                  const timestamp = Date.now();
                  const nonce = Math.random().toString(36).substring(2, 15);
                  const message = `trial:${callerAddress}:${minutes}:${timestamp}:${nonce}`;
                  const signature = signMessage(message);
                  
                  const response = await fetch('/api/trial/consume', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      address: callerAddress,
                      minutes,
                      signature,
                      timestamp,
                      nonce
                    }),
                  });
                  
                  if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to use trial access');
                  }
                  
                  toast.success('Using trial access');
                  onPay('trial');
                } catch (error: any) {
                  toast.error(error.message || 'Failed to use trial access');
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
              disabled={loading || !signMessage}
              data-testid="button-use-trial"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />}
              {loading ? 'Processing...' : 'Use Trial Access'}
            </Button>
          </div>
        )}

        {!showCryptoPayment ? (
          <>
            <div className="flex gap-3 mb-3">
              <Button
                onClick={onCancel}
                variant="outline"
                className="flex-1 border-slate-600"
                disabled={loading}
                data-testid="button-cancel-payment"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePayment}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                disabled={loading}
                data-testid="button-pay-and-call"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                {loading ? 'Processing...' : 'Pay with Card'}
              </Button>
            </div>
            
            {cryptoEnabled && anyCryptoWallet && (
              <Button
                onClick={() => setShowCryptoPayment(true)}
                variant="outline"
                className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                disabled={loading}
                data-testid="button-pay-crypto"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Pay with Crypto (Advanced)
              </Button>
            )}
          </>
        ) : !cryptoInvoice ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0" />
              <p className="text-orange-400 text-xs">Crypto payments are final. Send exact amount to recipient wallet.</p>
            </div>
            
            <div className="flex gap-2 mb-2">
              {cryptoAvailability?.base?.enabled && recipientWallets.evm && (
                <Button
                  onClick={() => setSelectedChain('base')}
                  variant={selectedChain === 'base' ? 'default' : 'outline'}
                  className={selectedChain === 'base' ? 'flex-1 bg-blue-600' : 'flex-1 border-slate-600'}
                  data-testid="button-chain-base"
                >
                  Base
                </Button>
              )}
              {cryptoAvailability?.solana?.enabled && recipientWallets.solana && (
                <Button
                  onClick={() => setSelectedChain('solana')}
                  variant={selectedChain === 'solana' ? 'default' : 'outline'}
                  className={selectedChain === 'solana' ? 'flex-1 bg-purple-600' : 'flex-1 border-slate-600'}
                  data-testid="button-chain-solana"
                >
                  Solana
                </Button>
              )}
            </div>
            
            {selectedChain === 'base' && recipientWallets.evm && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleCreateCryptoInvoice('base', 'USDC')}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={creatingInvoice}
                  data-testid="button-pay-usdc-base"
                >
                  {creatingInvoice && selectedAsset === 'USDC' && selectedChain === 'base' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-2">💲</span>
                  )}
                  USDC
                </Button>
                <Button
                  onClick={() => handleCreateCryptoInvoice('base', 'ETH')}
                  className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={creatingInvoice || !ethPriceAvailable}
                  data-testid="button-pay-eth"
                >
                  {creatingInvoice && selectedAsset === 'ETH' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-2">Ξ</span>
                  )}
                  {ethPriceAvailable ? 'ETH' : 'ETH N/A'}
                </Button>
              </div>
            )}
            
            {selectedChain === 'solana' && recipientWallets.solana && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleCreateCryptoInvoice('solana', 'USDC')}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={creatingInvoice}
                  data-testid="button-pay-usdc-solana"
                >
                  {creatingInvoice && selectedAsset === 'USDC' && selectedChain === 'solana' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-2">💲</span>
                  )}
                  USDC
                </Button>
                <Button
                  onClick={() => handleCreateCryptoInvoice('solana', 'SOL')}
                  className="bg-purple-600 hover:bg-purple-700"
                  disabled={creatingInvoice || !solPriceAvailable}
                  data-testid="button-pay-sol"
                >
                  {creatingInvoice && selectedAsset === 'SOL' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-2">◎</span>
                  )}
                  {solPriceAvailable ? 'SOL' : 'SOL N/A'}
                </Button>
              </div>
            )}
            
            {!recipientHasWallet && (
              <div className="text-center text-slate-400 text-sm py-2">
                Recipient doesn't have a verified {selectedChain === 'solana' ? 'Solana' : 'EVM'} wallet
              </div>
            )}
            
            <Button
              onClick={() => setShowCryptoPayment(false)}
              variant="outline"
              className="w-full border-slate-600"
              data-testid="button-back-to-card"
            >
              Back to Card Payment
            </Button>
          </div>
        ) : paymentVerified ? (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-green-400 font-medium">Payment Verified!</p>
            <p className="text-slate-400 text-sm">Connecting your call...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-sm">Network</span>
                <span className="text-white font-medium capitalize">{cryptoInvoice.chain}</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-sm">Asset</span>
                <span className="text-white font-medium">{cryptoInvoice.asset}</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-sm">Amount</span>
                <span className="text-white font-bold text-lg">
                  {cryptoInvoice.amountAsset} {cryptoInvoice.asset}
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-sm">Send to</span>
                <button
                  onClick={() => copyToClipboard(cryptoInvoice.recipientWallet, 'Address')}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                  data-testid="button-copy-wallet"
                >
                  {cryptoInvoice.recipientWallet.slice(0, 8)}...{cryptoInvoice.recipientWallet.slice(-6)}
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Expires</span>
                <span className="text-orange-400 text-sm flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(cryptoInvoice.expiresAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
            
            <div>
              <label className="text-slate-400 text-sm mb-1 block">
                Transaction {cryptoInvoice.chain === 'solana' ? 'Signature' : 'Hash'}
              </label>
              <Input
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder={cryptoInvoice.chain === 'solana' ? 'Enter Solana tx signature...' : '0x...'}
                className="bg-slate-900/50 border-slate-600 text-white"
                data-testid="input-tx-hash"
              />
            </div>
            
            <Button
              onClick={handleVerifyCryptoPayment}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
              disabled={verifying || !txHash.trim()}
              data-testid="button-verify-payment"
            >
              {verifying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              {verifying ? 'Verifying...' : "I've Paid - Verify"}
            </Button>
            
            <Button
              onClick={() => {
                setCryptoInvoice(null);
                setTxHash('');
              }}
              variant="outline"
              className="w-full border-slate-600"
              data-testid="button-different-asset"
            >
              Use Different Asset
            </Button>
            
            <a
              href={cryptoInvoice.chain === 'solana' ? 'https://solscan.io' : 'https://basescan.org'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
            >
              View on {cryptoInvoice.chain === 'solana' ? 'Solscan' : 'BaseScan'} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
