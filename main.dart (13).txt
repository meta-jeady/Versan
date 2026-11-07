import 'dart:convert';
import 'dart:math';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:encrypt/encrypt.dart' as enc;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'package:package_info_plus/package_info_plus.dart';

final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

/// Clé globale pour afficher un dialogue même depuis une notification
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

/// Message en attente à afficher quand l'utilisateur clique sur la notification
String? _pendingNotifTitle;
String? _pendingNotifBody;

Future<void> _initNotifications() async {
  tz_data.initializeTimeZones();
  try {
    final String timeZoneName = await FlutterTimezone.getLocalTimezone();
    tz.setLocalLocation(tz.getLocation(timeZoneName));
  } catch (_) {
    tz.setLocalLocation(tz.getLocation('UTC'));
  }

  const AndroidInitializationSettings androidInit =
      AndroidInitializationSettings('@mipmap/ic_launcher');
  const DarwinInitializationSettings iosInit = DarwinInitializationSettings();
  const InitializationSettings initSettings = InitializationSettings(
    android: androidInit,
    iOS: iosInit,
  );

  await flutterLocalNotificationsPlugin.initialize(
    initSettings,
    onDidReceiveNotificationResponse: (NotificationResponse response) async {
      final payload = response.payload;

      // 1. Si c'est un lien → ouvrir le navigateur
      if (payload != null && payload.startsWith('http')) {
        final uri = Uri.tryParse(payload);
        if (uri != null) {
          try {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          } catch (_) {
            try {
              await launchUrl(uri, mode: LaunchMode.platformDefault);
            } catch (_) {}
          }
        }
        return;
      }

      // 2. Sinon → afficher le message en grand dans l'application
      // Format payload : "TITLE|||BODY"
      if (payload != null && payload.contains('|||')) {
        final parts = payload.split('|||');
        _pendingNotifTitle = parts[0];
        _pendingNotifBody = parts.length > 1 ? parts.sublist(1).join('|||') : '';
      } else if (payload != null && payload.isNotEmpty) {
        _pendingNotifTitle = "Orange VPN";
        _pendingNotifBody = payload;
      }

      // Affiche le dialogue dès que possible
      _showPendingNotificationDialog();
    },
  );

  // Créer le canal avec importance MAX (obligatoire pour que les notifs restent)
  final androidPlugin = flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();

  await androidPlugin?.createNotificationChannel(
    const AndroidNotificationChannel(
      'orange_vpn_channel',
      'Orange VPN',
      description: 'Notifications Orange VPN (expiration, quota, broadcast)',
      importance: Importance.max,
      playSound: true,
      enableVibration: true,
      showBadge: true,
    ),
  );

  // Demander la permission Android 13+
  await androidPlugin?.requestNotificationsPermission();

  // Demander la permission des alarmes exactes (Android 12+) pour les rappels d'expiration
  try {
    await androidPlugin?.requestExactAlarmsPermission();
  } catch (_) {}
}

/// Affiche le message de la notification en grand (l'utilisateur doit le lire)
void _showPendingNotificationDialog() {
  if (_pendingNotifTitle == null && _pendingNotifBody == null) return;

  final title = _pendingNotifTitle ?? "Orange VPN";
  final body = _pendingNotifBody ?? "";
  _pendingNotifTitle = null;
  _pendingNotifBody = null;

  // Attend que le navigateur soit prêt
  Future.delayed(const Duration(milliseconds: 400), () {
    final ctx = navigatorKey.currentContext;
    if (ctx == null) return;

    showDialog(
      context: ctx,
      barrierDismissible: false, // L'utilisateur DOIT lire et fermer
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: const Color(0xFF16161D),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const Icon(Icons.notifications_active, color: Color(0xFFFF7900), size: 26),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Text(
            body,
            style: const TextStyle(
              color: Color(0xFFDDDDDD),
              fontSize: 15,
              height: 1.45,
            ),
          ),
        ),
        actions: [
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.pop(dialogCtx),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFF7900),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                "J'ai lu",
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
              ),
            ),
          ),
        ],
      ),
    );
  });
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  await _initNotifications();
  runApp(const OrangeVpnApp());
}

class OrangeVpnApp extends StatefulWidget {
  const OrangeVpnApp({super.key});

  @override
  State<OrangeVpnApp> createState() => _OrangeVpnAppState();
}

class _OrangeVpnAppState extends State<OrangeVpnApp> {
  // 0 = Noir & Orange (Pro Dark - Default), 1 = Blanc & Orange (Pro Light)
  int _themeMode = 0;

  @override
  void initState() {
    super.initState();
    _loadThemeSettings();
  }

  Future<void> _loadThemeSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      final saved = prefs.getInt('themeMode') ?? 0;
      _themeMode = (saved == 0 || saved == 1) ? saved : 0;
    });
  }

  void changeTheme(int mode) {
    setState(() => _themeMode = mode);
  }

  ThemeData _buildDarkTheme() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: const Color(0xFF0C0C0E),
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFFF7900),
        brightness: Brightness.dark,
        primary: const Color(0xFFFF7900),
        secondary: const Color(0xFF10B981),
        surface: const Color(0xFF16161D),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1B1B22),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        contentTextStyle: const TextStyle(color: Colors.white),
      ),
    );
  }

  ThemeData _buildLightTheme() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: const Color(0xFFF7F8FA),
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFFF7900),
        brightness: Brightness.light,
        primary: const Color(0xFFFF7900),
        secondary: const Color(0xFF059669),
        surface: Colors.white,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Color(0xFF111111),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1E1E24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        contentTextStyle: const TextStyle(color: Colors.white),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = _themeMode == 0 ? _buildDarkTheme() : _buildLightTheme();

    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Orange VPN',
      debugShowCheckedModeBanner: false,
      theme: theme,
      home: HomeScreen(themeMode: _themeMode, onThemeChanged: changeTheme),
    );
  }
}

// ========== AES-256 CHIFFREMENT ==========
final String _customKey = "orange295425368579".padRight(32, '0');
final String _customIV = "orange_secret_iv".padRight(16, '0');

String _obfuscate(String plain) {
  final key = enc.Key.fromUtf8(_customKey);
  final iv = enc.IV.fromUtf8(_customIV);
  final encrypter = enc.Encrypter(enc.AES(key));
  return encrypter.encrypt(plain, iv: iv).base64;
}

String _deobfuscate(String encoded) {
  final key = enc.Key.fromUtf8(_customKey);
  final iv = enc.IV.fromUtf8(_customIV);
  final encrypter = enc.Encrypter(enc.AES(key));
  return encrypter.decrypt64(encoded, iv: iv);
}

/// Génère un ID unique d'installation (format OR-XXXXXXXX ou XV-XXXXXXXX)
String _generateInstallationId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  final rnd = Random.secure();
  final part1 = List.generate(4, (_) => chars[rnd.nextInt(chars.length)]).join();
  final part2 = List.generate(4, (_) => chars[rnd.nextInt(chars.length)]).join();
  return 'OR-$part1-$part2';
}

// ========== BOUCLIER ORANGE (LOGO WIDGET) ==========
class OrangeShield extends StatelessWidget {
  final double size;
  final bool isGlowing;

  const OrangeShield({super.key, this.size = 36, this.isGlowing = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: isGlowing
            ? [
                BoxShadow(
                  color: const Color(0xFFFF7900).withOpacity(0.40),
                  blurRadius: size * 0.45,
                  spreadRadius: 2,
                )
              ]
            : null,
      ),
      child: Center(
        child: CustomPaint(
          size: Size(size, size),
          painter: _OrangeShieldPainter(),
        ),
      ),
    );
  }
}

