import { useState, useMemo, useEffect } from 'react';
import { Layers, X, Loader2, CheckCircle2, ExternalLink, Star, DollarSign, Clock } from 'lucide-react';
import { OFFERWALL_PROVIDERS } from '../../api/offerwallProviders';
import { useAuth } from '../../contexts/AuthContext';

interface CapsbitOffer {
  id: string;
  name: string;
  description: string;
  payout: number;
  category: string;
  device: string;
  icon?: string;
  url: string;
}

function CapsbitOffers({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [offers, setOffers] = useState<CapsbitOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const CAPSBIT_API_URL = 'https://api.capsbit.com/469c8d5b186be1bc3fcf177ccc4c5c39';

  useEffect(() => {
    let cancelled = false;
    const fetchOffers = async () => {
      try {
        const res = await fetch(`${CAPSBIT_API_URL}/offers?user_id=${encodeURIComponent(userId)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const list: CapsbitOffer[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.offers)
              ? data.offers
              : Array.isArray(data?.data)
                ? data.data
                : [];
          setOffers(list.map((o: any) => ({
            id: String(o.id ?? o.offer_id ?? o.campaign_id ?? Math.random()),
            name: o.name ?? o.title ?? 'Offer',
            description: o.description ?? o.desc ?? '',
            payout: Number(o.payout ?? o.reward ?? o.amount ?? 0),
            category: o.category ?? o.type ?? 'Offer',
            device: o.device ?? o.platform ?? 'All',
            icon: o.icon ?? o.image_url ?? o.thumbnail ?? '',
            url: o.url ?? o.click_url ?? o.tracking_url ?? '#',
          })));
        }
      } catch (e) {
        if (!cancelled) setError('Unable to load Capsbit offers right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOffers();
    return () => { cancelled = true; };
  }, [userId]);

  const handleOpenOffer = (offer: CapsbitOffer) => {
    const url = offer.url.includes('?')
      ? `${offer.url}&subid=${encodeURIComponent(userId)}`
      : `${offer.url}?subid=${encodeURIComponent(userId)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-[#161827] border-b border-[#2a2e45]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: '#f59e0b20', border: '1px solid #f59e0b40' }}>
            <span style={{ color: '#f59e0b' }}>C</span>
          </div>
          <div>
            <h2 className="text-white font-semibold">Capsbit</h2>
            <p className="text-xs text-gray-500">Complete offers to earn points</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#0d0f18] p-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="text-emerald-500 animate-spin mb-3" />
            <p className="text-gray-400 text-sm">Loading Capsbit offers...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-red-400 text-sm mb-2">{error}</p>
            <p className="text-gray-500 text-xs">Please try again later or contact support.</p>
          </div>
        )}

        {!loading && !error && offers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-gray-400 text-sm">No offers available right now.</p>
            <p className="text-gray-500 text-xs mt-1">Check back soon for new opportunities.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {offers.map((offer) => (
            <button
              key={offer.id}
              onClick={() => handleOpenOffer(offer)}
              className="card p-4 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group"
            >
              <div className="flex items-start gap-3">
                {offer.icon ? (
                  <img src={offer.icon} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-[#1a1d2e]" loading="lazy" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#1a1d2e] border border-[#2a2e45] flex items-center justify-center flex-shrink-0">
                    <Star size={18} className="text-yellow-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{offer.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{offer.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                      <DollarSign size={10} />
                      +{offer.payout} pts
                    </span>
                    <span className="text-xs text-gray-500">{offer.category}</span>
                  </div>
                </div>
                <ExternalLink size={14} className="text-gray-500 group-hover:text-emerald-400 transition-colors flex-shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 bg-[#161827] border-t border-[#2a2e45]">
        <p className="text-xs text-gray-500 text-center">
          Points credited automatically after completion. May take up to 24 hours.
        </p>
      </div>
    </div>
  );
}

function OfferwallModal({
  provider,
  userId,
  onClose
}: {
  provider: typeof OFFERWALL_PROVIDERS[number];
  userId: string;
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(true);

  const offerwallUrl = useMemo(() => {
    if (!provider.wallUrl || !userId) return null;
    return `${provider.wallUrl}?subid=${userId}`;
  }, [provider.wallUrl, userId]);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#161827] border-b border-[#2a2e45]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white"
            style={{ backgroundColor: provider.logoColor + '20', border: `1px solid ${provider.logoColor}40` }}
          >
            <span style={{ color: provider.logoColor }}>{provider.displayName[0]}</span>
          </div>
          <div>
            <h2 className="text-white font-semibold">{provider.displayName}</h2>
            <p className="text-xs text-gray-500">Complete offers to earn points</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 relative bg-[#0d0f18]">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0f18] z-10">
            <Loader2 size={32} className="text-emerald-500 animate-spin mb-3" />
            <p className="text-gray-400 text-sm">Loading offerwall...</p>
          </div>
        )}

        {offerwallUrl && (
          <iframe
            src={offerwallUrl}
            className="w-full h-full border-0"
            onLoad={() => setIsLoading(false)}
            title={`${provider.displayName} Offerwall`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-[#161827] border-t border-[#2a2e45]">
        <p className="text-xs text-gray-500 text-center">
          Points credited automatically after completion. May take up to 24 hours.
        </p>
      </div>
    </div>
  );
}

export default function OfferwallsPage() {
  const { user } = useAuth();
  const [activeProvider, setActiveProvider] = useState<typeof OFFERWALL_PROVIDERS[0] | null>(null);
  const [showCapsbit, setShowCapsbit] = useState(false);

  const handleOpenWall = (provider: typeof OFFERWALL_PROVIDERS[number]) => {
    if (!user) return;
    if (provider.id === 'capsbit') {
      setShowCapsbit(true);
    } else if (provider.isActive) {
      setActiveProvider(provider);
    }
  };

  const handleCloseWall = () => {
    setActiveProvider(null);
    setShowCapsbit(false);
  };

  return (
    <div>
      {/* Modal */}
      {activeProvider && user && (
        <OfferwallModal
          provider={activeProvider}
          userId={user.id}
          onClose={handleCloseWall}
        />
      )}
      {showCapsbit && user && (
        <CapsbitOffers userId={user.id} onClose={handleCloseWall} />
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Offerwalls</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Complete offers to earn points. Choose a provider to get started.
        </p>
      </div>

      {/* Active Offerwalls */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="text-sm font-medium text-gray-300">Available Now</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {OFFERWALL_PROVIDERS
            .filter(p => p.isActive)
            .map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleOpenWall(provider)}
                className="card p-4 flex flex-col items-center text-center gap-3 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white transition-transform group-hover:scale-105"
                  style={{ backgroundColor: provider.logoColor + '20', border: `1px solid ${provider.logoColor}30` }}
                >
                  <span style={{ color: provider.logoColor }}>{provider.displayName[0]}</span>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{provider.displayName}</p>
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Coming Soon */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Layers size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-500">Coming Soon</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {OFFERWALL_PROVIDERS
            .filter(p => !p.isActive)
            .map((provider) => (
              <div
                key={provider.id}
                className="card p-4 flex flex-col items-center text-center gap-3 opacity-60"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white"
                  style={{ backgroundColor: provider.logoColor + '10', border: `1px solid ${provider.logoColor}20` }}
                >
                  <span style={{ color: provider.logoColor, opacity: 0.5 }}>{provider.displayName[0]}</span>
                </div>
                <div>
                  <p className="text-gray-400 font-medium text-sm">{provider.displayName}</p>
                  <span className="text-xs text-gray-600 mt-1">Coming Soon</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
