import 'dart:async';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:app_links/app_links.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Class Attend',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const WebViewScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  WebViewController? controller;
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSubscription;

  final String targetUrl = 'https://stjohnsnew.rf.gd//Class_Attend/';

  bool isOffline = false;
  bool _isLoading = true;
  late StreamSubscription<List<ConnectivityResult>> connectivitySubscription;

  // Biometric
  final LocalAuthentication _localAuth = LocalAuthentication();
  bool _biometricAvailable = false;
  bool _biometricEnabled = false;
  SharedPreferences? _prefs;

  // SharedPreferences keys
  static const String _keyBiometricEnabled = 'biometric_enabled';
  static const String _keyUserRole = 'biometric_user_role';
  static const String _keyDashboardUrl = 'biometric_dashboard_url';

  @override
  void initState() {
    super.initState();
    _initBiometricAndLoad();
  }

  Future<void> _initBiometricAndLoad() async {
    _prefs = await SharedPreferences.getInstance();

    // Check if device supports biometrics
    try {
      final bool canAuth = await _localAuth.canCheckBiometrics;
      final bool isDeviceSupported = await _localAuth.isDeviceSupported();
      _biometricAvailable = canAuth && isDeviceSupported;
    } catch (e) {
      _biometricAvailable = false;
    }

    _biometricEnabled = _prefs?.getBool(_keyBiometricEnabled) ?? false;
    final String? savedDashUrl = _prefs?.getString(_keyDashboardUrl);

    // If biometric is enabled and we have a saved URL, attempt auto-login
    if (_biometricAvailable && _biometricEnabled && savedDashUrl != null) {
      final bool authenticated = await _authenticateBiometric();
      if (authenticated) {
        _initWebView(savedDashUrl);
      } else {
        // Biometric failed — load normal login page
        _initWebView(targetUrl);
      }
    } else {
      // Normal startup
      _initWebView(targetUrl);
    }
  }

  Future<bool> _authenticateBiometric() async {
    try {
      return await _localAuth.authenticate(
        localizedReason: 'Verify your identity to sign in',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
        ),
      );
    } catch (e) {
      debugPrint('Biometric auth error: $e');
      return false;
    }
  }

  void _initWebView(String startUrl) {
    _initAppLinks();

    // Connectivity check
    Connectivity().checkConnectivity().then((List<ConnectivityResult> results) {
      if (mounted) {
        setState(() {
          isOffline = results.every((r) => r == ConnectivityResult.none);
        });
      }
    });

    connectivitySubscription = Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {
      if (mounted) {
        setState(() {
          isOffline = results.every((r) => r == ConnectivityResult.none);
        });
      }
    });

    controller = WebViewController()
      ..clearCache()
      ..clearLocalStorage()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..setUserAgent('Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36')
      // JavaScript channel for biometric communication
      ..addJavaScriptChannel(
        'BiometricBridge',
        onMessageReceived: (JavaScriptMessage message) {
          _handleBiometricMessage(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {},
          onPageStarted: (String url) {},
          onPageFinished: (String url) {
            if (mounted) {
              setState(() { _isLoading = false; });
            }

            // Inject smooth scrolling CSS
            controller?.runJavaScript('''
              if (!document.getElementById("flutter_webview_style_injector")) {
                var style = document.createElement("style");
                style.id = "flutter_webview_style_injector";
                style.innerHTML = "html, body { scroll-behavior: smooth !important; -webkit-overflow-scrolling: touch !important; overscroll-behavior-y: contain; }";
                document.head.appendChild(style);
              }
            ''');

            // Inject biometric support info into the page
            _injectBiometricStatus();

            // Save dashboard URL if we landed on admin.html or student.html
            final lowerUrl = url.toLowerCase();
            if (lowerUrl.contains('admin.html') || lowerUrl.contains('student.html')) {
              _prefs?.setString(_keyDashboardUrl, url);
              if (lowerUrl.contains('admin.html')) {
                _prefs?.setString(_keyUserRole, 'admin');
              } else {
                _prefs?.setString(_keyUserRole, 'student');
              }
            }

            // If user landed on index.html (login page) and was NOT just starting fresh,
            // they might have been logged out — clear biometric data
            if (lowerUrl.contains('index.html') && _biometricEnabled) {
              _clearBiometricData();
            }
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebView Error: ${error.description}');
          },
          onNavigationRequest: (NavigationRequest request) async {
            if (request.url.contains('accounts.google.com')) {
              final Uri url = Uri.parse('${targetUrl}login_mobile.php');
              if (await canLaunchUrl(url)) {
                await launchUrl(url, mode: LaunchMode.externalApplication);
                return NavigationDecision.prevent;
              }
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(startUrl));

    if (mounted) setState(() {});
  }

  void _injectBiometricStatus() {
    final String available = _biometricAvailable ? 'true' : 'false';
    final String enabled = _biometricEnabled ? 'true' : 'false';

    controller?.runJavaScript('''
      window.__biometricAvailable = $available;
      window.__biometricEnabled = $enabled;
      window.__isMobileApp = true;
      
      // Dispatch event so JS can react
      window.dispatchEvent(new CustomEvent('biometricStatusReady', {
        detail: { available: $available, enabled: $enabled }
      }));
    ''');
  }

  void _handleBiometricMessage(String message) async {
    switch (message) {
      case 'check':
        // Return biometric status to web page
        _injectBiometricStatus();
        break;

      case 'enable':
        // Verify biometric first, then enable
        final bool authenticated = await _authenticateBiometric();
        if (authenticated) {
          _biometricEnabled = true;
          _prefs?.setBool(_keyBiometricEnabled, true);
          // Notify web that biometric was enabled successfully
          controller?.runJavaScript('''
            window.__biometricEnabled = true;
            window.dispatchEvent(new CustomEvent('biometricResult', {
              detail: { action: 'enable', success: true }
            }));
          ''');
        } else {
          controller?.runJavaScript('''
            window.dispatchEvent(new CustomEvent('biometricResult', {
              detail: { action: 'enable', success: false }
            }));
          ''');
        }
        break;

      case 'disable':
        _clearBiometricData();
        controller?.runJavaScript('''
          window.__biometricEnabled = false;
          window.dispatchEvent(new CustomEvent('biometricResult', {
            detail: { action: 'disable', success: true }
          }));
        ''');
        break;
    }
  }

  void _clearBiometricData() {
    _biometricEnabled = false;
    _prefs?.setBool(_keyBiometricEnabled, false);
    _prefs?.remove(_keyUserRole);
    _prefs?.remove(_keyDashboardUrl);
  }

  void _initAppLinks() {
    _appLinks = AppLinks();

    _appLinks.getInitialLink().then((Uri? uri) {
      if (uri != null) {
        _handleDeepLink(uri);
      }
    });

    _linkSubscription = _appLinks.uriLinkStream.listen((Uri? uri) {
      if (uri != null) {
        _handleDeepLink(uri);
      }
    });
  }

  void _handleDeepLink(Uri uri) {
    if (uri.scheme == 'classattend' && uri.host == 'login') {
      final String? token = uri.queryParameters['token'];
      if (token != null && token.isNotEmpty) {
        final String loginScript = '''
          fetch('api/auth.php?action=token_login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ token: '$token' })
          }).then(res => res.json()).then(data => {
            if (data.success) {
              window.location.href = data.role === 'admin' ? 'admin.html' : 'student.html';
            } else {
              alert('Login failed: ' + (data.error || 'Unknown error'));
            }
          }).catch(err => {
            alert('Error connecting during login.');
          });
        ''';
        controller?.runJavaScript(loginScript);
      }
    }
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    connectivitySubscription.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            if (controller != null)
              WebViewWidget(controller: controller!),
            if (_isLoading)
              const Positioned.fill(
                child: Center(
                  child: CircularProgressIndicator(),
                ),
              ),
            if (isOffline)
              Positioned.fill(
                child: Container(
                  color: Colors.white.withValues(alpha: 0.95),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(
                          Icons.wifi_off_rounded,
                          size: 80,
                          color: Colors.redAccent,
                        ),
                        SizedBox(height: 20),
                        Text(
                          'No Internet Connection',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: Colors.black87,
                          ),
                        ),
                        SizedBox(height: 10),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 40.0),
                          child: Text(
                            'Please check your network settings. Your progress is saved and the app will resume when connected.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.black54,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
