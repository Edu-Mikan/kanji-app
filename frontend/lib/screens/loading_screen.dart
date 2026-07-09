import 'package:flutter/material.dart';
import 'package:kanji_app/services/validation_service.dart';
import 'level_screen.dart';
import 'package:kanji_app/models/backend_version_info.dart';

class LoadingScreen extends StatefulWidget {
  const LoadingScreen({super.key});

  @override
  State<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends State<LoadingScreen> {
  late final ValidationService _validationService;
  double _progress = 0.0;
  bool _isLoadingFinished = false;
  BackendVersionInfo? _backendVersion;

  @override
  void initState() {
    super.initState();
    _validationService = ValidationService();
    _initApp();
  }

  Future<void> _warmUpBackend() async {
    try {
      await _validationService.ping();
    } catch (_) {}
  }

  Future<void> _loadBackendVersion() async {
    try {
      final versionInfo = await _validationService.getBackendVersion();

      if (!mounted) return;

      setState(() {
        _backendVersion = versionInfo;
      });
    } catch (_) {
      // No bloqueamos la carga si falla la versión.
    }
  }

  Future<void> _fakeMinimumLoad() async {
    await Future.delayed(const Duration(milliseconds: 1500));
  }

  Future<void> _simulateProgress() async {
    while (true) {
      await Future.delayed(const Duration(milliseconds: 100));

      if (!mounted || _isLoadingFinished) return;

      // 🔥 protección extra
      if (_progress >= 0.9) continue;

      setState(() {
        //_progress = (_progress + 0.02).clamp(0.0, 0.9);

        final remaining = 1.0 - _progress;
        _progress += remaining * 0.08;
      });
    }
  }

  Future<void> _initApp() async {
    _simulateProgress();

    await Future.wait([
      _warmUpBackend(),
      _loadBackendVersion(),
      _fakeMinimumLoad(),
    ]);

    _isLoadingFinished = true;

    setState(() {
      _progress = 1.0;
    });

    await Future.delayed(const Duration(milliseconds: 300));

    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LevelScreen()),
    );
  }

  Widget _buildBackendVersion() {
    final version = _backendVersion;

    if (version == null) {
      return Text(
        'Backend: comprobando versión...',
        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
      );
    }

    return Column(
      children: [
        Text(
          version.displayText,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey.shade700,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          version.detailText,
          style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/images/loading_image_kanji_kun.PNG',
              width: 120,
            ),
            Text(
              "漢字くん",
              style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 16),
            Text("Cargando aplicación...", style: TextStyle(fontSize: 18)),
            SizedBox(height: 24),
            SizedBox(
              width: 200,
              child: LinearProgressIndicator(
                value: _progress, // 🔥 progreso real
                minHeight: 8,
              ),
            ),

            const SizedBox(height: 12),
            Text("${(_progress * 100).toInt()}%"),
            const SizedBox(height: 20),
            _buildBackendVersion(),
          ],
        ),
      ),
    );
  }
}
