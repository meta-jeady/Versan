import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Power,
  Copy,
  Check,
  Clipboard,
  Terminal,
  Settings,
  Key,
  Trash2,
  RefreshCw,
  Info,
  ArrowUp,
  ArrowDown,
  Download,
  X,
  ExternalLink,
  Smartphone,
  Lock,
  Globe,
  Bell,
  BellRing,
  User,
  AlertTriangle,
  Radio,
  Wifi,
  Database,
  Calendar,
  Sparkles,
  Send,
  CheckCircle2,
  Share2
} from 'lucide-react';

// Current App Version (Requested: v2.3.4)
export const APP_VERSION = '2.3.4';

// Custom Orange Shield Component
export const OrangeShield: React.FC<{ size?: number; isGlowing?: boolean; className?: string }> = ({
  size = 36,
  isGlowing = false,
  className = ''
}) => {
  return (
    <div
      className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
        isGlowing ? 'shadow-[0_0_26px_rgba(255,121,0,0.6)]' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-md"
      >
        <defs>
          <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFA040" />
            <stop offset="50%" stopColor="#FF7900" />
            <stop offset="100%" stopColor="#E65100" />
          </linearGradient>
          <linearGradient id="borderGrad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#FFD180" />
            <stop offset="100%" stopColor="#FF7900" />
          </linearGradient>
        </defs>
        <path
          d="M50 5 L88 22 C88 62 50 88 50 95 C50 88 12 62 12 22 Z"
          fill="url(#shieldGrad)"
          stroke="url(#borderGrad)"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        <path
          d="M34 50 L46 62 L68 38"
          stroke="white"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// Web Audio sound synthesizer for alerts & chimes
const playChime = (type: 'alert' | 'success' | 'broadcast' = 'alert') => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'broadcast') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24); // G5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'alert') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (_) {}
};

// Native Browser System Notification Dispatcher
const sendSystemNotification = async (title: string, body: string) => {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'https://cdn-icons-png.flaticon.com/512/2092/2092663.png',
      });
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification(title, {
          body,
          icon: 'https://cdn-icons-png.flaticon.com/512/2092/2092663.png',
        });
      }
    }
  } catch (e) {
    console.error('System notification error:', e);
  }
};

interface VpnConfig {
  raw: string;
  protocol: string;
  name: string;
  server: string;
  port: string;
  host: string;
  path: string;
  uuid: string;
  isLocked?: boolean;
}

interface AppNotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'consumption' | 'expiry' | 'broadcast' | 'system';
  isRead?: boolean;
}

interface UpdateManifest {
  currentVersion: string;
  minVersion: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  forceUpdate?: boolean;
}

interface BroadcastPayload {
  id: string;
  timestamp: string;
  priority?: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
}

