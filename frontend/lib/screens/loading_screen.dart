import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kanji_app/models/backend_version_info.dart';
import 'package:kanji_app/services/validation_service.dart';

import 'level_screen.dart';

class LoadingScreen extends StatefulWidget {
  const LoadingScreen({super.key});

  @override
  State<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends State<LoadingScreen> {
  static const int _maxBackendAttempts = 6;
  static const Duration _backendAttemptTimeout = Duration(seconds: 10);
  static const Duration _delayBetweenAttempts = Duration(milliseconds: 800);
  static const Duration _longWaitThreshold = Duration(milliseconds: 2500);

  late final ValidationService _validationService;

  double _progress = 0.0;
  bool _isLoadingFinished = false;
  bool _useIndeterminateProgress = false;
  bool _hasLoadingError = false;

  String _loadingMessage = 'Conectando con el servidor...';

  BackendVersionInfo? _backendVersion;

  @override
  void initState() {
    super.initState();
    _validationService = ValidationService();
    _initApp();
  }

  Future<void> _initApp() async {
    _resetLoadingState();

    _simulateProgress();
    _switchToLongWaitModeIfNeeded();

    final backendReady = await _waitForBackendReady();

    if (!mounted) return;

    if (!backendReady) {
      setState(() {
        _isLoadingFinished = true;
        _hasLoadingError = true;
        _useIndeterminateProgress = false;
        _progress = 1.0;
        _loadingMessage =
            'No se pudo conectar con el servidor. Comprueba la conexión o inténtalo de nuevo.';
      });
      return;
    }

    _isLoadingFinished = true;

    setState(() {
      _progress = 1.0;
      _useIndeterminateProgress = false;
      _loadingMessage = 'Servidor listo';
    });

    await Future.delayed(const Duration(milliseconds: 200));

    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LevelScreen()),
    );
  }

  void _resetLoadingState() {
    setState(() {
      _progress = 0.0;
      _isLoadingFinished = false;
      _useIndeterminateProgress = false;
      _hasLoadingError = false;
      _loadingMessage = 'Conectando con el servidor...';
      _backendVersion = null;
    });
  }

  Future<void> _simulateProgress() async {
    while (true) {
      await Future.delayed(const Duration(milliseconds: 100));

      if (!mounted || _isLoadingFinished) return;

      if (_useIndeterminateProgress) {
        continue;
      }

      if (_progress >= 0.85) {
        continue;
      }

      setState(() {
        final remaining = 0.85 - _progress;
        _progress += remaining * 0.08;
      });
    }
  }

  Future<void> _switchToLongWaitModeIfNeeded() async {
    await Future.delayed(_longWaitThreshold);

    if (!mounted || _isLoadingFinished) return;

    setState(() {
      _useIndeterminateProgress = true;
      _loadingMessage =
          'Despertando el servidor... Esto puede tardar unos segundos.';
    });
  }

  Future<bool> _waitForBackendReady() async {
    for (int attempt = 1; attempt <= _maxBackendAttempts; attempt++) {
      if (!mounted) return false;

      _setLoadingMessageForAttempt(attempt);

      final versionLoaded = await _tryLoadBackendVersion();

      if (versionLoaded) {
        return true;
      }

      final pingOk = await _tryPingBackend();

      if (pingOk) {
        return true;
      }

      if (attempt < _maxBackendAttempts) {
        await Future.delayed(_delayBetweenAttempts);
      }
    }

    return false;
  }

  void _setLoadingMessageForAttempt(int attempt) {
    if (!mounted) return;

    if (attempt == 1) {
      setState(() {
        _loadingMessage = 'Conectando con el servidor...';
      });
      return;
    }

    setState(() {
      _useIndeterminateProgress = true;
      _loadingMessage =
          'Despertando el servidor... intento $attempt de $_maxBackendAttempts';
    });
  }

  Future<bool> _tryLoadBackendVersion() async {
    try {
      final versionInfo = await _validationService.getBackendVersion().timeout(
        _backendAttemptTimeout,
      );

      if (versionInfo == null) {
        return false;
      }

      if (!mounted) return false;

      setState(() {
        _backendVersion = versionInfo;
      });

      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _tryPingBackend() async {
    try {
      await _validationService.ping().timeout(_backendAttemptTimeout);
      return true;
    } catch (_) {
      return false;
    }
  }

  void _retryLoading() {
    _initApp();
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

  Widget _buildProgressText() {
    if (_hasLoadingError) {
      return const SizedBox.shrink();
    }

    if (_useIndeterminateProgress) {
      return Text(
        'Esperando respuesta del backend...',
        style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
        textAlign: TextAlign.center,
      );
    }

    return Text('${(_progress * 100).toInt()}%');
  }

  Widget _buildRetryButton() {
    if (!_hasLoadingError) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: ElevatedButton.icon(
        onPressed: _retryLoading,
        icon: const Icon(Icons.refresh),
        label: const Text('Reintentar'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset(
                'assets/images/loading_image_kanji_kun.PNG',
                width: 120,
              ),
              const Text(
                '漢字くん',
                style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              Text(
                _loadingMessage,
                style: const TextStyle(fontSize: 18),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: 220,
                child: LinearProgressIndicator(
                  value: _useIndeterminateProgress ? null : _progress,
                  minHeight: 8,
                ),
              ),
              const SizedBox(height: 12),
              _buildProgressText(),
              const SizedBox(height: 20),
              _buildBackendVersion(),
              _buildRetryButton(),
            ],
          ),
        ),
      ),
    );
  }
}