class _OrangeShieldPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final path = Path();
    path.moveTo(w * 0.5, h * 0.05);
    path.lineTo(w * 0.88, h * 0.22);
    path.cubicTo(w * 0.88, h * 0.62, w * 0.5, h * 0.88, w * 0.5, h * 0.95);
    path.cubicTo(w * 0.5, h * 0.88, w * 0.12, h * 0.62, w * 0.12, h * 0.22);
    path.close();

    final fillPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFFFA23A), Color(0xFFFF7900), Color(0xFFE65100)],
      ).createShader(Rect.fromLTWH(0, 0, w, h))
      ..style = PaintingStyle.fill;

    canvas.drawPath(path, fillPaint);

    final borderPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFFFFD180), Color(0xFFFF7900)],
      ).createShader(Rect.fromLTWH(0, 0, w, h))
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.065;

    canvas.drawPath(path, borderPaint);

    // Inner checkmark / protection symbol
    final emblemPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.08
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final checkPath = Path();
    checkPath.moveTo(w * 0.35, h * 0.50);
    checkPath.lineTo(w * 0.47, h * 0.62);
    checkPath.lineTo(w * 0.68, h * 0.38);

    canvas.drawPath(checkPath, emblemPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ========== HOME SCREEN ==========
class HomeScreen extends StatefulWidget {
  final int themeMode;
  final Function(int) onThemeChanged;
  const HomeScreen(
      {super.key, required this.themeMode, required this.onThemeChanged});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with TickerProviderStateMixin {
  late FlutterV2ray v2ray;
  late AnimationController _pulseController;
  late AnimationController _rotateController;
  late Animation<double> _pulseAnimation;

  String statut = "DÉCONNECTÉ";
  bool estConnecte = false;
  bool enCours = false;
  String modeSelectionne = "VLESS / VMess";
  bool isLocked = false;

  DateTime? connectedAt;
  String connectionTime = "00:00";

  String? lockedHost;
  String? lockedConfig;
  String? lockedName;
  DateTime? lockedExpireDate;

  // Auto-configuration parsed fields
  String profileName = "";
  String detectedHost = "";
  String detectedPath = "";
  String detectedServer = "";
  bool hasConfig = false;

  /// ID unique de cette installation (format OR-XXXXXXXX)
  String installationId = "";

  final List<String> modes = [
    "VLESS / VMess",
    "UDP",
    "SlowDNS",
    "SSH",
    "Trojan",
  ];

  final TextEditingController hostCtrl = TextEditingController();
  final TextEditingController configCtrl = TextEditingController();
  final List<String> logs = [];
  List<String> blockedApps = [];

  List<double> uploadPoints = [];
  List<double> downloadPoints = [];
  static const int maxGraphPoints = 60;
  int uploadTotal = 0;
  int downloadTotal = 0;
  double currentUpSpeed = 0;
  double currentDownSpeed = 0;
  int lastUpSession = 0;
  int lastDownSession = 0;

  // ===== Quota / Data limit (per Orange link) =====
  /// Unique key embedded in the generated link to track usage across sessions
  String? usageKey;
  /// Quota in bytes (null = unlimited)
  int? dataQuotaBytes;
  /// Bytes already consumed for this usageKey (persisted, survives disconnect)
  int consumedBytes = 0;
  /// True when quota is exhausted
  bool get isQuotaExhausted =>
      dataQuotaBytes != null && dataQuotaBytes! > 0 && consumedBytes >= dataQuotaBytes!;

  // ===== Profil utilisateur & Features README v2.3.4 =====
  String userName = "";
  bool hasUserName = false;
  String lastBroadcastId = "";
  bool hasShown200MoAlert = false;
  /// Dernier seuil de 100 Mo pour lequel une notification a été envoyée
  int lastNotified100MbThreshold = 0;
  Timer? _broadcastPollTimer;
  static const String _broadcastUrl =
      "https://raw.githubusercontent.com/meta-jeady/Versan/main/public/broadcast.json";
  static const String _updateUrl =
      "https://raw.githubusercontent.com/meta-jeady/Versan/main/public/app-update.json";
  static const int _threshold200Mo = 200 * 1024 * 1024; // 200 Mo en bytes
  static const int _threshold100Mo = 100 * 1024 * 1024; // 100 Mo en bytes

  /// Horaires quotidiens des rappels d'expiration (heure, minute)
  static const List<List<int>> _expirationReminderTimes = [
    [5, 0],   // 05:00
    [12, 30], // 12:30
    [14, 0],  // 14:00
    [20, 45], // 20:45
    [22, 6],  // 22:06
  ];

  bool get isLight => widget.themeMode == 1;

  // Professional Orange, Black & White Palette
  Color get bg => isLight ? const Color(0xFFF7F8FA) : const Color(0xFF0C0C0E);
  Color get card => isLight ? Colors.white : const Color(0xFF16161D);
  Color get surface => isLight ? const Color(0xFFEFF1F5) : const Color(0xFF20202A);
  Color get text => isLight ? const Color(0xFF111111) : Colors.white;
  Color get text2 => isLight ? const Color(0xFF555562) : const Color(0xFFA1A1AA);
  Color get text3 => isLight ? const Color(0xFF888896) : const Color(0xFF71717A);
  Color get border =>
      isLight ? const Color(0xFFE2E4E9) : const Color(0xFF282836);
  Color get orangeAccent => const Color(0xFFFF7900);
  Color get orangeGradientEnd => const Color(0xFFFF5500);
  Color get green => const Color(0xFF10B981);
  Color get greenDark => const Color(0xFF059669);
  Color get red => const Color(0xFFEF4444);

  Color get statusColor {
    if (estConnecte) return green;
    if (enCours) return orangeAccent;
    return const Color(0xFF9E9E9E);
  }

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1600),
      vsync: this,
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _rotateController = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    );

    Stream.periodic(const Duration(seconds: 1)).listen((_) {
      if (estConnecte && connectedAt != null && mounted) {
        final d = DateTime.now().difference(connectedAt!);
        setState(() {
          connectionTime =
              "${d.inMinutes.toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}";
        });
      }
    });

    v2ray = FlutterV2ray(
      onStatusChanged: (status) {
        if (!mounted) return;
        final state = status.state.toUpperCase();
        setState(() {
          if (state == "CONNECTED") {
            final up = status.upload ?? 0;
            final down = status.download ?? 0;
            final deltaUp = up - lastUpSession;
            final deltaDown = down - lastDownSession;
            currentUpSpeed = (deltaUp > 0 ? deltaUp : 0) / 1024.0;
            currentDownSpeed = (deltaDown > 0 ? deltaDown : 0) / 1024.0;
            lastUpSession = up;
            lastDownSession = down;
            uploadTotal = up;
            downloadTotal = down;
            addDataPoint(uploadPoints, uploadTotal / (1024.0 * 1024.0));
            addDataPoint(downloadPoints, downloadTotal / (1024.0 * 1024.0));
            saveTrafficData();

            // Accumuler la consommation pour le quota (ne se réinitialise pas au disconnect)
            if (usageKey != null && (deltaUp > 0 || deltaDown > 0)) {
              final added = (deltaUp > 0 ? deltaUp : 0) + (deltaDown > 0 ? deltaDown : 0);
              final previous = consumedBytes;
              consumedBytes += added;
              _saveConsumedBytes();
              if (isQuotaExhausted) {
                addLog("⚠️ Quota de données atteint – déconnexion automatique");
                // Auto-stop will be handled after setState by calling stop
              }
              // Alerte tous les 100 Mo consommés
              _checkAndNotify100MbThresholds(previous, consumedBytes);
              // Alerte 200 Mo (README v2.3.4) – conservée en plus
              if (!hasShown200MoAlert &&
                  previous < _threshold200Mo &&
                  consumedBytes >= _threshold200Mo) {
                _trigger200MoAlert();
              }
            }

            if (statut != "CONNECTÉ") {
              addLog("→ Tunnel Orange VPN établi avec succès");
              statut = "CONNECTÉ";
              estConnecte = true;
              enCours = false;
              connectedAt = DateTime.now();
              _pulseController.repeat(reverse: true);
              _rotateController.stop();
              showSnack("Connexion Orange VPN réussie avec succès 🛡️", greenDark);
            }
          } else if (state == "CONNECTING") {
            statut = "CONNEXION...";
            enCours = true;
            estConnecte = false;
            _rotateController.repeat();
          } else {
            statut = "DÉCONNECTÉ";
            estConnecte = false;
            enCours = false;
            currentUpSpeed = 0;
            currentDownSpeed = 0;
            connectedAt = null;
            connectionTime = "00:00";
            _pulseController.stop();
            _rotateController.stop();
            addDataPoint(uploadPoints, uploadTotal / (1024.0 * 1024.0));
            addDataPoint(downloadPoints, downloadTotal / (1024.0 * 1024.0));
          }
        });

        // Si quota épuisé pendant la session, on coupe le tunnel
        if (state == "CONNECTED" && isQuotaExhausted) {
          Future.microtask(() async {
            try {
              await v2ray.stopV2Ray();
            } catch (_) {}
            if (mounted) {
              showSnack(
                "🚨 Quota de données épuisé. Ce lien ne peut plus être utilisé.",
                red,
              );
            }
          });
        }
      },
    );

    initCore();
    _ensureInstallationId();
    loadTrafficData();
    loadSettingsData();
    _loadUserProfile();

    // Charge la config puis lance les features README
    loadSavedConfig().then((_) {
      if (mounted) {
        _scheduleDailyExpirationNotification();
      }
    });

    // Affichage automatique du message de bienvenue + nom obligatoire
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkMandatoryUserName();
      _checkForAppUpdate();
      _startBroadcastPolling();
      // Si l'utilisateur a cliqué sur une notification pendant que l'app était fermée
      _showPendingNotificationDialog();
    });
  }

  @override
  void dispose() {
    _broadcastPollTimer?.cancel();
    _pulseController.dispose();
    _rotateController.dispose();
    hostCtrl.dispose();
    configCtrl.dispose();
    super.dispose();
  }

  /// Charge le nom d'utilisateur et flags depuis SharedPreferences
  Future<void> _loadUserProfile() async {
    final p = await SharedPreferences.getInstance();
    final name = p.getString('userName') ?? "";
    final lastId = p.getString('lastBroadcastId') ?? "";
    final shown200 = p.getBool('hasShown200MoAlert') ?? false;
    final last100 = p.getInt('lastNotified100MbThreshold') ?? 0;
    if (mounted) {
      setState(() {
        userName = name;
        hasUserName = name.trim().isNotEmpty;
        lastBroadcastId = lastId;
        hasShown200MoAlert = shown200;
        lastNotified100MbThreshold = last100;
      });
    }
  }

  /// Force la saisie du nom (obligatoire selon README)
  /// Le nom est mémorisé définitivement → ne redemande JAMAIS après la 1ère saisie
  Future<void> _checkMandatoryUserName() async {
    if (!mounted) return;

    // Toujours lire depuis SharedPreferences (évite le bug au redémarrage)
    final p = await SharedPreferences.getInstance();
    final savedName = (p.getString('userName') ?? "").trim();

    if (savedName.isNotEmpty) {
      // Nom déjà enregistré → on ne redemande JAMAIS
      if (mounted) {
        setState(() {
          userName = savedName;
          hasUserName = true;
        });
      }
      return;
    }

    // Première ouverture uniquement → dialogue obligatoire
    await _showNameInputDialog();
  }

  Future<void> _showNameInputDialog() async {
    final TextEditingController nameCtrl = TextEditingController();
    bool canSubmit = false;

    await showDialog(
      context: context,
      barrierDismissible: false, // OBLIGATOIRE
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: card,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
          contentPadding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const OrangeShield(size: 58, isGlowing: true),
              const SizedBox(height: 16),
              Text(
                "Bienvenue sur Orange VPN 🛡️",
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                  color: text,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                "Pour activer votre profil, veuillez entrer votre nom.\nCe nom sera utilisé dans les notifications personnalisées.",
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: text2, height: 1.4),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: nameCtrl,
                autofocus: true,
                textCapitalization: TextCapitalization.words,
                style: TextStyle(color: text, fontSize: 16),
                decoration: InputDecoration(
                  hintText: "Votre prénom ou nom",
                  hintStyle: TextStyle(color: text3),
                  filled: true,
                  fillColor: surface,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
                onChanged: (v) {
                  setDialogState(() => canSubmit = v.trim().length >= 2);
                },
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: canSubmit
                      ? () async {
                          final name = nameCtrl.text.trim();
                          if (name.length < 2) return;
                          final p = await SharedPreferences.getInstance();
                          await p.setString('userName', name);
                          await p.setBool('orange_welcome_seen', true);
                          if (mounted) {
                            setState(() {
                              userName = name;
                              hasUserName = true;
                            });
                          }
                          Navigator.pop(ctx);
                          showSnack("Profil activé. Bienvenue $name ! 🛡️", greenDark);
                        }
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: orangeAccent,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: orangeAccent.withOpacity(0.4),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    "Activer mon profil",
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ========== FEATURES README v2.3.4 ==========

  String get _displayName => userName.trim().isEmpty ? "Utilisateur" : userName.trim();

  /// Alerte système à 200 Mo de consommation
  Future<void> _trigger200MoAlert() async {
    if (hasShown200MoAlert) return;
    hasShown200MoAlert = true;
    final p = await SharedPreferences.getInstance();
    await p.setBool('hasShown200MoAlert', true);

    // Force le vrai nom
    final savedName = (p.getString('userName') ?? "").trim();
    final displayName = savedName.isEmpty ? "Utilisateur" : savedName;

    String remaining = "illimité";
    if (dataQuotaBytes != null && dataQuotaBytes! > 0) {
      final left = (dataQuotaBytes! - consumedBytes).clamp(0, dataQuotaBytes!);
      remaining = formatBytes(left);
    }

    final title = "Orange VPN • Consommation";
    final body =
        "Cher $displayName, vous venez de consommer 200 Mo de votre forfait ! Il vous reste $remaining. Veuillez souscrire à nouveau après l'expiration.";

    await _showSystemNotification(
      id: 200,
      title: title,
      body: body,
      payload: null,
    );

    if (mounted) {
      showSnack(body, orangeAccent);
      addLog("📊 Alerte 200 Mo déclenchée pour $displayName");
    }
  }

  /// Notification système générique (reste dans la barre jusqu'au clic)
  /// Quand l'utilisateur clique → l'app s'ouvre et affiche le message en grand
  Future<void> _showSystemNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    // Toujours recharger le nom depuis le stockage (évite le nom vide)
    final p = await SharedPreferences.getInstance();
    final savedName = (p.getString('userName') ?? "").trim();
    final displayName = savedName.isEmpty ? "Utilisateur" : savedName;

    // Force le vrai nom dans le message
    String finalBody = body;
    if (savedName.isNotEmpty) {
      finalBody = body.replaceAllMapped(
        RegExp(r'Cher\s+[^,]+'),
        (m) => "Cher $displayName",
      );
    }

    // Payload = titre + message pour afficher le dialogue au clic
    // Si un lien est fourni on le garde, sinon on met le message
    final String finalPayload = (payload != null && payload.startsWith('http'))
        ? payload
        : "$title|||$finalBody";

    final AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'orange_vpn_channel',
      'Orange VPN',
      channelDescription: 'Notifications Orange VPN (expiration, quota, broadcast)',
      importance: Importance.max,
      priority: Priority.max,
      showWhen: true,
      icon: '@mipmap/ic_launcher',
      color: const Color(0xFFFF7900),
      playSound: true,
      enableVibration: true,
      autoCancel: true, // disparaît seulement après le clic
      ongoing: false,
      category: AndroidNotificationCategory.message,
      visibility: NotificationVisibility.public,
      channelShowBadge: true,
      styleInformation: BigTextStyleInformation(
        finalBody,
        contentTitle: title,
        summaryText: 'Orange VPN • Touchez pour lire',
      ),
    );

    final NotificationDetails details = NotificationDetails(android: androidDetails);

    await flutterLocalNotificationsPlugin.show(
      id,
      title,
      finalBody,
      details,
      payload: finalPayload,
    );
  }

  /// Polling du fichier broadcast.json sur GitHub
  void _startBroadcastPolling() {
    _checkBroadcastOnce(); // Vérifie immédiatement au démarrage
    _broadcastPollTimer?.cancel();
    // Vérifie toutes les 45 secondes (au lieu de 3 minutes)
    _broadcastPollTimer = Timer.periodic(const Duration(seconds: 45), (_) {
      _checkBroadcastOnce();
    });
  }

  Future<void> _checkBroadcastOnce() async {
    try {
      final resp = await http.get(Uri.parse(_broadcastUrl)).timeout(const Duration(seconds: 8));
      if (resp.statusCode != 200) return;
      final map = jsonDecode(resp.body) as Map<String, dynamic>;
      final id = map['id']?.toString() ?? "";
      if (id.isEmpty || id == lastBroadcastId) return;

      final title = map['title']?.toString() ?? "Orange VPN • Info";
      final message = map['message']?.toString() ?? "";
      final actionUrl = map['actionUrl']?.toString();

      lastBroadcastId = id;
      final p = await SharedPreferences.getInstance();
      await p.setString('lastBroadcastId', id);

      await _showSystemNotification(
        id: 100 + (id.hashCode % 900),
        title: title,
        body: message.isNotEmpty ? message : "Nouveau message de diffusion Orange VPN",
        payload: actionUrl,
      );

      if (mounted) {
        addLog("📡 Broadcast reçu : $id");
        showSnack("$title\n$message", orangeAccent);
      }
    } catch (e) {
      // Silencieux en arrière-plan
    }
  }

  /// Vérifie les nouvelles versions via app-update.json
  Future<void> _checkForAppUpdate() async {
    try {
      final resp = await http.get(Uri.parse(_updateUrl)).timeout(const Duration(seconds: 8));
      if (resp.statusCode != 200) return;
      final map = jsonDecode(resp.body) as Map<String, dynamic>;
      final remoteVersion = map['currentVersion']?.toString() ?? "";
      final force = map['forceUpdate'] == true;
      final notes = map['releaseNotes']?.toString() ?? "";
      final downloadUrl = map['downloadUrl']?.toString() ?? "";

      if (remoteVersion.isEmpty) return;

      final packageInfo = await PackageInfo.fromPlatform();
      final localVersion = packageInfo.version; // "2.3.4"

      if (_isVersionGreater(remoteVersion, localVersion)) {
        if (!mounted) return;
        showDialog(
          context: context,
          barrierDismissible: !force,
          builder: (ctx) => AlertDialog(
            backgroundColor: card,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
            title: Text(
              "Nouvelle version disponible !",
              style: TextStyle(color: text, fontWeight: FontWeight.w800),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Version $remoteVersion (vous avez $localVersion)",
                  style: TextStyle(color: text2, fontSize: 14),
                ),
                if (notes.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(notes, style: TextStyle(color: text, fontSize: 13, height: 1.4)),
                ],
              ],
            ),
            actions: [
              if (!force)
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text("Plus tard", style: TextStyle(color: text3)),
                ),
              ElevatedButton(
                onPressed: () async {
                  Navigator.pop(ctx);
                  await _openDownloadUrl(downloadUrl);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: orangeAccent,
                  foregroundColor: Colors.white,
                ),
                child: const Text("Télécharger maintenant"),
              ),
            ],
          ),
        );
      }
    } catch (_) {}
  }

  /// Ouvre l'URL de téléchargement de manière robuste (app fermée / navigateur externe)
  Future<void> _openDownloadUrl(String? rawUrl) async {
    // URL de secours si le JSON est vide ou invalide
    const fallbackUrl = "https://github.com/meta-jeady/Versan/releases/latest";
    final url = (rawUrl != null && rawUrl.trim().isNotEmpty)
        ? rawUrl.trim()
        : fallbackUrl;

    final uri = Uri.tryParse(url);
    if (uri == null) {
      if (mounted) {
        showSnack("Lien de téléchargement invalide", red);
      }
      return;
    }

    try {
      // Ne pas bloquer sur canLaunchUrl (souvent false sur Android 11+ sans <queries>)
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        // Deuxième tentative en mode platformDefault
        final launched2 = await launchUrl(
          uri,
          mode: LaunchMode.platformDefault,
        );
        if (!launched2 && mounted) {
          showSnack(
            "Impossible d'ouvrir le lien. Copiez-le manuellement : $url",
            orangeAccent,
          );
          await Clipboard.setData(ClipboardData(text: url));
        }
      }
    } catch (e) {
      // Dernier recours : copier le lien dans le presse-papier
      try {
        await Clipboard.setData(ClipboardData(text: url));
        if (mounted) {
          showSnack(
            "Lien copié dans le presse-papier. Collez-le dans votre navigateur.",
            orangeAccent,
          );
        }
      } catch (_) {
        if (mounted) {
          showSnack("Erreur d'ouverture du lien de téléchargement", red);
        }
      }
    }
  }

  bool _isVersionGreater(String remote, String local) {
    try {
      final r = remote.split('.').map((e) => int.tryParse(e) ?? 0).toList();
      final l = local.split('.').map((e) => int.tryParse(e) ?? 0).toList();
      for (int i = 0; i < 3; i++) {
        final rv = i < r.length ? r[i] : 0;
        final lv = i < l.length ? l[i] : 0;
        if (rv > lv) return true;
        if (rv < lv) return false;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Calcule le prochain TZDateTime pour une heure:minute donnée (aujourd'hui ou demain)
  tz.TZDateTime _nextInstanceOfTime(int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );
    if (scheduled.isBefore(now) || scheduled.isAtSameMomentAs(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    return scheduled;
  }

  /// Construit le message d'expiration personnalisé
  Future<Map<String, String>> _buildExpirationMessage() async {
    final expire = lockedExpireDate!;
    final now = DateTime.now();
    final daysLeft = expire.difference(now).inDays;
    final dateStr =
        "${expire.day.toString().padLeft(2, '0')}/${expire.month.toString().padLeft(2, '0')}/${expire.year}";

    final p = await SharedPreferences.getInstance();
    final savedName = (p.getString('userName') ?? "").trim();
    final displayName = savedName.isEmpty ? "Utilisateur" : savedName;

    final title = "Orange VPN • Expiration";
    final body =
        "Cher $displayName, votre forfait Orange VPN expire le $dateStr (dans $daysLeft jour${daysLeft > 1 ? 's' : ''}). Pensez à renouveler votre abonnement.";
    return {"title": title, "body": body};
  }

  /// Programme les notifications d'expiration aux 5 horaires quotidiens
  /// (05:00, 12:30, 14:00, 20:45, 22:06) — fonctionne même app fermée
  Future<void> _scheduleDailyExpirationNotification() async {
    if (lockedExpireDate == null) return;

    final expire = lockedExpireDate!;
    final now = DateTime.now();
    if (expire.isBefore(now)) {
      // Forfait déjà expiré → annuler les rappels programmés
      for (int i = 0; i < _expirationReminderTimes.length; i++) {
        await flutterLocalNotificationsPlugin.cancel(60 + i);
      }
      return;
    }

    final msg = await _buildExpirationMessage();
    final title = msg["title"]!;
    final body = msg["body"]!;

    // Notification immédiate à l'ouverture (max 1x / jour)
    final p = await SharedPreferences.getInstance();
    final lastDay = p.getString('lastExpirationNotifDay') ?? "";
    final today = "${now.year}-${now.month}-${now.day}";
    if (lastDay != today) {
      await p.setString('lastExpirationNotifDay', today);
      await _showSystemNotification(
        id: 50,
        title: title,
        body: body,
      );
      if (mounted) {
        final daysLeft = expire.difference(now).inDays;
        addLog("📅 Rappel d'expiration envoyé ($daysLeft j restants)");
      }
    }

    // Programmer les 5 rappels quotidiens récurrents
    // IDs 60 à 64 — matchDateTimeComponents.time = répétition chaque jour
    final androidDetails = AndroidNotificationDetails(
      'orange_vpn_channel',
      'Orange VPN',
      channelDescription: 'Notifications Orange VPN (expiration, quota, broadcast)',
      importance: Importance.max,
      priority: Priority.max,
      icon: '@mipmap/ic_launcher',
      color: const Color(0xFFFF7900),
      playSound: true,
      enableVibration: true,
      autoCancel: true,
      styleInformation: BigTextStyleInformation(
        body,
        contentTitle: title,
        summaryText: 'Orange VPN • Touchez pour lire',
      ),
    );
    final details = NotificationDetails(android: androidDetails);
    final payload = "$title|||$body";

    for (int i = 0; i < _expirationReminderTimes.length; i++) {
      final hour = _expirationReminderTimes[i][0];
      final minute = _expirationReminderTimes[i][1];
      final scheduledDate = _nextInstanceOfTime(hour, minute);
      final notifId = 60 + i;

      try {
        // Annuler l'ancienne planification pour cet ID avant de reprogrammer
        await flutterLocalNotificationsPlugin.cancel(notifId);

        await flutterLocalNotificationsPlugin.zonedSchedule(
          notifId,
          title,
          body,
          scheduledDate,
          details,
          androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
          uiLocalNotificationDateInterpretation:
              UILocalNotificationDateInterpretation.absoluteTime,
          matchDateTimeComponents: DateTimeComponents.time,
          payload: payload,
        );
      } catch (e) {
        // Sur certains appareils exact alarms nécessitent permission
        if (mounted) {
          addLog("Impossible de programmer le rappel $hour:${minute.toString().padLeft(2, '0')}: $e");
        }
      }
    }

    if (mounted) {
      addLog("📅 Rappels d'expiration programmés : 05:00 • 12:30 • 14:00 • 20:45 • 22:06");
    }
  }

  /// Envoie une notification à chaque palier de 100 Mo consommé
  Future<void> _checkAndNotify100MbThresholds(int previousBytes, int currentBytes) async {
    // Nombre de paliers de 100 Mo franchis
    final prevThreshold = previousBytes ~/ _threshold100Mo;
    final currThreshold = currentBytes ~/ _threshold100Mo;

    if (currThreshold <= prevThreshold) return;
    if (currThreshold <= lastNotified100MbThreshold) return;

    // Notifier pour chaque palier franchi (au cas où un gros delta saute plusieurs 100 Mo)
    for (int t = prevThreshold + 1; t <= currThreshold; t++) {
      if (t <= lastNotified100MbThreshold) continue;

      final consumedMb = t * 100;
      final p = await SharedPreferences.getInstance();
      final savedName = (p.getString('userName') ?? "").trim();
      final displayName = savedName.isEmpty ? "Utilisateur" : savedName;

      String remainingInfo = "";
      if (dataQuotaBytes != null && dataQuotaBytes! > 0) {
        final left = (dataQuotaBytes! - currentBytes).clamp(0, dataQuotaBytes!);
        remainingInfo = " Il vous reste ${formatBytes(left)}.";
      }

      final title = "Orange VPN • Consommation";
      final body =
          "Cher $displayName, vous venez de consommer $consumedMb Mo de données.$remainingInfo";

      await _showSystemNotification(
        id: 300 + (t % 100), // IDs distincts pour éviter les collisions
        title: title,
        body: body,
      );

      lastNotified100MbThreshold = t;
      await p.setInt('lastNotified100MbThreshold', t);

      if (mounted) {
        addLog("📊 Alerte ${consumedMb} Mo déclenchée pour $displayName");
        showSnack(body, orangeAccent);
      }
    }
  }

  void _showWelcomeDialog({bool canDismissForever = false}) {
    bool dontShowAgain = false;
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: card,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
          contentPadding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const OrangeShield(size: 58, isGlowing: true),
              const SizedBox(height: 16),
              Text(
                "Bienvenue sur Orange VPN 🛡️",
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                  color: text,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: orangeAccent.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  "powered :@kcorp-tech",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: orangeAccent,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                "Votre tunnel VPN haute sécurité et ultra-rapide.\n\n"
                "⚡ Mode automatique instantané :\n"
                "Importez un lien orange://... (chiffré AES) ou un lien VLESS / VMess. "
                "L'application extrait et configure automatiquement le Host, le Path et le serveur.\n\n"
                "Vous pouvez aussi régénérer un lien Orange chiffré pour d'autres appareils.",
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, height: 1.45, color: text2),
              ),
              if (canDismissForever) ...[
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Checkbox(
                      value: dontShowAgain,
                      activeColor: orangeAccent,
                      onChanged: (v) {
                        setDialogState(() => dontShowAgain = v ?? false);
                      },
                    ),
                    Text(
                      "Ne plus afficher au démarrage",
                      style: TextStyle(fontSize: 11, color: text3),
                    ),
                  ],
                ),
              ],
            ],
          ),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () async {
                  if (dontShowAgain) {
                    final p = await SharedPreferences.getInstance();
                    await p.setBool('orange_welcome_seen', true);
                  }
                  Navigator.pop(ctx);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: orangeAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  "Commencer",
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Crée ou charge l'ID unique de cette installation
  Future<void> _ensureInstallationId() async {
    final p = await SharedPreferences.getInstance();
    String? id = p.getString('installationId');
    if (id == null || id.isEmpty) {
      id = _generateInstallationId();
      await p.setString('installationId', id);
      addLog("Nouvel identifiant Orange VPN généré : $id");
    }
    if (mounted) {
      setState(() => installationId = id!);
    }
  }

  void showSnack(String msg, Color color) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    final isSuccess = color == green || color == greenDark;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              isSuccess ? Icons.check_circle_rounded : Icons.info_outline_rounded,
              color: color,
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                msg,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isSuccess ? const Color(0xFFA7F3D0) : Colors.white,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: isSuccess ? const Color(0xFF064E3B) : const Color(0xFF1E1E24),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        duration: Duration(seconds: msg.length > 40 ? 4 : 2),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: color.withOpacity(0.45), width: 1),
        ),
      ),
    );
  }

  void addDataPoint(List<double> list, double value) {
    setState(() {
      list.add(value);
      if (list.length > maxGraphPoints) list.removeAt(0);
    });
  }

  Future<void> saveTrafficData() async {
    final p = await SharedPreferences.getInstance();
    await p.setInt('uploadTotal', uploadTotal);
    await p.setInt('downloadTotal', downloadTotal);
  }

  Future<void> loadTrafficData() async {
    final p = await SharedPreferences.getInstance();
    setState(() {
      uploadTotal = p.getInt('uploadTotal') ?? 0;
      downloadTotal = p.getInt('downloadTotal') ?? 0;
      lastUpSession = uploadTotal;
      lastDownSession = downloadTotal;
    });
  }

  Future<void> loadSettingsData() async {
    final p = await SharedPreferences.getInstance();
    setState(() => blockedApps = p.getStringList('blockedApps') ?? []);
  }

  String formatBytes(int bytes) {
    if (bytes < 1024) return "$bytes B";
    if (bytes < 1024 * 1024) return "${(bytes / 1024).toStringAsFixed(1)} KB";
    if (bytes < 1024 * 1024 * 1024) {
      return "${(bytes / 1024 / 1024).toStringAsFixed(2)} MB";
    }
    return "${(bytes / 1024 / 1024 / 1024).toStringAsFixed(2)} GB";
  }

  /// Clé de stockage pour le volume consommé d'un lien (usageKey)
  String _usageStorageKey(String key) => 'orange_usage_$key';

  Future<void> _saveConsumedBytes() async {
    if (usageKey == null || usageKey!.isEmpty) return;
    final p = await SharedPreferences.getInstance();
    await p.setInt(_usageStorageKey(usageKey!), consumedBytes);
  }

  Future<void> _loadConsumedBytes(String key) async {
    final p = await SharedPreferences.getInstance();
    final saved = p.getInt(_usageStorageKey(key)) ?? 0;
    // Aligner le dernier seuil notifié avec la conso déjà enregistrée
    // (évite de re-notifier les paliers déjà franchis)
    final existingThreshold = p.getInt('lastNotified100MbThreshold') ?? 0;
    final computedThreshold = saved ~/ _threshold100Mo;
    final syncedThreshold =
        existingThreshold > computedThreshold ? existingThreshold : computedThreshold;
    if (mounted) {
      setState(() {
        usageKey = key;
        consumedBytes = saved;
        lastNotified100MbThreshold = syncedThreshold;
      });
    }
  }

  /// Ratio 0.0 → 1.0 pour la barre de progression
  double get quotaProgress {
    if (dataQuotaBytes == null || dataQuotaBytes! <= 0) return 0.0;
    return (consumedBytes / dataQuotaBytes!).clamp(0.0, 1.0);
  }

  Future<void> initCore() async {
    addLog("Initialisation du noyau Xray...");
    await v2ray.initializeV2Ray();
    try {
      final v = await v2ray.getCoreVersion();
      addLog("Noyau Xray opérationnel (v$v)");
    } catch (e) {
      addLog("Core: $e");
    }
  }

  Future<void> saveLockedConfig({
    required String name,
    required String mode,
    required String host,
    required String config,
    String? expireDate,
    int? quotaBytes,
    String? usageKeyParam,
  }) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('isLocked', true);
    await p.setString('lockedName', name);
    await p.setString('lockedMode', mode);
    await p.setString('lockedHost', host);
    await p.setString('lockedConfig', config);
    if (expireDate != null && expireDate.isNotEmpty) {
      await p.setString('lockedExpireDate', expireDate);
    } else {
      await p.remove('lockedExpireDate');
    }
    if (quotaBytes != null) {
      await p.setInt('lockedQuotaBytes', quotaBytes);
    } else {
      await p.remove('lockedQuotaBytes');
    }
    if (usageKeyParam != null && usageKeyParam.isNotEmpty) {
      await p.setString('lockedUsageKey', usageKeyParam);
    } else {
      await p.remove('lockedUsageKey');
    }
  }

  Future<void> loadSavedConfig() async {
    final p = await SharedPreferences.getInstance();
    if (p.getBool('isLocked') ?? false) {
      final expStr = p.getString('lockedExpireDate');
      final savedQuota = p.getInt('lockedQuotaBytes');
      final savedUsageKey = p.getString('lockedUsageKey');
      setState(() {
        isLocked = true;
        hasConfig = true;
        lockedName = p.getString('lockedName');
        profileName = lockedName ?? "Configuration Orange";
        modeSelectionne = p.getString('lockedMode') ?? "VLESS / VMess";
        lockedHost = p.getString('lockedHost');
        lockedConfig = p.getString('lockedConfig');
        lockedExpireDate = expStr != null ? DateTime.tryParse(expStr) : null;
        hostCtrl.text = "*******";
        configCtrl.text = "******** Configuration Sécurisée ********";
        detectedHost = "Chiffré & Verrouillé";
        detectedPath = "Protégé";
        detectedServer = "Serveur Privé";
        dataQuotaBytes = savedQuota;
        usageKey = savedUsageKey;
      });
      if (savedUsageKey != null && savedUsageKey.isNotEmpty) {
        await _loadConsumedBytes(savedUsageKey);
      }
      addLog("Profil verrouillé chargé : $profileName");
      return;
    }

    final raw = p.getString('savedConfig');
    final host = p.getString('savedHost');
    final pName = p.getString('savedProfileName');
    final srv = p.getString('savedServer');
    final pth = p.getString('savedPath');

    if (raw != null && raw.isNotEmpty) {
      setState(() {
        isLocked = false;
        hasConfig = true;
        configCtrl.text = raw;
        hostCtrl.text = host ?? "";
        profileName = pName ?? "Profil VLESS";
        detectedHost = host ?? "";
        detectedPath = pth ?? "/";
        detectedServer = srv ?? "";
      });
    }
  }

  Future<void> _persistNormalConfig({
    required String raw,
    required String host,
    required String name,
    required String server,
    required String path,
  }) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('isLocked', false);
    await p.setString('savedConfig', raw);
    await p.setString('savedHost', host);
    await p.setString('savedProfileName', name);
    await p.setString('savedServer', server);
    await p.setString('savedPath', path);
  }

  void addLog(String msg) {
    String safe = msg;
    // Masquer Host
    if (lockedHost != null && lockedHost!.isNotEmpty) {
      safe = safe.replaceAll(lockedHost!, "*******");
    }
    if (hostCtrl.text.isNotEmpty && hostCtrl.text != "*******") {
      safe = safe.replaceAll(hostCtrl.text, "*******");
    }
    // Masquer Path (détecté ou connu)
    if (detectedPath.isNotEmpty &&
        detectedPath != "/" &&
        detectedPath != "Protégé" &&
        detectedPath != "Personnalisé") {
      safe = safe.replaceAll(detectedPath, "*******");
    }
    // Masquer aussi les patterns Path=... courants
    safe = safe.replaceAllMapped(
      RegExp(r'Path=[^\s,]+', caseSensitive: false),
      (_) => 'Path=*******',
    );
    final t = DateTime.now().toString().substring(11, 19);
    setState(() => logs.add("[$t] $safe"));
  }

  String get notificationName {
    switch (modeSelectionne) {
      case "UDP":
        return "Orange VPN UDP";
      case "SlowDNS":
        return "Orange VPN SlowDNS";
      case "SSH":
        return "Orange VPN SSH";
      case "Trojan":
        return "Orange VPN Trojan";
      default:
        return "Orange VPN VLESS";
    }
  }

  /// Normalise n'importe quel UUID / ID VLESS
  String _normalizeUuid(String rawId) {
    String id = rawId.trim();
    for (int i = 0; i < 3; i++) {
      try {
        final decoded = Uri.decodeComponent(id);
        if (decoded == id) break;
        id = decoded;
      } catch (_) {
        break;
      }
    }
    return id.trim();
  }

  /// Moteur V2Ray - Construit la configuration Xray
  String? buildFinalConfig(String raw, String host) {
    try {
      if (raw.trim().startsWith("{")) {
        addLog("Configuration JSON détectée");
        return raw.trim();
      }
      if (!raw.startsWith("vless://") &&
          !raw.startsWith("vmess://") &&
          !raw.startsWith("trojan://")) {
        return null;
      }

      addLog("Génération de la configuration Xray...");
      final parser = FlutterV2ray.parseFromURL(raw.trim());
      final full = parser.getFullConfiguration();
      final Map<String, dynamic> json = jsonDecode(full);

      if (json["outbounds"] != null && json["outbounds"].isNotEmpty) {
        final outbound = json["outbounds"][0];
        final settings = outbound["settings"];

        if (settings != null &&
            settings["vnext"] != null &&
            settings["vnext"].isNotEmpty) {
          final users = settings["vnext"][0]["users"];
          if (users != null && users.isNotEmpty) {
            final originalId = users[0]["id"]?.toString() ?? "";
            final normalized = _normalizeUuid(originalId);
            users[0]["id"] = normalized;
            final preview = normalized.length > 8
                ? "${normalized.substring(0, 5)}****"
                : "****";
            addLog("UUID validé : $preview");
          }
        }

        if (settings != null &&
            settings["servers"] != null &&
            settings["servers"].isNotEmpty) {
          final server = settings["servers"][0];
          if (server["password"] != null) {
            server["password"] = _normalizeUuid(server["password"].toString());
          }
        }

        final stream = outbound["streamSettings"];
        if (stream != null && stream["wsSettings"] != null) {
          final ws = stream["wsSettings"];
          if (ws["path"] != null) {
            ws["path"] = _normalizeUuid(ws["path"].toString());
          }
        }
      }

      if (host.isNotEmpty &&
          json["outbounds"] != null &&
          json["outbounds"].isNotEmpty) {
        final outbound = json["outbounds"][0];
        final stream = outbound["streamSettings"] ?? {};
        final network = stream["network"] ?? "ws";
        if (network == "ws") {
          stream["wsSettings"] ??= {};
          stream["wsSettings"]["headers"] ??= {};
          stream["wsSettings"]["headers"]["Host"] = host;
          addLog("Host injecté : *******");
        } else if (network == "http" || network == "h2") {
          stream["httpSettings"] ??= {};
          stream["httpSettings"]["host"] = [host];
          addLog("Host HTTP injecté : *******");
        }
        outbound["streamSettings"] = stream;
      }
      return jsonEncode(json);
    } catch (e) {
      addLog("Erreur core: $e");
      return null;
    }
  }

  /// Bascule la connexion VPN
  Future<void> toggle() async {
    if (estConnecte || enCours) {
      addLog("Arrêt du tunnel Orange VPN...");
      try {
        await v2ray.stopV2Ray();
      } catch (e) {
        addLog("Erreur arrêt: $e");
      }
      setState(() {
        estConnecte = false;
        enCours = false;
        statut = "DÉCONNECTÉ";
        currentUpSpeed = 0;
        currentDownSpeed = 0;
        connectedAt = null;
        connectionTime = "00:00";
        _pulseController.stop();
        _rotateController.stop();
      });
      addLog("Déconnecté - Session totale: ${formatBytes(uploadTotal + downloadTotal)}");
      return;
    }

    final raw = isLocked ? (lockedConfig ?? "") : configCtrl.text.trim();
    final host = isLocked ? (lockedHost ?? "") : hostCtrl.text.trim();

    if (lockedExpireDate != null &&
        DateTime.now().isAfter(lockedExpireDate!)) {
      addLog("Configuration expirée");
      setState(() => statut = "EXPIRÉ");
      showSnack(
        "🚨 Configuration expirée. Veuillez faire appel aux DEV : 687960259",
        red,
      );
      return;
    }

    // Vérification du quota de données
    if (isQuotaExhausted) {
      addLog("Quota de données épuisé pour ce profil");
      setState(() => statut = "QUOTA ÉPUISÉ");
      showSnack(
        "🚨 Quota de données épuisé (${formatBytes(consumedBytes)} / ${formatBytes(dataQuotaBytes!)}). "
        "Ce lien Orange ne peut plus être utilisé sur cet appareil.",
        red,
      );
      return;
    }

    if (raw.isEmpty) {
      addLog("Aucune configuration");
      showSnack("Veuillez appuyer sur « Coller la configuration »", orangeAccent);
      return;
    }

    if (modeSelectionne == "UDP" ||
        modeSelectionne == "SlowDNS" ||
        modeSelectionne == "SSH") {
      addLog("Mode $modeSelectionne en cours d'optimisation");
      showSnack("Mode $modeSelectionne bientôt disponible", orangeAccent);
      return;
    }

    final config = buildFinalConfig(raw, host);
    if (config == null) {
      setState(() {
        statut = "CONFIG INVALIDE";
        enCours = false;
        estConnecte = false;
      });
      _rotateController.stop();
      addLog("Configuration invalide");
      showSnack("Format de configuration invalide", red);
      return;
    }

    setState(() {
      enCours = true;
      statut = "CONNEXION...";
    });
    _rotateController.repeat();
    addLog("Lancement Orange VPN - Protocole: $modeSelectionne");

    try {
      final ok = await v2ray.requestPermission();
      if (!ok) {
        addLog("Permission VPN refusée par l'utilisateur");
        setState(() {
          enCours = false;
          statut = "PERMISSION REFUSÉE";
        });
        _rotateController.stop();
        return;
      }
      addLog("Activation du tunnel sécurisé...");
      await v2ray.startV2Ray(
        remark: notificationName,
        config: config,
        blockedApps: blockedApps,
      );
    } catch (e) {
      addLog("Échec: $e");
      setState(() {
        enCours = false;
        estConnecte = false;
        statut = "ÉCHEC DE CONNEXION";
      });
      _rotateController.stop();
      showSnack("Erreur lors du lancement du VPN", red);
    }
  }

  // ========== AUTO-CONFIGURATION SANS SAISIE MANUELLE ==========

  /// Appelé dès que l'utilisateur appuie sur "Coller la configuration"
  Future<void> pasteAndAutoConfigure() async {
    String textToParse = "";

    // Tentative de lecture automatique du presse-papier
    try {
      final cdata = await Clipboard.getData(Clipboard.kTextPlain);
      if (cdata != null && cdata.text != null && cdata.text!.trim().isNotEmpty) {
        textToParse = cdata.text!.trim();
      }
    } catch (_) {}

    // Si le presse-papier est vide ou ne contient pas un lien valide, ouvrir une boîte rapide
    final looksValid = textToParse.startsWith("vless://") ||
        textToParse.startsWith("vmess://") ||
        textToParse.startsWith("trojan://") ||
        textToParse.startsWith("orange://") ||
        textToParse.startsWith("xv2ray://") ||
        textToParse.startsWith("{");

    if (!looksValid) {
      final manualResult = await _showPasteDialog(initialText: textToParse);
      if (manualResult != null && manualResult.isNotEmpty) {
        textToParse = manualResult;
      } else {
        return;
      }
    }

    _applyConfigurationString(textToParse);
  }

  /// Boîte de dialogue au cas où le presse-papier doit être confirmé manuellement
  Future<String?> _showPasteDialog({String initialText = ""}) async {
    final textCtrl = TextEditingController(text: initialText);
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const OrangeShield(size: 26),
            const SizedBox(width: 10),
            Text(
              "Coller la configuration",
              style: TextStyle(
                color: text,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Collez votre lien VLESS, VMess ou profil chiffré. L'application configure automatiquement le Host, le Path et le serveur !",
              style: TextStyle(color: text2, fontSize: 12.5),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: textCtrl,
              maxLines: 4,
              style: TextStyle(color: text, fontSize: 13, fontFamily: 'monospace'),
              decoration: InputDecoration(
                hintText: "vless://... ou orange://config/...",
                hintStyle: TextStyle(color: text3),
                filled: true,
                fillColor: surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text("Annuler", style: TextStyle(color: text2)),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, textCtrl.text.trim()),
            icon: const Icon(Icons.check_rounded, size: 18),
            label: const Text("Appliquer"),
            style: ElevatedButton.styleFrom(
              backgroundColor: orangeAccent,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Analyse et applique automatiquement n'importe quel type de configuration
  Future<void> _applyConfigurationString(String rawInput) async {
    String content = rawInput.trim();

    try {
      // 1. Profil chiffré orange:// ou xv2ray://
      if (content.startsWith("orange://config/") ||
          content.startsWith("xv2ray://config/")) {
        content = content.replaceFirst("orange://config/", "");
        content = content.replaceFirst("xv2ray://config/", "");
        content = _deobfuscate(content);

        bool wasLocked = false;
        if (content.startsWith("XV2RAY_LOCKED:") ||
            content.startsWith("ORANGE_LOCKED:")) {
          wasLocked = true;
          content = utf8.decode(base64.decode(
            content
                .replaceFirst("ORANGE_LOCKED:", "")
                .replaceFirst("XV2RAY_LOCKED:", ""),
          ));
        }

        final map = jsonDecode(content);
        final appName = map["app"]?.toString() ?? "";
        if (appName != "Orange VPN" && appName != "XV2ray") {
          showSnack("Lien incompatible avec Orange VPN", red);
          return;
        }

        // Vérification de l'ID client
        final List<String> allowedIds = [];
        if (map["allowedClientIds"] is List) {
          for (final e in map["allowedClientIds"]) {
            final id = e.toString().trim().toUpperCase();
            if (id.isNotEmpty) allowedIds.add(id);
          }
        }
        final singleId =
            map["allowedClientId"]?.toString().trim().toUpperCase() ?? "";
        if (singleId.isNotEmpty && !allowedIds.contains(singleId)) {
          allowedIds.add(singleId);
        }

        if (allowedIds.isNotEmpty) {
          if (installationId.isEmpty) await _ensureInstallationId();
          final local = installationId.toUpperCase();
          if (!allowedIds.contains(local)) {
            addLog("Appareil non autorisé");
            showSnack("Ce profil est réservé à un autre appareil", red);
            return;
          }
          addLog("Autorisation appareil validée ✓");
        }

        final expireStr = map["expire_date"]?.toString();
        DateTime? parsedExpire;
        if (expireStr != null && expireStr.isNotEmpty) {
          parsedExpire = DateTime.tryParse(expireStr);
          if (parsedExpire != null && DateTime.now().isAfter(parsedExpire)) {
            showSnack(
              "🚨 Configuration expirée. Veuillez faire appel aux DEV : 687960259",
              red,
            );
            return;
          }
        }

        // ===== Quota de données =====
        int? parsedQuotaBytes;
        final quotaRaw = map["dataQuotaBytes"];
        if (quotaRaw != null) {
          if (quotaRaw is int) {
            parsedQuotaBytes = quotaRaw;
          } else if (quotaRaw is num) {
            parsedQuotaBytes = quotaRaw.toInt();
          } else {
            parsedQuotaBytes = int.tryParse(quotaRaw.toString());
          }
        }
        // Fallback: ancien format quotaMB / quotaGB
        if (parsedQuotaBytes == null) {
          final qMb = map["quotaMB"];
          if (qMb != null) {
            final mb = (qMb is num) ? qMb.toDouble() : double.tryParse(qMb.toString()) ?? 0;
            parsedQuotaBytes = (mb * 1024 * 1024).round();
          }
          final qGb = map["quotaGB"];
          if (qGb != null) {
            final gb = (qGb is num) ? qGb.toDouble() : double.tryParse(qGb.toString()) ?? 0;
            parsedQuotaBytes = (gb * 1024 * 1024 * 1024).round();
          }
        }

        // Clé unique pour suivre la consommation (persistée localement)
        String? linkUsageKey = map["usageKey"]?.toString();
        if (linkUsageKey == null || linkUsageKey.isEmpty) {
          // Fallback stable basé sur le nom + host + allowed ids
          final seed = "${map["name"]}_${map["host"]}_${map["allowedClientId"] ?? ""}";
          linkUsageKey = "uk_${seed.hashCode.abs().toRadixString(16)}";
        }

        // Charger la consommation déjà enregistrée pour ce usageKey
        await _loadConsumedBytes(linkUsageKey);

        // Si le quota est déjà épuisé, on refuse le chargement
        if (parsedQuotaBytes != null &&
            parsedQuotaBytes > 0 &&
            consumedBytes >= parsedQuotaBytes) {
          addLog("Quota déjà épuisé pour ce lien ($linkUsageKey)");
          showSnack(
            "🚨 Ce lien Orange a déjà épuisé son quota de données "
            "(${formatBytes(consumedBytes)} / ${formatBytes(parsedQuotaBytes)}).\n"
            "Il ne peut plus être utilisé sur cet appareil.",
            red,
          );
          // On charge quand même l'état pour afficher la barre rouge
          setState(() {
            dataQuotaBytes = parsedQuotaBytes;
            usageKey = linkUsageKey;
          });
          return;
        }

        final name = map["name"] ?? "Configuration Orange";
        final mode = map["mode"] ?? "VLESS / VMess";
        final host = map["host"] ?? "";
        final config = map["config"] ?? "";
        final locked = map["locked"] == true || wasLocked;

        if (locked) {
          await saveLockedConfig(
            name: name,
            mode: mode,
            host: host,
            config: config,
            expireDate: expireStr,
            quotaBytes: parsedQuotaBytes,
            usageKeyParam: linkUsageKey,
          );
          setState(() {
            isLocked = true;
            hasConfig = true;
            lockedName = name;
            profileName = name;
            lockedHost = host;
            lockedConfig = config;
            lockedExpireDate = parsedExpire;
            modeSelectionne = mode;
            hostCtrl.text = "*******";
            configCtrl.text = "******** Configuration Sécurisée ********";
            detectedHost = "Chiffré & Verrouillé";
            detectedPath = "Protégé";
            detectedServer = "Serveur Privé";
            dataQuotaBytes = parsedQuotaBytes;
            usageKey = linkUsageKey;
          });
        } else {
          await _persistNormalConfig(
            raw: config,
            host: host,
            name: name,
            server: "Serveur Configuré",
            path: "/",
          );
          setState(() {
            isLocked = false;
            hasConfig = true;
            profileName = name;
            lockedExpireDate = parsedExpire;
            modeSelectionne = mode;
            hostCtrl.text = host;
            configCtrl.text = config;
            detectedHost = host;
            detectedPath = "/";
            detectedServer = "Serveur Configuré";
            dataQuotaBytes = parsedQuotaBytes;
            usageKey = linkUsageKey;
          });
        }
        final quotaInfo = parsedQuotaBytes != null
            ? " • Quota: ${formatBytes(parsedQuotaBytes)}"
            : "";
        showSnack("Profil Orange chargé : $name$quotaInfo", green);

        // Programmer les rappels d'expiration quotidiens si une date est définie
        if (parsedExpire != null) {
          await _scheduleDailyExpirationNotification();
        }
        return;
      }

      // 2. Lien VLESS (Extraction automatique de Host, Path, Server, Port, Remark)
      if (content.startsWith("vless://")) {
        final uri = Uri.parse(content);
        final q = uri.queryParameters;

        final extractedHost =
            q['host'] ?? q['sni'] ?? uri.host;
        final extractedPath =
            q['path'] != null ? Uri.decodeComponent(q['path']!) : '/';
        final serverAddr = "${uri.host}:${uri.port}";
        final remark = uri.fragment.isNotEmpty
            ? Uri.decodeComponent(uri.fragment)
            : "Orange VLESS Profil";

        await _persistNormalConfig(
          raw: content,
          host: extractedHost,
          name: remark,
          server: serverAddr,
          path: extractedPath,
        );

        setState(() {
          isLocked = false;
          hasConfig = true;
          modeSelectionne = "VLESS / VMess";
          configCtrl.text = content;
          hostCtrl.text = extractedHost;
          profileName = remark;
          detectedHost = extractedHost;
          detectedPath = extractedPath;
          detectedServer = serverAddr;
        });

        addLog("VLESS configuré : Host=*******, Path=*******");
        showSnack("✅ Configuration VLESS appliquée avec succès !", green);
        return;
      }

      // 3. Lien VMess (Base64 JSON décodé automatiquement)
      if (content.startsWith("vmess://")) {
        String b64 = content.replaceFirst("vmess://", "").trim();
        while (b64.length % 4 != 0) {
          b64 += "=";
        }
        final decodedJson = utf8.decode(base64Decode(b64));
        final map = jsonDecode(decodedJson);

        final server = map['add']?.toString() ?? "";
        final port = map['port']?.toString() ?? "443";
        final extractedHost =
            map['host']?.toString() ?? map['sni']?.toString() ?? server;
        final extractedPath = map['path']?.toString() ?? "/";
        final remark = map['ps']?.toString() ?? "Orange VMess Profil";
        final serverAddr = "$server:$port";

        await _persistNormalConfig(
          raw: content,
          host: extractedHost,
          name: remark,
          server: serverAddr,
          path: extractedPath,
        );

        setState(() {
          isLocked = false;
          hasConfig = true;
          modeSelectionne = "VLESS / VMess";
          configCtrl.text = content;
          hostCtrl.text = extractedHost;
          profileName = remark;
          detectedHost = extractedHost;
          detectedPath = extractedPath;
          detectedServer = serverAddr;
        });

        addLog("VMess configuré : Host=*******, Path=*******");
        showSnack("✅ Configuration VMess appliquée avec succès !", green);
        return;
      }

      // 4. Lien Trojan
      if (content.startsWith("trojan://")) {
        final uri = Uri.parse(content);
        final q = uri.queryParameters;
        final extractedHost = q['sni'] ?? q['host'] ?? uri.host;
        final extractedPath =
            q['path'] != null ? Uri.decodeComponent(q['path']!) : '/';
        final serverAddr = "${uri.host}:${uri.port}";
        final remark = uri.fragment.isNotEmpty
            ? Uri.decodeComponent(uri.fragment)
            : "Orange Trojan Profil";

        await _persistNormalConfig(
          raw: content,
          host: extractedHost,
          name: remark,
          server: serverAddr,
          path: extractedPath,
        );

        setState(() {
          isLocked = false;
          hasConfig = true;
          modeSelectionne = "Trojan";
          configCtrl.text = content;
          hostCtrl.text = extractedHost;
          profileName = remark;
          detectedHost = extractedHost;
          detectedPath = extractedPath;
          detectedServer = serverAddr;
        });

        addLog("Trojan configuré : Host=$extractedHost");
        showSnack("✅ Configuration Trojan appliquée !", green);
        return;
      }

      // 5. JSON Brut
      if (content.startsWith("{")) {
        await _persistNormalConfig(
          raw: content,
          host: "",
          name: "Profil JSON personnalisé",
          server: "Xray JSON",
          path: "Direct",
        );
        setState(() {
          isLocked = false;
          hasConfig = true;
          configCtrl.text = content;
          hostCtrl.text = "";
          profileName = "Profil JSON personnalisé";
          detectedHost = "Personnalisé";
          detectedPath = "Personnalisé";
          detectedServer = "Xray Core";
        });
        showSnack("✅ Profil JSON appliqué !", green);
        return;
      }

      showSnack("Format non reconnu. Utilisez un lien vless:// ou orange://", red);
    } catch (e) {
      addLog("Erreur traitement configuration: $e");
      showSnack("Lien invalide ou corrompu", red);
    }
  }

  /// Efface la configuration active
  Future<void> cleanConfig() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(
          "Effacer la configuration",
          style: TextStyle(color: text, fontWeight: FontWeight.w700),
        ),
        content: Text(
          'Supprimer la configuration active « ${profileName.isNotEmpty ? profileName : "actuelle"} » ?',
          style: TextStyle(color: text2),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text("Annuler", style: TextStyle(color: text2)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: red,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text("Effacer"),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    if (estConnecte || enCours) await v2ray.stopV2Ray();

    final p = await SharedPreferences.getInstance();
    await p.remove('isLocked');
    await p.remove('lockedName');
    await p.remove('lockedMode');
    await p.remove('lockedHost');
    await p.remove('lockedConfig');
    await p.remove('lockedExpireDate');
    await p.remove('lockedQuotaBytes');
    await p.remove('lockedUsageKey');
    await p.remove('savedConfig');
    await p.remove('savedHost');
    await p.remove('savedProfileName');
    await p.remove('savedServer');
    await p.remove('savedPath');
    // IMPORTANT : on ne supprime PAS les clés orange_usage_* 
    // → le volume consommé reste enregistré même après effacement du profil.

    setState(() {
      isLocked = false;
      hasConfig = false;
      lockedHost = null;
      lockedConfig = null;
      lockedName = null;
      lockedExpireDate = null;
      profileName = "";
      detectedHost = "";
      detectedPath = "";
      detectedServer = "";
      hostCtrl.clear();
      configCtrl.clear();
      modeSelectionne = "VLESS / VMess";
      statut = "DÉCONNECTÉ";
      estConnecte = false;
      enCours = false;
      // Note: on ne touche PAS à consumedBytes / usageKey stockés → le quota reste épuisé
      // même après effacement, pour empêcher la réutilisation du même lien.
      dataQuotaBytes = null;
      // usageKey et consumedBytes restent en mémoire jusqu'à nouvel import
    });

    // Annuler les rappels d'expiration (plus de date de forfait)
    for (int i = 0; i < _expirationReminderTimes.length; i++) {
      try {
        await flutterLocalNotificationsPlugin.cancel(60 + i);
      } catch (_) {}
    }

    addLog("Configuration effacée");
    showSnack("Configuration effacée avec succès", orangeAccent);
  }

  /// Réinitialisation complète de l'application (config + quotas + stats)
  Future<void> _resetEntireApp() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(
          "Réinitialiser l'application ?",
          style: TextStyle(color: text, fontWeight: FontWeight.w700),
        ),
        content: Text(
          "Cette action va tout supprimer :\n\n"
          "• Configuration VPN actuelle\n"
          "• Quotas consommés (les anciens liens redeviendront utilisables)\n"
          "• Statistiques de trafic\n"
          "• Préférences (thème, applications bloquées…)\n\n"
          "L'identifiant appareil (OR-XXXX-XXXX) sera conservé.",
          style: TextStyle(color: text2, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text("Annuler", style: TextStyle(color: text2)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: red,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text("Tout réinitialiser"),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    // Arrêter le VPN s'il tourne
    if (estConnecte || enCours) {
      try {
        await v2ray.stopV2Ray();
      } catch (_) {}
    }

    final p = await SharedPreferences.getInstance();
    final keepId = p.getString('installationId');
    await p.clear(); // Efface TOUT, y compris les orange_usage_*
    if (keepId != null) {
      await p.setString('installationId', keepId);
    }

    setState(() {
      isLocked = false;
      hasConfig = false;
      lockedHost = null;
      lockedConfig = null;
      lockedName = null;
      lockedExpireDate = null;
      profileName = "";
      detectedHost = "";
      detectedPath = "";
      detectedServer = "";
      hostCtrl.clear();
      configCtrl.clear();
      modeSelectionne = "VLESS / VMess";
      statut = "DÉCONNECTÉ";
      estConnecte = false;
      enCours = false;
      dataQuotaBytes = null;
      usageKey = null;
      consumedBytes = 0;
      lastNotified100MbThreshold = 0;
      hasShown200MoAlert = false;
      uploadTotal = 0;
      downloadTotal = 0;
      lastUpSession = 0;
      lastDownSession = 0;
      currentUpSpeed = 0;
      currentDownSpeed = 0;
      uploadPoints.clear();
      downloadPoints.clear();
      connectionTime = "00:00";
      connectedAt = null;
      logs.clear();
      blockedApps = [];
    });

    // Annuler les rappels d'expiration programmés
    for (int i = 0; i < _expirationReminderTimes.length; i++) {
      try {
        await flutterLocalNotificationsPlugin.cancel(60 + i);
      } catch (_) {}
    }

    addLog("Application entièrement réinitialisée");
    showSnack("Application réinitialisée avec succès", green);
  }

  void exportConfig() {
    if (isLocked) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ExportPage(
          mode: modeSelectionne,
          host: hostCtrl.text,
          config: configCtrl.text,
          isLight: isLight,
        ),
      ),
    );
  }

  void _copyInstallationId() {
    if (installationId.isEmpty) return;
    Clipboard.setData(ClipboardData(text: installationId));
    showSnack("ID copié : $installationId", green);
  }

  // ========== BUILD DE L'INTERFACE PRINCIPALE ==========

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bg,
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const ClampingScrollPhysics(),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Top App Bar épurée
                _buildHeader(),
                const SizedBox(height: 16),

                // Barre Mode & Débits en direct
                _buildModeAndSpeedBar(),
                const SizedBox(height: 24),

                // Bouton central de Connexion (Bouclier Orange & Halo)
                _buildPowerButtonSection(),
                const SizedBox(height: 20),

                // Barre de consommation (quota) + volume total + graphique
                _buildQuotaAndTrafficSection(),
                const SizedBox(height: 20),

                // Zone Auto-Configuration intelligente (Aucune saisie manuelle !)
                _buildAutoConfigSection(),
                const SizedBox(height: 24),

                // Signature officielle & Branding
                _buildFooter(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Header épuré : Bouclier Orange + Titre Orange VPN + Statut discret + Menu
  Widget _buildHeader() {
    return Row(
      children: [
        const OrangeShield(size: 38, isGlowing: true),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Orange VPN",
              style: TextStyle(
                fontWeight: FontWeight.w900,
                color: text,
                fontSize: 22,
                letterSpacing: 0.5,
              ),
            ),
            Row(
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: statusColor,
                    boxShadow: [
                      BoxShadow(
                        color: statusColor.withOpacity(0.6),
                        blurRadius: 4,
                      )
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  estConnecte
                      ? "PROTÉGÉ"
                      : enCours
                          ? "CONNEXION..."
                          : "DÉCONNECTÉ",
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: statusColor,
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            ),
          ],
        ),
        const Spacer(),
        IconButton(
          icon: Icon(Icons.info_outline_rounded, color: text2, size: 21),
          tooltip: "Message de bienvenue",
          onPressed: () => _showWelcomeDialog(canDismissForever: false),
        ),
        IconButton(
          icon: Icon(Icons.terminal_rounded, color: text2, size: 21),
          tooltip: "Logs",
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => LogsScreen(
                  logs: logs,
                  onClear: () => setState(() => logs.clear()),
                  isLight: isLight,
                ),
              ),
            );
          },
        ),
        IconButton(
          icon: Icon(Icons.settings_rounded, color: text2, size: 21),
          tooltip: "Paramètres",
          onPressed: () async {
            await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => SettingsPage(
                  v2ray: v2ray,
                  themeMode: widget.themeMode,
                  onThemeChanged: widget.onThemeChanged,
                  installationId: installationId,
                  onCopyId: _copyInstallationId,
                ),
              ),
            );
            loadSettingsData();
          },
        ),
        PopupMenuButton<String>(
          icon: Icon(Icons.more_vert_rounded, color: text2),
          color: card,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          onSelected: (v) {
            if (v == 'paste') pasteAndAutoConfigure();
            if (v == 'export') exportConfig();
            if (v == 'clean') cleanConfig();
            if (v == 'reset_app') _resetEntireApp();
          },
          itemBuilder: (_) => [
            PopupMenuItem(
              value: 'paste',
              child: Row(
                children: [
                  Icon(Icons.lock_open_rounded, size: 18, color: orangeAccent),
                  const SizedBox(width: 12),
                  Text("Importer lien chiffré Orange",
                      style: TextStyle(color: text, fontSize: 13.5)),
                ],
              ),
            ),
            PopupMenuItem(
              value: 'export',
              enabled: !isLocked && hasConfig,
              child: Row(
                children: [
                  Icon(Icons.key_rounded,
                      size: 18,
                      color: !isLocked && hasConfig ? orangeAccent : Colors.grey),
                  const SizedBox(width: 12),
                  Text("Générer / Régénérer lien Orange",
                      style: TextStyle(
                          color: !isLocked && hasConfig ? text : Colors.grey,
                          fontSize: 13.5)),
                ],
              ),
            ),
            PopupMenuItem(
              value: 'clean',
              enabled: hasConfig,
              child: Row(
                children: [
                  Icon(Icons.delete_outline_rounded,
                      size: 18, color: hasConfig ? red : Colors.grey),
                  const SizedBox(width: 12),
                  Text("Effacer la configuration",
                      style: TextStyle(
                          color: hasConfig ? text : Colors.grey, fontSize: 13.5)),
                ],
              ),
            ),
            const PopupMenuDivider(),
            PopupMenuItem(
              value: 'reset_app',
              child: Row(
                children: [
                  Icon(Icons.restart_alt_rounded, size: 18, color: red),
                  const SizedBox(width: 12),
                  Text("Réinitialiser l'application",
                      style: TextStyle(color: red, fontSize: 13.5, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// Barre compacte contenant le sélecteur de mode et les débits
  Widget _buildModeAndSpeedBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Menu de sélection du protocole (compact)
          DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: modeSelectionne,
              dropdownColor: card,
              icon: Icon(Icons.keyboard_arrow_down_rounded,
                  color: orangeAccent, size: 18),
              style: TextStyle(
                color: text,
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
              items: modes
                  .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                  .toList(),
              onChanged: isLocked
                  ? null
                  : (v) {
                      if (v != null) {
                        setState(() => modeSelectionne = v);
                        addLog("Protocole sélectionné : $v");
                      }
                    },
            ),
          ),
          // Chips Débits compacts
          Row(
            children: [
              _speedTag(Icons.arrow_upward_rounded, currentUpSpeed, Colors.amber),
              const SizedBox(width: 8),
              _speedTag(Icons.arrow_downward_rounded, currentDownSpeed, green),
            ],
          ),
        ],
      ),
    );
  }

  Widget _speedTag(IconData icon, double speed, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            "${speed.toStringAsFixed(1)} KB/s",
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  /// Section Quota + Volume total + Graphique de connexion
  Widget _buildQuotaAndTrafficSection() {
    final totalSession = uploadTotal + downloadTotal;
    final hasQuota = dataQuotaBytes != null && dataQuotaBytes! > 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Volume total consommé (toujours visible)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                "VOLUME CONSOMMÉ",
                style: TextStyle(
                  color: orangeAccent,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.7,
                ),
              ),
              Text(
                formatBytes(hasQuota ? consumedBytes : totalSession),
                style: TextStyle(
                  color: text,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Barre de quota (si définie)
          if (hasQuota) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  isQuotaExhausted ? "QUOTA ÉPUISÉ" : "Quota restant",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: isQuotaExhausted ? red : text2,
                  ),
                ),
                Text(
                  "${formatBytes(consumedBytes)} / ${formatBytes(dataQuotaBytes!)}",
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: isQuotaExhausted ? red : text,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: quotaProgress,
                minHeight: 10,
                backgroundColor: surface,
                valueColor: AlwaysStoppedAnimation<Color>(
                  isQuotaExhausted
                      ? red
                      : (quotaProgress > 0.85 ? const Color(0xFFF59E0B) : green),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              isQuotaExhausted
                  ? "Ce lien ne peut plus être utilisé (quota atteint)."
                  : "La barre ne se réinitialise pas après déconnexion.",
              style: TextStyle(fontSize: 10.5, color: text3),
            ),
            const SizedBox(height: 14),
          ],

          // Mini graphique de trafic (points récents)
          if (uploadPoints.isNotEmpty || downloadPoints.isNotEmpty) ...[
            Text(
              "GRAPHIQUE DE CONNEXION",
              style: TextStyle(
                color: orangeAccent,
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.7,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 70,
              width: double.infinity,
              child: CustomPaint(
                painter: _TrafficGraphPainter(
                  uploadPoints: List.from(uploadPoints),
                  downloadPoints: List.from(downloadPoints),
                  upColor: Colors.amber,
                  downColor: green,
                  isLight: isLight,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(width: 10, height: 3, color: Colors.amber),
                const SizedBox(width: 4),
                Text("Upload", style: TextStyle(fontSize: 9.5, color: text3)),
                const SizedBox(width: 14),
                Container(width: 10, height: 3, color: green),
                const SizedBox(width: 4),
                Text("Download", style: TextStyle(fontSize: 9.5, color: text3)),
              ],
            ),
          ] else ...[
            Center(
              child: Text(
                "Le graphique apparaîtra après la première connexion",
                style: TextStyle(fontSize: 11, color: text3),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Centre de connexion : Grand bouton Bouclier avec pulsations et halo orange
  Widget _buildPowerButtonSection() {
    final activeColor = estConnecte
        ? green
        : (enCours ? orangeAccent : orangeAccent);

    return Column(
      children: [
        AnimatedBuilder(
          animation: _pulseAnimation,
          builder: (_, __) {
            return Transform.scale(
              scale: estConnecte ? _pulseAnimation.value : 1.0,
              child: GestureDetector(
                onTap: toggle,
                child: AnimatedBuilder(
                  animation: _rotateController,
                  builder: (_, __) {
                    return Container(
                      width: 140,
                      height: 140,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: estConnecte
                            ? green.withOpacity(0.12)
                            : (enCours
                                ? orangeAccent.withOpacity(0.15)
                                : orangeAccent.withOpacity(0.08)),
                        border: Border.all(
                          color: estConnecte
                              ? green
                              : (enCours
                                  ? orangeAccent
                                  : orangeAccent.withOpacity(0.6)),
                          width: 2.2,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: activeColor.withOpacity(estConnecte ? 0.35 : 0.22),
                            blurRadius: 30,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Center(
                        child: Container(
                          width: 112,
                          height: 112,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: estConnecte
                                  ? [const Color(0xFF10B981), const Color(0xFF059669)]
                                  : (enCours
                                      ? [const Color(0xFFFFA040), const Color(0xFFFF7900)]
                                      : [const Color(0xFFFF7900), const Color(0xFFE65100)]),
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: (estConnecte ? green : orangeAccent)
                                    .withOpacity(0.4),
                                blurRadius: 18,
                              ),
                            ],
                          ),
                          child: Center(
                            child: enCours
                                ? Transform.rotate(
                                    angle: _rotateController.value * 2 * pi,
                                    child: const Icon(
                                      Icons.sync_rounded,
                                      size: 46,
                                      color: Colors.white,
                                    ),
                                  )
                                : Icon(
                                    estConnecte
                                        ? Icons.verified_user_rounded
                                        : Icons.power_settings_new_rounded,
                                    size: 46,
                                    color: Colors.white,
                                  ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 14),
        Text(
          estConnecte
              ? "Connecté en toute sécurité • Appuyez pour déconnecter"
              : enCours
                  ? "Chiffrement du tunnel en cours..."
                  : "Appuyez pour vous connecter",
          textAlign: TextAlign.center,
          style: TextStyle(
            color: estConnecte ? green : (enCours ? orangeAccent : text2),
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  /// Section de configuration automatique (Pas de saisie manuelle : Coller et tout se remplit)
  Widget _buildAutoConfigSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
        boxShadow: isLight
            ? [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                )
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                "CONFIGURATION AUTOMATIQUE",
                style: TextStyle(
                  color: orangeAccent,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                ),
              ),
              if (hasConfig)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: isLocked
                        ? Colors.red.withOpacity(0.12)
                        : green.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    isLocked ? "SÉCURISÉ AES" : "CONFIGURÉ",
                    style: TextStyle(
                      color: isLocked ? Colors.redAccent : green,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),

          // Si aucune configuration : Boutons clairs Import + Coller
          if (!hasConfig) ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: pasteAndAutoConfigure,
                icon: const Icon(Icons.lock_open_rounded, size: 20),
                label: const Text(
                  "Importer lien Orange (chiffré AES)",
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: orangeAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  elevation: 2,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: pasteAndAutoConfigure,
                icon: Icon(Icons.content_paste_rounded, size: 18, color: orangeAccent),
                label: Text(
                  "Coller lien VLESS / VMess",
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: orangeAccent,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: orangeAccent.withOpacity(0.7)),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Center(
              child: Text(
                "Copiez un lien orange://... (AES) ou vless:// / vmess://\npuis appuyez sur le bouton correspondant.\nL'application configure automatiquement Host & Path.",
                textAlign: TextAlign.center,
                style: TextStyle(color: text3, fontSize: 11, height: 1.35),
              ),
            ),
          ] else ...[
            // Si une configuration est chargée : Affichage synthétique des champs extraits
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  _infoRow("Profil", profileName.isNotEmpty ? profileName : "Orange VLESS"),
                  const Divider(height: 12, thickness: 0.5),
                  _infoRow("Host / SNI", detectedHost.isNotEmpty ? detectedHost : "(Auto-configuré)"),
                  const Divider(height: 12, thickness: 0.5),
                  _infoRow("Path", detectedPath.isNotEmpty ? detectedPath : "/"),
                  if (detectedServer.isNotEmpty) ...[
                    const Divider(height: 12, thickness: 0.5),
                    _infoRow("Serveur", detectedServer),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            // Bouton principal : Générer / Régénérer le lien Orange chiffré
            if (!isLocked) ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: exportConfig,
                  icon: const Icon(Icons.key_rounded, size: 20),
                  label: const Text(
                    "Générer / Régénérer le lien Orange (AES)",
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: orangeAccent,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    elevation: 2,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: pasteAndAutoConfigure,
                    icon: Icon(Icons.paste_rounded, size: 16, color: orangeAccent),
                    label: Text(
                      "Remplacer",
                      style: TextStyle(
                        color: orangeAccent,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: orangeAccent.withOpacity(0.6)),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: cleanConfig,
                    icon: const Icon(Icons.delete_outline_rounded,
                        size: 16, color: Color(0xFFEF4444)),
                    label: const Text(
                      "Effacer",
                      style: TextStyle(
                        color: Color(0xFFEF4444),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: red.withOpacity(0.5)),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 11.5, color: text3, fontWeight: FontWeight.w600),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              color: text,
              fontWeight: FontWeight.w700,
              fontFamily: 'monospace',
            ),
          ),
        ),
      ],
    );
  }

  /// Footer : Signature demandée `powered :@kcorp-tech`
  Widget _buildFooter() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const OrangeShield(size: 14),
            const SizedBox(width: 6),
            Text(
              "powered :@kcorp-tech",
              style: TextStyle(
                color: orangeAccent,
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          "Orange VPN  •  Xray Core v1.2.0",
          style: TextStyle(
            color: text3,
            fontSize: 10,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

// ========== PARAMÈTRES (SETTINGS) ==========
class SettingsPage extends StatefulWidget {
  final FlutterV2ray v2ray;
  final int themeMode;
  final Function(int) onThemeChanged;
  final String installationId;
  final VoidCallback onCopyId;

  const SettingsPage({
    super.key,
    required this.v2ray,
    required this.themeMode,
    required this.onThemeChanged,
    required this.installationId,
    required this.onCopyId,
  });

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final apps = [];
  List<String> blockedApps = [];
  bool loadingApps = true;
  late int localThemeMode;

  bool get isLight => localThemeMode == 1;

  Color get bg => isLight ? const Color(0xFFF7F8FA) : const Color(0xFF0C0C0E);
  Color get card => isLight ? Colors.white : const Color(0xFF16161D);
  Color get text => isLight ? const Color(0xFF111111) : Colors.white;
  Color get text2 => isLight ? const Color(0xFF555562) : const Color(0xFFA1A1AA);
  Color get border =>
      isLight ? const Color(0xFFE2E4E9) : const Color(0xFF282836);
  Color get orangeAccent => const Color(0xFFFF7900);

  @override
  void initState() {
    super.initState();
    localThemeMode = widget.themeMode;
    _init();
  }

  Future<void> _init() async {
    final p = await SharedPreferences.getInstance();
    blockedApps = p.getStringList('blockedApps') ?? [];
    setState(() => loadingApps = false);
  }

  Future<void> _setTheme(int mode) async {
    final p = await SharedPreferences.getInstance();
    await p.setInt('themeMode', mode);
    setState(() => localThemeMode = mode);
    widget.onThemeChanged(mode);
  }

  Future<void> _toggleApp(String pkg, bool val) async {
    final p = await SharedPreferences.getInstance();
    setState(() {
      if (val) {
        blockedApps.add(pkg);
      } else {
        blockedApps.remove(pkg);
      }
    });
    await p.setStringList('blockedApps', blockedApps);
  }

  Future<void> _clearAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text("Réinitialiser l'application ?",
            style: TextStyle(color: text, fontWeight: FontWeight.w700)),
        content: Text(
          "Cette action va supprimer :\n"
          "• La configuration VPN actuelle\n"
          "• Les statistiques de trafic\n"
          "• Les quotas consommés (usage)\n"
          "• Les préférences (thème, apps bloquées…)\n\n"
          "L'identifiant appareil (OR-XXXX-XXXX) sera conservé.",
          style: TextStyle(color: text2, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text("Annuler", style: TextStyle(color: text2)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text("Tout réinitialiser"),
          ),
        ],
      ),
    );
    if (ok == true) {
      // Arrêter le VPN s'il est actif
      try {
        await widget.v2ray.stopV2Ray();
      } catch (_) {}

      final p = await SharedPreferences.getInstance();
      final keepId = p.getString('installationId');
      await p.clear(); // Efface aussi les clés orange_usage_*
      if (keepId != null) {
        await p.setString('installationId', keepId);
      }
      if (mounted) {
        Navigator.pop(context); // Retour à l'écran d'accueil
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        title: Text(
          "Paramètres",
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: text,
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: text),
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          // Identifiant Appareil
          _sectionTitle("Identifiant Appareil Orange"),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: border),
            ),
            child: ListTile(
              leading: const OrangeShield(size: 28),
              title: Text(
                widget.installationId.isEmpty
                    ? "Chargement..."
                    : widget.installationId,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  fontFamily: 'monospace',
                  color: orangeAccent,
                  letterSpacing: 0.5,
                ),
              ),
              subtitle: Text(
                "ID unique de cet appareil pour liens protégés",
                style: TextStyle(fontSize: 11, color: text2),
              ),
              trailing: IconButton(
                icon: Icon(Icons.copy_rounded, color: orangeAccent, size: 20),
                onPressed: widget.onCopyId,
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Apparence & Thèmes
          _sectionTitle("Apparence"),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: border),
            ),
            child: Column(
              children: [
                _themeTile(
                  0,
                  Icons.dark_mode_rounded,
                  "Thème Noir & Orange",
                  "Fond sombre obsidian avec accents orange vif",
                ),
                Divider(height: 1, color: border),
                _themeTile(
                  1,
                  Icons.wb_sunny_rounded,
                  "Thème Blanc & Orange",
                  "Fond clair épuré et lumineux",
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Split Tunneling
          _sectionTitle("Split Tunneling (Exclure des applications)"),
          const SizedBox(height: 8),
          Container(
            height: 240,
            decoration: BoxDecoration(
              color: card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: border),
            ),
            child: loadingApps
                ? Center(child: CircularProgressIndicator(color: orangeAccent))
                : apps.isEmpty
                    ? Center(
                        child: Text(
                          "Toutes les applications passent par Orange VPN",
                          style: TextStyle(color: text2, fontSize: 12),
                        ),
                      )
                    : ListView.builder(
                        itemCount: apps.length,
                        itemBuilder: (_, i) {
                          final app = apps[i];
                          final blocked = blockedApps.contains(app.packageName);
                          return CheckboxListTile(
                            title: Text(
                              app.name ?? "Application",
                              style: TextStyle(fontSize: 13, color: text),
                            ),
                            subtitle: Text(
                              app.packageName ?? "",
                              style: TextStyle(fontSize: 10, color: text2),
                            ),
                            value: blocked,
                            activeColor: orangeAccent,
                            onChanged: (v) =>
                                _toggleApp(app.packageName ?? "", v ?? false),
                          );
                        },
                      ),
          ),
          const SizedBox(height: 24),

          // Maintenance
          _sectionTitle("Maintenance", color: const Color(0xFFEF4444)),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _clearAll,
              icon: const Icon(Icons.restart_alt_rounded, size: 22),
              label: const Text(
                "Réinitialiser l'application",
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444).withOpacity(0.12),
                foregroundColor: const Color(0xFFEF4444),
                side: const BorderSide(color: Color(0xFFEF4444), width: 1.2),
                padding: const EdgeInsets.symmetric(vertical: 15),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            "Supprime la configuration, les quotas consommés, le trafic et les préférences. L'ID appareil est conservé.",
            style: TextStyle(fontSize: 11, color: text2, height: 1.3),
          ),
          const SizedBox(height: 32),

          // Branding & Signature
          Center(
            child: Column(
              children: [
                const OrangeShield(size: 24),
                const SizedBox(height: 6),
                Text(
                  "Orange VPN Pro v1.2.0",
                  style: TextStyle(color: text, fontWeight: FontWeight.w700, fontSize: 13),
                ),
                const SizedBox(height: 4),
                Text(
                  "powered :@kcorp-tech",
                  style: TextStyle(
                    color: orangeAccent,
                    fontWeight: FontWeight.w800,
                    fontSize: 11.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String t, {Color? color}) {
    return Text(
      t,
      style: TextStyle(
        color: color ?? orangeAccent,
        fontWeight: FontWeight.w800,
        fontSize: 12,
        letterSpacing: 0.5,
      ),
    );
  }

  Widget _themeTile(int value, IconData icon, String title, String sub) {
    final selected = localThemeMode == value;
    return RadioListTile<int>(
      title: Text(title,
          style: TextStyle(fontSize: 14, color: text, fontWeight: FontWeight.w600)),
      subtitle: Text(sub, style: TextStyle(fontSize: 11, color: text2)),
      value: value,
      groupValue: localThemeMode,
      activeColor: orangeAccent,
      onChanged: (v) {
        if (v != null) _setTheme(v);
      },
      secondary: Icon(icon, color: selected ? orangeAccent : text2),
    );
  }
}

// ========== LOGS SCREEN ==========
class LogsScreen extends StatelessWidget {
  final List<String> logs;
  final VoidCallback onClear;
  final bool isLight;

  const LogsScreen({
    super.key,
    required this.logs,
    required this.onClear,
    this.isLight = false,
  });

  Color get bg => isLight ? const Color(0xFFF7F8FA) : const Color(0xFF0C0C0E);
  Color get text => isLight ? const Color(0xFF111111) : Colors.white;

  Color _color(String log) {
    if (log.contains("succès") ||
        log.contains("établi") ||
        log.contains("appliquée") ||
        log.contains("validé") ||
        log.contains("chargé")) {
      return const Color(0xFF10B981);
    }
    if (log.contains("Erreur") ||
        log.contains("Échec") ||
        log.contains("invalide") ||
        log.contains("refusée")) {
      return const Color(0xFFEF4444);
    }
    if (log.contains("CONNEXION") ||
        log.contains("Orange") ||
        log.contains("VLESS")) {
      return const Color(0xFFFF7900);
    }
    return isLight ? const Color(0xFF555562) : Colors.white54;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        title: Text(
          "Logs Orange VPN",
          style: TextStyle(
            color: text,
            fontSize: 17,
            fontWeight: FontWeight.w800,
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: text),
        actions: [
          if (logs.isNotEmpty)
            TextButton(
              onPressed: () {
                onClear();
                Navigator.pop(context);
              },
              child: const Text(
                "EFFACER",
                style: TextStyle(
                  color: Color(0xFFEF4444),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
      body: logs.isEmpty
          ? Center(
              child: Text(
                "Aucun événement enregistré",
                style: TextStyle(
                  color: isLight ? const Color(0xFF888896) : Colors.white24,
                  fontSize: 13,
                ),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: logs.length,
              separatorBuilder: (_, __) => Divider(
                height: 1,
                color: isLight
                    ? const Color(0xFFE2E4E9)
                    : Colors.white.withOpacity(0.04),
              ),
              itemBuilder: (_, i) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  logs[i],
                  style: TextStyle(
                    fontSize: 11.5,
                    fontFamily: 'monospace',
                    color: _color(logs[i]),
                  ),
                ),
              ),
            ),
    );
  }
}

// ========== GÉNÉRATEUR DE CLÉ ORANGE (EXPORT) ==========
class ExportPage extends StatefulWidget {
  final String mode;
  final String host;
  final String config;
  final bool isLight;

  const ExportPage({
    super.key,
    required this.mode,
    required this.host,
    required this.config,
    this.isLight = false,
  });

  @override
  State<ExportPage> createState() => _ExportPageState();
}

class _ExportPageState extends State<ExportPage> {
  final nameCtrl = TextEditingController();
  final clientIdCtrl = TextEditingController();
  final quotaAmountCtrl = TextEditingController();
  bool lockConfig = true;
  bool hasExpire = false;
  bool hasQuota = false;
  String quotaUnit = "GB"; // "MB" or "GB"
  DateTime? expireDate;
  String? generatedLink;

  bool get isLight => widget.isLight;
  Color get bg => isLight ? const Color(0xFFF7F8FA) : const Color(0xFF0C0C0E);
  Color get card => isLight ? Colors.white : const Color(0xFF16161D);
  Color get text => isLight ? const Color(0xFF111111) : Colors.white;
  Color get text2 => isLight ? const Color(0xFF555562) : const Color(0xFFA1A1AA);
  Color get text3 => isLight ? const Color(0xFF888896) : const Color(0xFF71717A);
  Color get orangeAccent => const Color(0xFFFF7900);

  void generateOrangeLink() {
    if (nameCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Nommez d'abord la configuration")),
      );
      return;
    }

    final raw = clientIdCtrl.text.trim().toUpperCase();
    if (raw.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Saisissez au moins un ID client (ex: OR-XXXX-XXXX ou XV-XXXX-XXXX)",
          ),
        ),
      );
      return;
    }

    final parts = raw
        .split(RegExp(r'[,;\s\n]+'))
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();

    // Supporte les préfixes OR- et XV-
    final idPattern = RegExp(r'^(OR|XV)-[A-Z0-9]{4}-[A-Z0-9]{4}$');
    final List<String> validIds = [];
    for (final id in parts) {
      if (!idPattern.hasMatch(id)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Format ID invalide : $id\nAttendu : OR-XXXX-XXXX",
            ),
          ),
        );
        return;
      }
      if (!validIds.contains(id)) validIds.add(id);
    }

    if (validIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Aucun ID client valide")),
      );
      return;
    }

    // Calcul du quota en octets
    int? dataQuotaBytes;
    if (hasQuota) {
      final amount = double.tryParse(quotaAmountCtrl.text.trim().replaceAll(',', '.'));
      if (amount == null || amount <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Indiquez un volume valide (ex: 5 ou 500)")),
        );
        return;
      }
      if (quotaUnit == "GB") {
        dataQuotaBytes = (amount * 1024 * 1024 * 1024).round();
      } else {
        dataQuotaBytes = (amount * 1024 * 1024).round();
      }
    }

    // Clé unique pour ce lien (permet de suivre la conso même après réimport)
    final usageKey = "uk_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(999999).toRadixString(16)}";

    final data = {
      "app": "Orange VPN",
      "name": nameCtrl.text.trim(),
      "mode": widget.mode,
      "host": widget.host,
      "config": widget.config,
      "locked": lockConfig,
      "allowedClientId": validIds.first,
      "allowedClientIds": validIds,
      "expire_date":
          hasExpire && expireDate != null ? expireDate!.toIso8601String() : null,
      "created_at": DateTime.now().toIso8601String(),
      "signature": "@kcorp-tech",
      "usageKey": usageKey,
      if (dataQuotaBytes != null) "dataQuotaBytes": dataQuotaBytes,
    };

    String content = jsonEncode(data);
    if (lockConfig) {
      content = "ORANGE_LOCKED:${base64.encode(utf8.encode(content))}";
    }

    // Le lien régénéré devient orange://config/...
    final link = "orange://config/${_obfuscate(content)}";
    setState(() => generatedLink = link);
    Clipboard.setData(ClipboardData(text: link));

    final quotaMsg = dataQuotaBytes != null
        ? " • Quota ${quotaAmountCtrl.text} $quotaUnit"
        : "";
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Color(0xFF10B981), size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                "Lien Orange VPN copié ! (${validIds.length} appareil(s)$quotaMsg)",
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF1A1A22),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  @override
  void dispose() {
    nameCtrl.dispose();
    clientIdCtrl.dispose();
    quotaAmountCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        title: Row(
          children: [
            const OrangeShield(size: 26),
            const SizedBox(width: 10),
            Text(
              "Générateur de lien Orange (AES)",
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: text,
              ),
            ),
          ],
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: text),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Nom du profil Orange",
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: text2,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: nameCtrl,
              style: TextStyle(color: text),
              decoration: InputDecoration(
                hintText: "Ex: Orange Cameroun VIP 1",
                hintStyle: TextStyle(color: text3),
                filled: true,
                fillColor: card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 18),

            Text(
              "ID de l'appareil du / des client(s)",
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: text2,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "Collez l'ID affiché dans l'application Orange VPN du client (ex: OR-XXXX-XXXX). Le lien régénéré ne fonctionnera que sur ces téléphones.",
              style: TextStyle(color: text3, fontSize: 11),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: clientIdCtrl,
              maxLines: 3,
              style: TextStyle(
                color: text,
                fontFamily: 'monospace',
                fontWeight: FontWeight.w700,
                letterSpacing: 1.0,
                fontSize: 13,
              ),
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                hintText: "OR-ABCD-1234, OR-EFGH-5678",
                hintStyle: TextStyle(
                  color: text3,
                  fontFamily: 'monospace',
                  fontSize: 12,
                ),
                prefixIcon: Icon(
                  Icons.fingerprint_rounded,
                  color: orangeAccent,
                  size: 22,
                ),
                filled: true,
                fillColor: card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: orangeAccent.withOpacity(0.35)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: orangeAccent, width: 1.5),
                ),
              ),
            ),
            const SizedBox(height: 16),

            Container(
              decoration: BoxDecoration(
                color: card,
                borderRadius: BorderRadius.circular(14),
              ),
              child: SwitchListTile(
                title: Text(
                  "Sécuriser la configuration",
                  style: TextStyle(fontSize: 14, color: text, fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  "Chiffrement AES-256 anti-copie (lien orange://...)",
                  style: TextStyle(fontSize: 11, color: text2),
                ),
                value: lockConfig,
                activeColor: orangeAccent,
                onChanged: (v) => setState(() => lockConfig = v),
              ),
            ),
            const SizedBox(height: 12),

            Container(
              decoration: BoxDecoration(
                color: card,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                children: [
                  SwitchListTile(
                    title: Text(
                      "Date d'expiration",
                      style: TextStyle(fontSize: 14, color: text, fontWeight: FontWeight.w600),
                    ),
                    value: hasExpire,
                    activeColor: orangeAccent,
                    onChanged: (v) => setState(() => hasExpire = v),
                  ),
                  if (hasExpire)
                    ListTile(
                      title: Text(
                        expireDate == null
                            ? "Sélectionner la date d'expiration"
                            : "Expire le : ${expireDate!.day}/${expireDate!.month}/${expireDate!.year}",
                        style: TextStyle(fontSize: 13, color: text),
                      ),
                      trailing: Icon(Icons.calendar_month_rounded, color: orangeAccent),
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: DateTime.now().add(const Duration(days: 30)),
                          firstDate: DateTime.now(),
                          lastDate: DateTime(2035),
                        );
                        if (picked != null) {
                          setState(() => expireDate = picked);
                        }
                      },
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ===== QUOTA DE DONNÉES =====
            Container(
              decoration: BoxDecoration(
                color: card,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                children: [
                  SwitchListTile(
                    title: Text(
                      "Limiter le volume de données",
                      style: TextStyle(fontSize: 14, color: text, fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      "L'utilisateur ne pourra plus se connecter une fois le quota atteint",
                      style: TextStyle(fontSize: 11, color: text2),
                    ),
                    value: hasQuota,
                    activeColor: orangeAccent,
                    onChanged: (v) => setState(() => hasQuota = v),
                  ),
                  if (hasQuota)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: quotaAmountCtrl,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              style: TextStyle(color: text, fontWeight: FontWeight.w700),
                              decoration: InputDecoration(
                                hintText: "Ex: 5",
                                hintStyle: TextStyle(color: text3),
                                filled: true,
                                fillColor: isLight ? const Color(0xFFEFF1F5) : const Color(0xFF20202A),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  borderSide: BorderSide.none,
                                ),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            decoration: BoxDecoration(
                              color: isLight ? const Color(0xFFEFF1F5) : const Color(0xFF20202A),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: DropdownButtonHideUnderline(
                              child: DropdownButton<String>(
                                value: quotaUnit,
                                dropdownColor: card,
                                style: TextStyle(
                                  color: orangeAccent,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                ),
                                items: const [
                                  DropdownMenuItem(value: "MB", child: Text("MB")),
                                  DropdownMenuItem(value: "GB", child: Text("GB")),
                                ],
                                onChanged: (v) {
                                  if (v != null) setState(() => quotaUnit = v);
                                },
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: generateOrangeLink,
                icon: const Icon(Icons.key_rounded, size: 20),
                label: const Text(
                  "Générer / Régénérer le lien Orange & Copier",
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: orangeAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),

            if (generatedLink != null) ...[
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: card,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: orangeAccent.withOpacity(0.3)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "LIEN ORANGE GÉNÉRÉ (Copié dans le presse-papier) :",
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: orangeAccent,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    SelectableText(
                      generatedLink!,
                      style: TextStyle(
                        fontSize: 11,
                        color: text2,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            Center(
              child: Text(
                "powered :@kcorp-tech",
                style: TextStyle(
                  color: orangeAccent,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ========== GRAPHIQUE DE TRAFIC (CustomPainter) ==========
class _TrafficGraphPainter extends CustomPainter {
  final List<double> uploadPoints;
  final List<double> downloadPoints;
  final Color upColor;
  final Color downColor;
  final bool isLight;

  _TrafficGraphPainter({
    required this.uploadPoints,
    required this.downloadPoints,
    required this.upColor,
    required this.downColor,
    this.isLight = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (uploadPoints.isEmpty && downloadPoints.isEmpty) return;

    final maxVal = [
      ...uploadPoints,
      ...downloadPoints,
      0.01,
    ].reduce((a, b) => a > b ? a : b);

    void drawLine(List<double> points, Color color) {
      if (points.length < 2) return;
      final paint = Paint()
        ..color = color.withOpacity(0.85)
        ..strokeWidth = 1.8
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;

      final path = Path();
      final stepX = size.width / (points.length - 1).clamp(1, 9999);
      for (int i = 0; i < points.length; i++) {
        final x = i * stepX;
        final y = size.height - (points[i] / maxVal) * size.height * 0.92;
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      canvas.drawPath(path, paint);
    }

    // Lignes de fond légères
    final gridPaint = Paint()
      ..color = (isLight ? Colors.black : Colors.white).withOpacity(0.06)
      ..strokeWidth = 1;
    for (int i = 1; i < 3; i++) {
      final y = size.height * (i / 3);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    drawLine(downloadPoints, downColor);
    drawLine(uploadPoints, upColor);
  }

  @override
  bool shouldRepaint(covariant _TrafficGraphPainter oldDelegate) {
    return oldDelegate.uploadPoints.length != uploadPoints.length ||
        oldDelegate.downloadPoints.length != downloadPoints.length ||
        oldDelegate.isLight != isLight;
  }
}