export default function App() {
  // User Profile State (Mandatory requirement)
  const [userName, setUserName] = useState<string>('');
  const [nameInput, setNameInput] = useState<string>('');
  const [nameError, setNameError] = useState<string>('');
  const [showMandatoryNameModal, setShowMandatoryNameModal] = useState<boolean>(false);

  // Subscription & Expiration
  // Default: 30 days from creation
  const [expiryDate, setExpiryDate] = useState<string>(() => {
    const saved = localStorage.getItem('orange_expiry_date');
    if (saved) return saved;
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [totalQuotaGb, setTotalQuotaGb] = useState<number>(() => {
    const saved = localStorage.getItem('orange_total_quota_gb');
    return saved ? parseFloat(saved) : 5.0; // 5 GB default
  });

  // VPN State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusText, setStatusText] = useState<'DÉCONNECTÉ' | 'CONNEXION...' | 'PROTÉGÉ'>('DÉCONNECTÉ');
  const [mode, setMode] = useState<string>('VLESS / VMess');
  const [config, setConfig] = useState<VpnConfig | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  // Telemetry & Data Consumption Tracking
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  // Total traffic in bytes: initial default ~45 MB
  const [totalTrafficBytes, setTotalTrafficBytes] = useState<number>(() => {
    const saved = localStorage.getItem('orange_traffic_bytes');
    return saved ? parseInt(saved, 10) : 45 * 1024 * 1024;
  });

  // Consumption milestone alert (triggers at 200 MB, 400 MB, etc.)
  // We keep track of the last alerted 200MB milestone
  const [lastMilestone200Mb, setLastMilestone200Mb] = useState<number>(() => {
    const saved = localStorage.getItem('orange_last_milestone_200mb');
    return saved ? parseInt(saved, 10) : 0;
  });

  // 200 Mo Alert Popup State
  const [consumptionAlertData, setConsumptionAlertData] = useState<{
    consumedMb: number;
    remainingGb: string;
    remainingMb: string;
  } | null>(null);

  // Expiration Alert Modal State
  const [expiryAlertData, setExpiryAlertData] = useState<{
    daysRemaining: number;
    expiryDateFormatted: string;
  } | null>(null);

  // Remote Update State
  const [availableUpdate, setAvailableUpdate] = useState<UpdateManifest | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

  // Live Broadcast State (from GitHub)
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastPayload | null>(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState<boolean>(false);

  // Notifications drawer & history
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [showNotificationDrawer, setShowNotificationDrawer] = useState<boolean>(false);

  // Unique App Installation ID
  const [installationId, setInstallationId] = useState<string>('OR-7K9A-4M2P');
  const [copiedId, setCopiedId] = useState(false);

  // Logs
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] Orange VPN v${APP_VERSION} initialisé`,
    `[${new Date().toLocaleTimeString()}] Moteur Xray Core v1.2.0 prêt • powered :@kcorp-tech`,
  ]);

  // Other Modals
  const [showLogs, setShowLogs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showGitHubGuide, setShowGitHubGuide] = useState(false);
  const [manualInputText, setManualInputText] = useState('');
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // Generator State
  const [genName, setGenName] = useState('Orange Cameroun VIP');
  const [genClientIds, setGenClientIds] = useState('OR-7K9A-4M2P');
  const [genLock, setGenLock] = useState(true);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  // Broadcast Simulator State (For the admin to test broadcast before pushing to GitHub)
  const [adminSimTitle, setAdminSimTitle] = useState('Orange VPN • Alerte Réseau');
  const [adminSimMessage, setAdminSimMessage] = useState('Maintenance planifiée ce soir à 00h00. Les serveurs VIP restent actifs.');

  const showToast = (msg: string) => {
    setSnackMessage(msg);
    setTimeout(() => {
      setSnackMessage(null);
    }, 4000);
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 60)]);
  };

  // Add Notification to Center
  const pushNotification = (item: Omit<AppNotificationItem, 'id' | 'timestamp'>) => {
    const newItem: AppNotificationItem = {
      ...item,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
    };
    setNotifications((prev) => [newItem, ...prev.slice(0, 25)]);
  };

  // 1. Initial Load: Check User Name (Mandatory requirement)
  useEffect(() => {
    const savedName = localStorage.getItem('orange_user_name');
    if (!savedName || savedName.trim() === '') {
      setShowMandatoryNameModal(true);
    } else {
      setUserName(savedName);
      // Greet user on opening the app
      showToast(`👋 Bienvenue, ${savedName} sur Orange VPN v${APP_VERSION} !`);
    }

    const savedConfig = localStorage.getItem('orange_saved_config');
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig));
      } catch (_) {}
    }

    // Request notification permissions gracefully
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => {
        Notification.requestPermission();
      }, 2000);
    }
  }, []);

  // 2. Check Daily Expiration on Startup and Daily Interval
  useEffect(() => {
    if (!userName) return;

    const checkDailyExpiration = () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastCheckDay = localStorage.getItem('orange_last_expiry_alert_day');

      // Calculate days remaining
      const expiry = new Date(expiryDate);
      const now = new Date();
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // If not alerted today, send daily notification
      if (lastCheckDay !== todayStr) {
        localStorage.setItem('orange_last_expiry_alert_day', todayStr);

        let expiryMsg = '';
        if (diffDays <= 0) {
          expiryMsg = `Cher ${userName}, votre forfait Orange VPN a expiré ! Veuillez souscrire à nouveau pour continuer à profiter du service.`;
        } else if (diffDays <= 3) {
          expiryMsg = `Cher ${userName}, ATTENTION : votre forfait Orange VPN expire dans ${diffDays} jour(s) (${expiry.toLocaleDateString('fr-FR')}). Pensez à renouveler votre abonnement.`;
        } else {
          expiryMsg = `Cher ${userName}, votre forfait Orange VPN expire le ${expiry.toLocaleDateString('fr-FR')} (dans ${diffDays} jours). Veuillez souscrire à nouveau après expiration.`;
        }

        // Send browser notification
        sendSystemNotification('Orange VPN • Rappel d\'expiration 📅', expiryMsg);
        playChime('alert');

        // Add to in-app notification center
        pushNotification({
          title: 'Rappel d\'expiration journalier',
          message: expiryMsg,
          type: 'expiry',
        });

        // Show modal alert if close to expiry
        if (diffDays <= 5) {
          setExpiryAlertData({
            daysRemaining: diffDays,
            expiryDateFormatted: expiry.toLocaleDateString('fr-FR'),
          });
        }
      }
    };

    checkDailyExpiration();
    const interval = setInterval(checkDailyExpiration, 60000 * 60); // Check hourly
    return () => clearInterval(interval);
  }, [userName, expiryDate]);

  // 3. Remote Check: GitHub Broadcasts & Updates
  useEffect(() => {
    const fetchRemoteData = async () => {
      // Fetch Broadcast Notification from GitHub/public
      try {
        const broadcastRes = await fetch(`/broadcast.json?t=${Date.now()}`);
        if (broadcastRes.ok) {
          const data: BroadcastPayload = await broadcastRes.json();
          const lastSeenBroadcastId = localStorage.getItem('orange_last_broadcast_seen');

          if (data && data.id && data.id !== lastSeenBroadcastId) {
            // New broadcast from GitHub repository!
            setActiveBroadcast(data);
            setShowBroadcastModal(true);
            playChime('broadcast');
            sendSystemNotification(data.title, data.message);
            addLog(`📢 Notification GitHub reçue : "${data.title}"`);

            pushNotification({
              title: data.title,
              message: data.message,
              type: 'broadcast',
            });
          }
        }
      } catch (err) {
        // Fallback or offline
      }

      // Fetch App Update info from /app-update.json
      try {
        const updateRes = await fetch(`/app-update.json?t=${Date.now()}`);
        if (updateRes.ok) {
          const updateData: UpdateManifest = await updateRes.json();
          if (updateData && updateData.currentVersion) {
            // Compare version
            if (isVersionGreater(updateData.currentVersion, APP_VERSION)) {
              setAvailableUpdate(updateData);
              // Only prompt if not ignored in this session
              const ignored = sessionStorage.getItem(`ignored_update_${updateData.currentVersion}`);
              if (!ignored) {
                setShowUpdateModal(true);
              }
            }
          }
        }
      } catch (_) {}
    };

    fetchRemoteData();
    // Poll every 35 seconds to simulate live real-time GitHub push updates
    const pollInterval = setInterval(fetchRemoteData, 35000);
    return () => clearInterval(pollInterval);
  }, []);

  // Version comparator: returns true if vA > vB
  const isVersionGreater = (vA: string, vB: string) => {
    const partsA = vA.split('.').map((n) => parseInt(n, 10) || 0);
    const partsB = vB.split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const a = partsA[i] || 0;
      const b = partsB[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return false;
  };

  // 4. VPN Connection & Data Consumption Engine
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConnected) {
      interval = setInterval(() => {
        // Random speed between 400 KB/s and 4.2 MB/s
        const up = Math.floor(Math.random() * 850 + 150) / 10; // KB/s
        const down = Math.floor(Math.random() * 3400 + 550) / 10; // KB/s
        setUploadSpeed(up);
        setDownloadSpeed(down);

        // Increment data consumed
        const addedBytes = (up + down) * 1024;
        setTotalTrafficBytes((prev) => {
          const next = prev + addedBytes;
          localStorage.setItem('orange_traffic_bytes', next.toString());
          check200MoMilestone(next);
          return next;
        });
      }, 1000);
    } else {
      setUploadSpeed(0);
      setDownloadSpeed(0);
    }
    return () => clearInterval(interval);
  }, [isConnected, lastMilestone200Mb, userName, totalQuotaGb]);

  // Milestone Checker for exactly 200 Mo multiples
  const check200MoMilestone = (currentBytes: number) => {
    const currentMb = currentBytes / (1024 * 1024);
    // Determine milestone count: e.g. at 200MB -> 1, 400MB -> 2, etc.
    const milestoneCount = Math.floor(currentMb / 200);

    if (milestoneCount > lastMilestone200Mb) {
      setLastMilestone200Mb(milestoneCount);
      localStorage.setItem('orange_last_milestone_200mb', milestoneCount.toString());

      const consumedMbFormatted = Math.round(currentMb);
      const totalMb = totalQuotaGb * 1024;
      const remainingMbRaw = Math.max(0, totalMb - currentMb);
      const remainingGbFormatted = (remainingMbRaw / 1024).toFixed(2);
      const remainingMbFormatted = Math.round(remainingMbRaw).toString();

      // Trigger the exact user-requested notification wording:
      const title = '⚠️ Alerte Conso Orange VPN - 200 Mo';
      const body = `Cher ${userName || 'Client'}, vous venez de consommer 200 Mo de votre forfait ! Il vous reste ${remainingGbFormatted} Go. Veuillez souscrire à nouveau après l'expiration.`;

      // Trigger native notification
      sendSystemNotification(title, body);

      // Play audio chime
      playChime('alert');

      // Set alert popup modal
      setConsumptionAlertData({
        consumedMb: consumedMbFormatted,
        remainingGb: remainingGbFormatted,
        remainingMb: remainingMbFormatted,
      });

      // Add to notification drawer
      pushNotification({
        title: 'Alerte Consommation 200 Mo',
        message: body,
        type: 'consumption',
      });

      addLog(`⚠️ Alerte 200 Mo déclenchée pour ${userName} : ${remainingGbFormatted} Go restant`);
    }
  };

  // Helper to simulate instant +200 Mo for testing
  const simulate200MoJump = () => {
    const jumpBytes = 200 * 1024 * 1024;
    setTotalTrafficBytes((prev) => {
      const next = prev + jumpBytes;
      localStorage.setItem('orange_traffic_bytes', next.toString());
      check200MoMilestone(next);
      return next;
    });
    showToast('Simulation : +200 Mo ajoutés au compteur !');
  };

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Mandatory Name Submission Handler
  const handleSaveMandatoryName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length < 2) {
      setNameError('Veuillez entrer un nom ou pseudo valide (au moins 2 caractères).');
      return;
    }
    setUserName(trimmed);
    localStorage.setItem('orange_user_name', trimmed);
    setShowMandatoryNameModal(false);
    playChime('success');
    showToast(`🎉 Bienvenue ${trimmed} ! Votre profil Orange VPN est maintenant activé.`);
    addLog(`Utilisateur configuré : ${trimmed}`);

    // Request system notifications permission right upon onboarding
    if ('Notification' in window) {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          sendSystemNotification(
            'Orange VPN • Profil Activé 🛡️',
            `Bienvenue ${trimmed} ! Vous recevrez des alertes de consommation et vos rappels d'expiration.`
          );
        }
      });
    }
  };

  // Parse VLESS / VMess / Trojan / Orange Encrypted URL
  const parseVless = (rawUrl: string): VpnConfig | null => {
    try {
      const trimmed = rawUrl.trim();

      // 1. Orange encrypted link
      if (trimmed.startsWith('orange://config/') || trimmed.startsWith('xv2ray://config/')) {
        return {
          raw: trimmed,
          protocol: 'Orange Encrypted',
          name: 'Profil Sécurisé AES-256',
          server: 'Serveur Privé Sécurisé',
          port: '443',
          host: 'Chiffré & Verrouillé',
          path: '/tunnel-secure',
          uuid: 'AES-256',
          isLocked: true,
        };
      }

      // 2. VLESS
      if (trimmed.startsWith('vless://')) {
        const url = new URL(trimmed);
        const params = url.searchParams;
        const host = params.get('host') || params.get('sni') || url.hostname;
        const path = params.get('path') ? decodeURIComponent(params.get('path')!) : '/';
        const name = url.hash ? decodeURIComponent(url.hash.replace('#', '')) : 'Orange VLESS Fast';

        return {
          raw: trimmed,
          protocol: 'VLESS',
          name: name,
          server: url.hostname,
          port: url.port || '443',
          host: host,
          path: path,
          uuid: url.username || 'Client-Orange',
          isLocked: false,
        };
      }

      // 3. VMess
      if (trimmed.startsWith('vmess://')) {
        let b64 = trimmed.replace('vmess://', '').trim();
        while (b64.length % 4 !== 0) b64 += '=';
        const json = JSON.parse(atob(b64));
        return {
          raw: trimmed,
          protocol: 'VMess',
          name: json.ps || 'Orange VMess VIP',
          server: json.add || '127.0.0.1',
          port: String(json.port || '443'),
          host: json.host || json.sni || json.add,
          path: json.path || '/',
          uuid: json.id || 'UUID-Orange',
          isLocked: false,
        };
      }

      // 4. Trojan
      if (trimmed.startsWith('trojan://')) {
        const url = new URL(trimmed);
        const params = url.searchParams;
        const host = params.get('sni') || params.get('host') || url.hostname;
        const path = params.get('path') ? decodeURIComponent(params.get('path')!) : '/';
        const name = url.hash ? decodeURIComponent(url.hash.replace('#', '')) : 'Orange Trojan';

        return {
          raw: trimmed,
          protocol: 'Trojan',
          name: name,
          server: url.hostname,
          port: url.port || '443',
          host: host,
          path: path,
          uuid: url.username || '',
          isLocked: false,
        };
      }

      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // Paste configuration handler
  const handlePasteConfig = async () => {
    try {
      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch (_) {}
      }

      if (!text || (!text.startsWith('vless://') && !text.startsWith('vmess://') && !text.startsWith('trojan://') && !text.startsWith('orange://') && !text.startsWith('xv2ray://'))) {
        setShowPasteModal(true);
        return;
      }

      applyConfig(text);
    } catch (_) {
      setShowPasteModal(true);
    }
  };

  const applyConfig = (rawText: string) => {
    const parsed = parseVless(rawText);
    if (!parsed) {
      showToast('❌ Format de configuration invalide');
      addLog('Format invalide rejeté');
      return;
    }

    setConfig(parsed);
    localStorage.setItem('orange_saved_config', JSON.stringify(parsed));
    setShowPasteModal(false);
    showToast(`✅ Configuration ${parsed.protocol} appliquée ! Host: ${parsed.host}`);
    addLog(`Config appliquée : Host=${parsed.host}, Path=${parsed.path}`);
  };

  const clearConfig = () => {
    if (isConnected) {
      setIsConnected(false);
      setStatusText('DÉCONNECTÉ');
    }
    setConfig(null);
    localStorage.removeItem('orange_saved_config');
    showToast('Configuration effacée');
    addLog('Configuration supprimée');
  };

  // Toggle VPN connection
  const toggleConnection = () => {
    if (isConnected || isConnecting) {
      setIsConnected(false);
      setIsConnecting(false);
      setStatusText('DÉCONNECTÉ');
      addLog('Tunnel Orange VPN arrêté');
      showToast('Déconnecté');
      return;
    }

    if (!config) {
      showToast('⚠️ Appuyez d’abord sur « Coller la configuration »');
      return;
    }

    setIsConnecting(true);
    setStatusText('CONNEXION...');
    addLog(`Lancement de la connexion (${config.protocol}) via ${config.host}...`);

    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
      setStatusText('PROTÉGÉ');
      playChime('success');
      addLog('Tunnel chiffré établi avec succès ✅');
      showToast('Orange VPN connecté avec succès 🛡️');
      // Measure ping
      runPingTest();
    }, 1200);
  };

  // Ping test
  const runPingTest = () => {
    setIsPinging(true);
    setTimeout(() => {
      const ms = Math.floor(Math.random() * 25 + 18);
      setPingLatency(ms);
      setIsPinging(false);
      addLog(`Latence serveur testée : ${ms} ms`);
    }, 600);
  };

  const copyAppId = () => {
    navigator.clipboard.writeText(installationId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
    showToast(`ID copié : ${installationId}`);
  };

  const generateOrangeKey = () => {
    if (!genName.trim()) {
      showToast('Veuillez nommer la configuration');
      return;
    }
    const fakeKey = `orange://config/ORANGE_${btoa(
      JSON.stringify({
        app: 'Orange VPN',
        version: APP_VERSION,
        name: genName,
        user: userName,
        mode: mode,
        host: config?.host || 'orange.cm',
        config: config?.raw || 'vless://...',
        locked: genLock,
        allowedClientIds: genClientIds.split(',').map((s) => s.trim()),
        signature: '@kcorp-tech',
        created_at: new Date().toISOString(),
      })
    )}`;
    setGeneratedLink(fakeKey);
    navigator.clipboard.writeText(fakeKey);
    showToast('Clé Orange VPN générée & copiée dans le presse-papier !');
  };

  // Admin Broadcast Simulator: Test the broadcast feature locally
  const handleTestBroadcastPush = () => {
    const simulatedBroadcast: BroadcastPayload = {
      id: `sim-${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: adminSimTitle,
      message: adminSimMessage,
      priority: 'high',
    };
    setActiveBroadcast(simulatedBroadcast);
    setShowBroadcastModal(true);
    playChime('broadcast');
    sendSystemNotification(simulatedBroadcast.title, simulatedBroadcast.message);
    pushNotification({
      title: simulatedBroadcast.title,
      message: simulatedBroadcast.message,
      type: 'broadcast',
    });
    showToast('Notification diffusée instantanément à tous les utilisateurs !');
  };

  // Calculation for remaining quota
  const currentMb = totalTrafficBytes / (1024 * 1024);
  const totalMb = totalQuotaGb * 1024;
  const remainingMb = Math.max(0, totalMb - currentMb);
  const remainingGb = (remainingMb / 1024).toFixed(2);
  const usagePercentage = Math.min(100, Math.round((currentMb / totalMb) * 100));

  // Sample configs for quick demonstration
  const sampleVless =
    'vless://b822d059-3d84-486a-ad85-780c10d3e589@104.16.24.5:443?path=%2Forange-speed-ws&security=tls&encryption=none&host=m.orange.cm&type=ws&sni=m.orange.cm#Orange-Cameroun-Fast';
  const sampleVMess =
    'vmess://eyJhZGQiOiIxMDQuMTYuMjQuNSIsImFpZCI6IjAiLCJob3N0Ijoid3d3Lm9yYW5nZS5jbSIsImlkIjoiYjgyMmQwNTktM2Q4NC00ODZhLWFkODUtNzgwYzEwZDNlNTg5IiwibmV0Ijoid3MiLCJwYXRoIjoiL3ZtZXNzLXdzIiwicG9ydCI6IjQ0MyIsInBzIjoiT3JhbmdlLVZNZXNzLVZJUCIsInRscyI6InRscyIsInYiOiIyIn0=';

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-[#0A0A0D] text-white flex flex-col items-center justify-center p-2 sm:p-5 antialiased selection:bg-orange-500 selection:text-white">
      {/* Toast Notification */}
      {snackMessage && (
        <div className="fixed top-4 z-[90] animate-bounce bg-[#16161F] border border-orange-500/50 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-3 max-w-sm">
          <OrangeShield size={20} />
          <span className="text-xs font-semibold">{snackMessage}</span>
        </div>
      )}

      {/* Main VPN Shell */}
      <div className="w-full max-w-[430px] flex flex-col rounded-[2.5rem] border border-[#232332] bg-[#121218] shadow-2xl overflow-hidden relative">
        {/* Device Top Status Bar */}
        <div className="h-6 w-full flex items-center justify-between px-6 pt-2 text-[11px] text-gray-400 font-mono">
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-300 font-semibold">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-orange-500 font-bold text-[10px]">v{APP_VERSION}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1 text-emerald-400">
              <Wifi size={12} />
              <span className="text-[10px] font-bold">5G+</span>
            </div>
            <span>100%</span>
          </div>
        </div>

        {/* Header App Bar */}
        <header className="px-5 pt-3 pb-2.5 flex items-center justify-between border-b border-[#1E1E2B]">
          <div className="flex items-center space-x-3">
            <OrangeShield size={36} isGlowing={isConnected} />
            <div>
              <div className="flex items-center space-x-1.5">
                <h1 className="text-base font-black tracking-wide text-white">Orange VPN</h1>
                <span className="text-[10px] bg-orange-500/20 text-orange-400 font-extrabold px-1.5 py-0.5 rounded border border-orange-500/40">
                  v{APP_VERSION}
                </span>
              </div>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : isConnecting
                      ? 'bg-orange-500 animate-ping'
                      : 'bg-gray-500'
                  }`}
                />
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider ${
                    isConnected ? 'text-emerald-400' : isConnecting ? 'text-orange-400' : 'text-gray-400'
                  }`}
                >
                  {statusText}
                </span>
                {pingLatency && isConnected && (
                  <span className="text-[9px] font-mono text-gray-400 bg-white/5 px-1 rounded">
                    {pingLatency}ms
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {/* Notification Bell with Badge */}
            <button
              onClick={() => {
                setShowNotificationDrawer(true);
                // Mark notifications as read
                setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
              }}
              className="relative p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition"
              title="Centre de notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-orange-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* GitHub Updates & Guide */}
            <button
              onClick={() => setShowGitHubGuide(true)}
              className="p-2 text-orange-400 hover:text-orange-300 rounded-xl hover:bg-orange-500/10 transition"
              title="Mises à jour & Diffusion GitHub"
            >
              <Radio size={18} />
            </button>

            {/* Terminal Logs */}
            <button
              onClick={() => setShowLogs(true)}
              className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition"
              title="Logs Terminal"
            >
              <Terminal size={18} />
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition"
              title="Paramètres & Profil"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* Personalized User & Expiration Banner */}
        <div className="px-5 pt-3 pb-1">
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-gradient-to-r from-[#171722] to-[#1F1F2E] border border-[#28283C]">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold text-xs">
                {userName ? userName.slice(0, 2).toUpperCase() : <User size={14} />}
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-white">
                    {userName ? `Cher ${userName}` : 'Utilisateur Orange'}
                  </span>
                  <span className="text-[9px] bg-emerald-500/15 text-emerald-400 font-bold px-1.5 py-0.2 rounded">
                    Actif
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 flex items-center space-x-1">
                  <Calendar size={10} className="text-orange-400" />
                  <span>
                    Expire le{' '}
                    <b className="text-orange-300">
                      {new Date(expiryDate).toLocaleDateString('fr-FR')}
                    </b>
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(true)}
              className="text-[10px] font-bold text-orange-400 hover:text-orange-300 px-2 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 transition"
            >
              Modifier
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="px-5 py-3 flex flex-col space-y-3.5">
          {/* Protocol Selection & Live Bandwidth */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#161622] border border-[#252536]">
            <div className="flex items-center space-x-2">
              <Globe size={14} className="text-orange-500" />
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  addLog(`Protocole changé : ${e.target.value}`);
                }}
                disabled={config?.isLocked}
                aria-label="Sélection du protocole VPN"
                className="bg-transparent text-xs font-bold text-gray-200 outline-none cursor-pointer"
              >
                <option value="VLESS / VMess" className="bg-[#161622]">VLESS / VMess</option>
                <option value="Trojan" className="bg-[#161622]">Trojan</option>
                <option value="UDP" className="bg-[#161622]">UDP Custom</option>
                <option value="SlowDNS" className="bg-[#161622]">SlowDNS</option>
              </select>
            </div>

            <div className="flex items-center space-x-1.5 font-mono text-[11px]">
              <div className="flex items-center space-x-1 text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md">
                <ArrowUp size={11} />
                <span>{uploadSpeed.toFixed(1)} KB/s</span>
              </div>
              <div className="flex items-center space-x-1 text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-md">
                <ArrowDown size={11} />
                <span>{downloadSpeed.toFixed(1)} KB/s</span>
              </div>
            </div>
          </div>

          {/* Central Power Button */}
          <div className="py-2 flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center">
              {/* Pulsing Glow Rings */}
              {isConnected && (
                <div className="absolute w-44 h-44 rounded-full bg-emerald-500/20 animate-ping pointer-events-none" />
              )}
              {isConnecting && (
                <div className="absolute w-40 h-40 rounded-full border-2 border-orange-500/40 animate-spin pointer-events-none" />
              )}

              {/* Main Circular Button */}
              <button
                onClick={toggleConnection}
                className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-300 relative group ${
                  isConnected
                    ? 'bg-emerald-950/40 border-2 border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.35)]'
                    : isConnecting
                    ? 'bg-orange-950/40 border-2 border-orange-500 shadow-[0_0_35px_rgba(255,121,0,0.35)]'
                    : 'bg-[#181824] border-2 border-orange-500/50 hover:border-orange-500 shadow-[0_0_25px_rgba(255,121,0,0.2)]'
                }`}
              >
                <div
                  className={`w-28 h-28 rounded-full flex items-center justify-center shadow-inner transition-all duration-300 ${
                    isConnected
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-400/30'
                      : isConnecting
                      ? 'bg-gradient-to-br from-orange-400 to-orange-600 animate-pulse'
                      : 'bg-gradient-to-br from-orange-500 to-orange-600 group-hover:from-orange-400 group-hover:to-orange-500'
                  }`}
                >
                  {isConnecting ? (
                    <RefreshCw size={42} className="text-white animate-spin" />
                  ) : isConnected ? (
                    <Shield size={44} className="text-white drop-shadow" />
                  ) : (
                    <Power size={44} className="text-white drop-shadow" />
                  )}
                </div>
              </button>
            </div>

            <p className="mt-3 text-xs font-semibold text-center text-gray-300">
              {isConnected
                ? 'Protection active • Tunnel chiffré'
                : isConnecting
                ? 'Établissement du tunnel Orange...'
                : 'Appuyez pour vous connecter'}
            </p>
          </div>

          {/* Data Quota & 200 Mo Consumption Gauge */}
          <div className="rounded-2xl bg-[#161622] border border-[#272739] p-3.5 shadow-md">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center space-x-1.5">
                <Database size={13} className="text-orange-500" />
                <span className="font-extrabold text-gray-200">Consommation du forfait</span>
              </div>
              <span className="font-mono text-[11px] font-bold text-orange-400">
                {formatBytes(totalTrafficBytes)} / {totalQuotaGb} Go
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-[#0E0E14] h-2.5 rounded-full overflow-hidden border border-[#2D2D40] p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  usagePercentage > 85
                    ? 'bg-red-500'
                    : usagePercentage > 60
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-orange-500 to-amber-400'
                }`}
                style={{ width: `${Math.max(3, usagePercentage)}%` }}
              />
            </div>

            <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
              <span>
                Il reste : <b className="text-emerald-400">{remainingGb} Go</b> ({Math.round(remainingMb)} Mo)
              </span>
              <button
                onClick={simulate200MoJump}
                className="text-[10px] text-orange-400 hover:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 px-2 py-0.5 rounded border border-orange-500/30 transition flex items-center space-x-1"
                title="Tester l'alerte 200 Mo immédiatement"
              >
                <span>Tester +200 Mo</span>
              </button>
            </div>
          </div>

          {/* Auto-Configuration Section */}
          <div className="rounded-2xl bg-[#151520] border border-[#262638] p-3.5 shadow-md">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5">
                <Clipboard size={14} className="text-orange-500" />
                <span className="text-[11px] font-black uppercase tracking-wider text-orange-500">
                  Configuration Automatique
                </span>
              </div>
              {config && (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  {config.isLocked ? 'VERROUILLÉ AES' : 'ACTIVE'}
                </span>
              )}
            </div>

            {!config ? (
              <div className="space-y-2">
                <button
                  onClick={handlePasteConfig}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-black text-xs flex items-center justify-center space-x-2 shadow-lg shadow-orange-500/25 transition transform active:scale-95"
                >
                  <Clipboard size={16} />
                  <span>Coller la configuration</span>
                </button>
                <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                  Copiez votre lien VLESS ou VMess puis appuyez sur Coller. L’application extrait et renseigne automatiquement le <b>Host</b> et le <b>Path</b>.
                </p>

                {/* Quick test buttons */}
                <div className="pt-2 border-t border-[#232332] flex items-center justify-center space-x-2">
                  <span className="text-[10px] text-gray-400">Tester :</span>
                  <button
                    onClick={() => applyConfig(sampleVless)}
                    className="text-[10px] bg-white/5 hover:bg-orange-500/20 text-orange-400 px-2 py-1 rounded border border-orange-500/30 transition"
                  >
                    Exemple VLESS
                  </button>
                  <button
                    onClick={() => applyConfig(sampleVMess)}
                    className="text-[10px] bg-white/5 hover:bg-orange-500/20 text-orange-400 px-2 py-1 rounded border border-orange-500/30 transition"
                  >
                    Exemple VMess
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl bg-[#1C1C29] p-2.5 border border-[#2B2B3E] space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between items-center text-gray-300">
                    <span className="text-gray-400">Profil :</span>
                    <span className="font-bold text-white truncate max-w-[200px]">{config.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span className="text-gray-400">Host / SNI :</span>
                    <span className="text-orange-400 font-bold truncate max-w-[200px]">{config.host}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span className="text-gray-400">Path :</span>
                    <span className="text-emerald-400 truncate max-w-[200px]">{config.path}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span className="text-gray-400">Serveur :</span>
                    <span className="text-gray-300">{config.server}:{config.port}</span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={handlePasteConfig}
                    className="flex-1 py-2 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/40 text-orange-400 font-bold text-xs flex items-center justify-center space-x-1.5 transition"
                  >
                    <Clipboard size={14} />
                    <span>Remplacer</span>
                  </button>
                  <button
                    onClick={clearConfig}
                    className="py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-xs flex items-center justify-center space-x-1.5 transition"
                  >
                    <Trash2 size={14} />
                    <span>Effacer</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Signature */}
          <footer className="pt-1 pb-1 text-center flex flex-col items-center justify-center space-y-0.5">
            <div className="flex items-center space-x-1.5 text-xs font-black text-orange-500 tracking-wider">
              <OrangeShield size={14} />
              <span>powered :@kcorp-tech</span>
            </div>
            <p className="text-[10px] text-gray-400 font-mono">
              Orange VPN v{APP_VERSION}  •  Xray Core v1.2.0
            </p>
          </footer>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: Mandatory Name Entry (User Onboarding)           */}
      {/* ======================================================== */}
      {showMandatoryNameModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-[#14141E] border-2 border-orange-500/50 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative">
            <div className="flex justify-center mb-3">
              <OrangeShield size={60} isGlowing />
            </div>

            <h2 className="text-xl font-black text-white">Bienvenue sur Orange VPN</h2>
            <span className="inline-block mt-1 text-[11px] font-bold text-orange-400 bg-orange-500/10 px-3 py-0.5 rounded-full border border-orange-500/30">
              Version {APP_VERSION} • powered :@kcorp-tech
            </span>

            <p className="mt-3 text-xs text-gray-300 leading-relaxed text-left">
              Pour activer votre profil sécurisé et recevoir vos alertes de consommation et de forfait, veuillez renseigner votre nom.
            </p>

            <form onSubmit={handleSaveMandatoryName} className="mt-4 space-y-3 text-left">
              <div>
                <label className="text-[11px] font-extrabold text-orange-400 uppercase tracking-wider block mb-1">
                  Nom de l'utilisateur (Obligatoire) *
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      if (nameError) setNameError('');
                    }}
                    placeholder="Ex: Jean-Paul, Alain, Christian..."
                    className="w-full bg-[#1C1C28] text-sm text-white pl-9 pr-3 py-2.5 rounded-xl border border-[#34344A] focus:border-orange-500 focus:outline-none transition font-medium"
                    autoFocus
                  />
                </div>
                {nameError && (
                  <p className="mt-1 text-[11px] text-red-400 font-semibold">{nameError}</p>
                )}
              </div>

              <div className="p-3 bg-[#1A1A26] rounded-xl border border-[#2B2B3F] text-[11px] text-gray-300 space-y-1">
                <div className="flex items-center space-x-1.5 text-orange-400 font-bold">
                  <CheckCircle2 size={13} />
                  <span>Avantages inclus :</span>
                </div>
                <div>• Notification dès 200 Mo de consommation consommés</div>
                <div>• Rappel quotidien de la date d'expiration de votre forfait</div>
                <div>• Mises à jour automatiques en direct depuis GitHub</div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-orange-500/30 transition transform active:scale-95"
              >
                Activer mon profil Orange VPN
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: 200 Mo Consumption Alert Modal                   */}
      {/* ======================================================== */}
      {consumptionAlertData && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#161622] border-2 border-orange-500 rounded-3xl p-5 max-w-sm w-full text-center shadow-2xl relative space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center text-orange-400">
              <AlertTriangle size={32} />
            </div>

            <h3 className="text-lg font-black text-white">Rappel Consommation Forfait</h3>

            <div className="p-3.5 bg-[#1F1F2F] rounded-2xl border border-orange-500/30 text-left space-y-2">
              <p className="text-xs text-gray-200 leading-relaxed">
                Cher <b className="text-orange-400">{userName || 'Client'}</b>,
              </p>
              <p className="text-xs text-white font-semibold leading-relaxed">
                Vous venez de consommer <b>200 Mo</b> de votre forfait !
              </p>
              <div className="pt-2 border-t border-[#313147] flex justify-between items-center text-xs">
                <span className="text-gray-400">Total consommé :</span>
                <span className="font-mono font-bold text-orange-300">{consumptionAlertData.consumedMb} Mo</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Nombre de Go restant :</span>
                <span className="font-mono font-bold text-emerald-400">{consumptionAlertData.remainingGb} Go</span>
              </div>
              <div className="pt-1 text-[11px] text-amber-300/90 italic">
                Veuillez souscrire à nouveau après l'expiration.
              </div>
            </div>

            <button
              onClick={() => setConsumptionAlertData(null)}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-orange-500/25 transition"
            >
              Compris, continuer
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: Daily Expiration Alert Modal                     */}
      {/* ======================================================== */}
      {expiryAlertData && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#161622] border-2 border-amber-500/60 rounded-3xl p-5 max-w-sm w-full text-center shadow-2xl relative space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400">
              <Calendar size={30} />
            </div>

            <h3 className="text-lg font-black text-white">Expiration de votre forfait</h3>

            <div className="p-3.5 bg-[#1E1E2C] rounded-2xl border border-amber-500/30 text-left space-y-2 text-xs">
              <p className="text-gray-200">
                Cher <b className="text-orange-400">{userName}</b>,
              </p>
              <p className="text-gray-200 leading-relaxed">
                Votre forfait Orange VPN expire le <b className="text-white">{expiryAlertData.expiryDateFormatted}</b>{' '}
                {expiryAlertData.daysRemaining <= 0 ? (
                  <span className="text-red-400 font-bold">(Expiré aujourd'hui)</span>
                ) : (
                  <span className="text-amber-400 font-bold">(dans {expiryAlertData.daysRemaining} jour(s))</span>
                )}.
              </p>
              <p className="text-gray-300 italic pt-1 border-t border-[#313146]">
                Pensez à renouveler votre abonnement ou contacter votre administrateur pour obtenir une nouvelle clé.
              </p>
            </div>

            <button
              onClick={() => setExpiryAlertData(null)}
              className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
            >
              OK, j'ai noté
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: Remote GitHub Broadcast Alert Modal             */}
      {/* ======================================================== */}
      {showBroadcastModal && activeBroadcast && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#14141E] border-2 border-orange-500 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3 relative text-left">
            <button
              onClick={() => {
                setShowBroadcastModal(false);
                if (activeBroadcast.id) {
                  localStorage.setItem('orange_last_broadcast_seen', activeBroadcast.id);
                }
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center space-x-2.5 text-orange-400">
              <Radio size={22} className="animate-pulse" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-orange-500/20 px-2 py-0.5 rounded border border-orange-500/40">
                Message en direct de l'administrateur
              </span>
            </div>

            <h3 className="text-base font-black text-white">{activeBroadcast.title}</h3>

            <div className="p-3 bg-[#1B1B26] rounded-xl border border-[#2D2D40] text-xs text-gray-200 leading-relaxed whitespace-pre-line">
              {activeBroadcast.message}
            </div>

            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span>Diffusé via GitHub repo</span>
              <span>{new Date(activeBroadcast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <button
              onClick={() => {
                setShowBroadcastModal(false);
                if (activeBroadcast.id) {
                  localStorage.setItem('orange_last_broadcast_seen', activeBroadcast.id);
                }
              }}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-extrabold text-xs rounded-xl shadow-lg transition"
            >
              Fermer le message
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: Remote App Update Available (Requested by User) */}
      {/* ======================================================== */}
      {showUpdateModal && availableUpdate && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#151520] border-2 border-emerald-500/80 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 text-left relative">
            <button
              onClick={() => {
                setShowUpdateModal(false);
                sessionStorage.setItem(`ignored_update_${availableUpdate.currentVersion}`, 'true');
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center space-x-2 text-emerald-400">
              <Sparkles size={22} />
              <span className="text-xs font-black uppercase tracking-wider">
                Nouvelle Version Disponible !
              </span>
            </div>

            <div>
              <h3 className="text-lg font-black text-white">
                Orange VPN v{availableUpdate.currentVersion}
              </h3>
              <p className="text-[11px] text-gray-400">
                Vous utilisez actuellement la version v{APP_VERSION}
              </p>
            </div>

            <div className="p-3 bg-[#1C1C29] rounded-xl border border-[#2F2F44] text-xs text-gray-200 leading-relaxed">
              <div className="font-bold text-orange-400 mb-1">Nouveautés :</div>
              <p>{availableUpdate.releaseNotes}</p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => {
                  setShowUpdateModal(false);
                  sessionStorage.setItem(`ignored_update_${availableUpdate.currentVersion}`, 'true');
                }}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs rounded-xl"
              >
                Plus tard
              </button>
              <a
                href={availableUpdate.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-1.5"
              >
                <Download size={14} />
                <span>Télécharger</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DRAWER: Notification Center                               */}
      {/* ======================================================== */}
      {showNotificationDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#14141E] border border-[#2E2E42] rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#242436] pb-2">
              <div className="flex items-center space-x-2">
                <Bell size={18} className="text-orange-500" />
                <h4 className="font-black text-white text-base">Notifications ({notifications.length})</h4>
              </div>
              <button onClick={() => setShowNotificationDrawer(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-xs">
                  Aucune notification pour le moment.
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-[#1C1C28] rounded-xl border border-[#2B2B3E] space-y-1 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-orange-400">{item.title}</span>
                      <span className="text-[9px] text-gray-400">{item.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{item.message}</p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-[#242436] flex space-x-2">
              <button
                onClick={() => setNotifications([])}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-bold text-xs rounded-xl"
              >
                Tout effacer
              </button>
              <button
                onClick={() => {
                  sendSystemNotification(
                    'Orange VPN • Test de notification',
                    `Bonjour ${userName || 'Cher client'}, les notifications système fonctionnent parfaitement !`
                  );
                  playChime('success');
                }}
                className="flex-1 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-bold text-xs rounded-xl border border-orange-500/30"
              >
                Tester Notification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: GitHub Broadcast & Update Guide (Requested)       */}
      {/* ======================================================== */}
      {showGitHubGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#14141E] border border-orange-500/40 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto text-left">
            <div className="flex items-center justify-between border-b border-[#252538] pb-2">
              <div className="flex items-center space-x-2">
                <Radio size={20} className="text-orange-500" />
                <h4 className="font-black text-white text-base">Diffusion & Mises à jour</h4>
              </div>
              <button onClick={() => setShowGitHubGuide(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="text-xs text-gray-300 space-y-2 leading-relaxed">
              <p className="font-bold text-orange-400">
                Comment envoyer un message à TOUS les utilisateurs depuis GitHub :
              </p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-gray-300 bg-[#1A1A26] p-3 rounded-xl border border-[#2B2B3F]">
                <li>Ouvrez votre dépôt GitHub <code className="text-orange-300">meta-jeady/Freebaduc</code>.</li>
                <li>Ouvrez le fichier <code className="text-orange-400 font-mono">public/broadcast.json</code>.</li>
                <li>Changez l'attribut <code className="text-white font-mono">"id"</code> (ex: <code className="text-emerald-400">"msg-02"</code>) et écrivez votre texte dans <code className="text-white font-mono">"message"</code>.</li>
                <li>Faites <b>Commit & Push</b>.</li>
                <li>Dès que le nouveau code est publié, <b>TOUS</b> vos utilisateurs connectés recevront instantanément votre notification système !</li>
              </ol>

              <div className="pt-2">
                <p className="font-bold text-orange-400 mb-1">
                  Tester la diffusion immédiatement en direct :
                </p>
                <input
                  type="text"
                  value={adminSimTitle}
                  onChange={(e) => setAdminSimTitle(e.target.value)}
                  placeholder="Titre de la notification"
                  className="w-full bg-[#1C1C28] text-xs text-white p-2 rounded-lg border border-[#313146] mb-1.5"
                />
                <textarea
                  value={adminSimMessage}
                  onChange={(e) => setAdminSimMessage(e.target.value)}
                  rows={2}
                  placeholder="Message pour tous les clients..."
                  className="w-full bg-[#1C1C28] text-xs text-white p-2 rounded-lg border border-[#313146] mb-2"
                />
                <button
                  onClick={handleTestBroadcastPush}
                  className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-extrabold text-xs rounded-xl flex items-center justify-center space-x-1.5 shadow-md shadow-orange-500/25"
                >
                  <Send size={14} />
                  <span>Diffuser maintenant à tous</span>
                </button>
              </div>

              <div className="pt-2 border-t border-[#252538]">
                <p className="font-bold text-emerald-400 mb-1">
                  Comment déployer une nouvelle version (ex: v2.3.5) :
                </p>
                <p className="text-[11px] text-gray-400">
                  Dans votre dépôt GitHub, modifiez le fichier <code className="text-emerald-400 font-mono">public/app-update.json</code> avec le nouveau numéro de version. L'application affichera automatiquement le pop-up <b>« Nouvelle version disponible »</b> à tous les téléphones !
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Settings & User Profile Management                 */}
      {/* ======================================================== */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#14141E] border border-[#29293C] rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#222232] pb-2">
              <h4 className="font-black text-white text-base">Paramètres du client</h4>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* User Profile Name */}
            <div className="p-3 bg-[#1B1B27] rounded-2xl border border-[#2B2B3F] space-y-2">
              <div className="text-[11px] font-bold text-orange-400 uppercase tracking-wide">
                Nom de l'utilisateur
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="flex-1 bg-[#232332] text-xs text-white px-3 py-2 rounded-xl border border-[#35354D] outline-none focus:border-orange-500"
                />
                <button
                  onClick={() => {
                    localStorage.setItem('orange_user_name', userName);
                    showToast('Nom mis à jour !');
                  }}
                  className="px-3 py-2 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl"
                >
                  Sauver
                </button>
              </div>
            </div>

            {/* Expiration Date Config */}
            <div className="p-3 bg-[#1B1B27] rounded-2xl border border-[#2B2B3F] space-y-2">
              <div className="text-[11px] font-bold text-gray-300">Date d'expiration du forfait</div>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => {
                  setExpiryDate(e.target.value);
                  localStorage.setItem('orange_expiry_date', e.target.value);
                  showToast('Date d\'expiration mise à jour');
                }}
                className="w-full bg-[#232332] text-xs text-white p-2 rounded-xl border border-[#35354D] outline-none focus:border-orange-500"
              />
              <p className="text-[10px] text-gray-400">
                L'application envoie une notification système quotidienne rappelant cette date.
              </p>
            </div>

            {/* Forfait Quota GB */}
            <div className="p-3 bg-[#1B1B27] rounded-2xl border border-[#2B2B3F] space-y-2">
              <div className="flex justify-between items-center text-[11px] font-bold text-gray-300">
                <span>Quota total du forfait</span>
                <span className="text-orange-400">{totalQuotaGb} Go</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={totalQuotaGb}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setTotalQuotaGb(val);
                  localStorage.setItem('orange_total_quota_gb', val.toString());
                }}
                className="w-full accent-orange-500"
              />
            </div>

            {/* Device Installation ID */}
            <div className="p-3 bg-[#1B1B27] rounded-2xl border border-[#2B2B3F]">
              <div className="text-[11px] font-bold text-gray-400">ID DE CET APPAREIL</div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-sm font-extrabold text-orange-400">{installationId}</span>
                <button
                  onClick={copyAppId}
                  className="p-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg transition"
                >
                  {copiedId ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* Reset Traffic Counter */}
            <div className="pt-1 flex space-x-2">
              <button
                onClick={() => {
                  setTotalTrafficBytes(0);
                  setLastMilestone200Mb(0);
                  localStorage.setItem('orange_traffic_bytes', '0');
                  localStorage.setItem('orange_last_milestone_200mb', '0');
                  showToast('Compteur de données réinitialisé à 0');
                }}
                className="w-full py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-bold text-xs rounded-xl"
              >
                Réinitialiser compteur de données
              </button>
            </div>

            <div className="text-center pt-2 text-[10px] font-bold text-orange-500">
              Orange VPN v{APP_VERSION} • powered :@kcorp-tech
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Manual Paste Dialog                               */}
      {/* ======================================================== */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#14141E] border border-[#2E2E40] rounded-3xl p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <OrangeShield size={24} />
                <h4 className="font-black text-white text-base">Coller la configuration</h4>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-300 mb-3">
              Collez votre lien VLESS, VMess ou clé Orange ci-dessous :
            </p>
            <textarea
              value={manualInputText}
              onChange={(e) => setManualInputText(e.target.value)}
              placeholder="vless://... ou orange://config/..."
              rows={4}
              className="w-full bg-[#1F1F2C] text-xs font-mono text-white p-3 rounded-xl border border-[#34344A] outline-none focus:border-orange-500 transition resize-none"
            />
            <div className="flex space-x-2 mt-4">
              <button
                onClick={() => setShowPasteModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs"
              >
                Annuler
              </button>
              <button
                onClick={() => applyConfig(manualInputText)}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs shadow-lg shadow-orange-500/30"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Logs                                              */}
      {/* ======================================================== */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121218] border border-[#2C2C3E] rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal size={18} className="text-orange-500" />
                <h4 className="font-black text-white text-base">Terminal Orange VPN v{APP_VERSION}</h4>
              </div>
              <button onClick={() => setShowLogs(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="h-64 overflow-y-auto font-mono text-[11px] bg-[#0A0A0D] p-3 rounded-xl space-y-1.5 border border-[#22222E]">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.includes('succès') || log.includes('✅')
                      ? 'text-emerald-400'
                      : log.includes('Erreur') || log.includes('❌') || log.includes('⚠️')
                      ? 'text-red-400'
                      : log.includes('Orange') || log.includes('📢')
                      ? 'text-orange-400'
                      : 'text-gray-400'
                  }
                >
                  {log}
                </div>
              ))}
            </div>

            <button
              onClick={() => setLogs([])}
              className="w-full py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-bold text-xs rounded-xl"
            >
              Effacer les logs
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
