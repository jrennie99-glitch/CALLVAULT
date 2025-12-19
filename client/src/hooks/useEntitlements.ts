import { useQuery } from '@tanstack/react-query';

interface Entitlements {
  canUseProFeatures: boolean;
  canUseBusinessFeatures: boolean;
  plan: string;
  planStatus: string | null;
  trialStatus: string | null;
  trialEndAt: string | null;
  trialMinutesRemaining: number | null;
  trialPlan: string | null;
}

export function useEntitlements(address: string | null) {
  const { data, isLoading, error, refetch } = useQuery<Entitlements>({
    queryKey: ['entitlements', address],
    queryFn: async () => {
      if (!address) {
        return {
          canUseProFeatures: false,
          canUseBusinessFeatures: false,
          plan: 'free',
          planStatus: null,
          trialStatus: null,
          trialEndAt: null,
          trialMinutesRemaining: null,
          trialPlan: null,
        };
      }
      
      const res = await fetch(`/api/entitlements/${address}`);
      if (!res.ok) throw new Error('Failed to fetch entitlements');
      return res.json();
    },
    enabled: !!address,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const defaultEntitlements: Entitlements = {
    canUseProFeatures: false,
    canUseBusinessFeatures: false,
    plan: 'free',
    planStatus: null,
    trialStatus: null,
    trialEndAt: null,
    trialMinutesRemaining: null,
    trialPlan: null,
  };

  return {
    entitlements: data || defaultEntitlements,
    isLoading,
    error,
    refetch,
    isPro: data?.canUseProFeatures || false,
    isBusiness: data?.canUseBusinessFeatures || false,
    isFree: !data?.canUseProFeatures && !data?.canUseBusinessFeatures,
    hasTrial: data?.trialStatus === 'active',
    trialDaysRemaining: data?.trialEndAt 
      ? Math.max(0, Math.ceil((new Date(data.trialEndAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0,
    trialMinutesRemaining: data?.trialMinutesRemaining || 0,
  };
}
