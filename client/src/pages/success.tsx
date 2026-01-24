import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Smartphone, Download, Share, MoreVertical, Plus, ExternalLink, Loader2 } from 'lucide-react';

interface VerifyResult {
  success: boolean;
  plan?: string;
  email?: string;
  error?: string;
}

export default function SuccessPage() {
  const [, navigate] = useLocation();
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setPlatform('ios');
    } else if (/android/.test(userAgent)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    
    if (sessionId) {
      verifySession(sessionId);
    } else {
      setVerifyResult({ success: false, error: 'No session ID provided. Please complete payment first.' });
      setIsLoading(false);
    }
  }, []);

  const verifySession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/billing/verify-session?session_id=${sessionId}`);
      const data = await response.json();
      
      if (response.ok) {
        setVerifyResult({ success: true, plan: data.plan, email: data.email });
      } else {
        setVerifyResult({ success: false, error: data.error || 'Verification failed' });
      }
    } catch (error) {
      setVerifyResult({ success: false, error: 'Failed to verify payment' });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800 border-slate-700">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 text-emerald-500 animate-spin mb-4" />
            <p className="text-slate-300">Verifying your payment...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!verifyResult?.success) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800 border-slate-700">
          <CardHeader className="text-center">
            <CardTitle className="text-red-400">Payment Verification Failed</CardTitle>
            <CardDescription className="text-slate-400">
              {verifyResult?.error || 'Unable to verify your payment'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => navigate('/pricing')} 
              className="w-full"
              data-testid="button-retry-payment"
            >
              Try Again
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/app')} 
              className="w-full"
              data-testid="button-go-to-app"
            >
              Go to App
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-slate-800 border-slate-700">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-10 w-10 text-emerald-400" />
          </div>
          <CardTitle className="text-2xl text-white">Payment Successful!</CardTitle>
          <CardDescription className="text-slate-300">
            Your {verifyResult.plan || 'Pro'} subscription is now active
          </CardDescription>
          {verifyResult.plan && (
            <Badge className="mt-2 bg-emerald-600">{verifyResult.plan} Plan</Badge>
          )}
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="bg-slate-700/50 rounded-lg p-4">
            <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
              <Smartphone className="h-5 w-5 text-emerald-400" />
              Install CallVS on Your Device
            </h3>
            
            {platform === 'ios' && (
              <div className="space-y-3 text-sm text-slate-300">
                <p className="font-medium text-white">iPhone / iPad:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">1.</span>
                    <span>Open this page in <strong>Safari</strong> (required)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">2.</span>
                    <span>Tap the <Share className="inline h-4 w-4" /> Share button at the bottom</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">3.</span>
                    <span>Scroll down and tap <strong>"Add to Home Screen"</strong> <Plus className="inline h-4 w-4" /></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">4.</span>
                    <span>Tap <strong>"Add"</strong> to confirm</span>
                  </li>
                </ol>
              </div>
            )}
            
            {platform === 'android' && (
              <div className="space-y-3 text-sm text-slate-300">
                <p className="font-medium text-white">Android:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">1.</span>
                    <span>If you see an <strong>"Install"</strong> banner, tap it</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">2.</span>
                    <span>Or tap <MoreVertical className="inline h-4 w-4" /> menu in Chrome</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">3.</span>
                    <span>Select <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></span>
                  </li>
                </ol>
              </div>
            )}
            
            {platform === 'desktop' && (
              <div className="space-y-3 text-sm text-slate-300">
                <p className="font-medium text-white">Desktop:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Look for the install icon <Download className="inline h-4 w-4" /> in your browser's address bar</li>
                  <li>Or use the menu to "Install CallVS"</li>
                  <li>For mobile, open this link on your phone</li>
                </ol>
              </div>
            )}
          </div>
          
          <div className="space-y-3">
            <Button 
              onClick={() => navigate('/app')} 
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-lg py-6"
              data-testid="button-open-call-vault"
            >
              <ExternalLink className="h-5 w-5 mr-2" />
              Open CallVS
            </Button>
            
            <p className="text-center text-xs text-slate-400">
              A confirmation email has been sent to your inbox with these instructions.
            </p>
          </div>
          
          <div className="border-t border-slate-600 pt-4">
            <h4 className="font-medium text-white mb-2">What's included in your plan:</h4>
            <ul className="text-sm text-slate-300 space-y-1">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400" /> Unlimited video & voice calls
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400" /> Priority connection quality
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400" /> Extended call duration
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400" /> Premium support
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
