import 'package:flutter/material.dart';
import 'package:kanji_app/screens/review_device_pairing_screen.dart';
import 'package:kanji_app/screens/training_category_screen.dart';
import 'package:kanji_app/services/review_device_pairing_service.dart';

class TrainingAccessScreen extends StatefulWidget {
  final ReviewDevicePairingService? pairingService;
  final WidgetBuilder? trainingScreenBuilder;
  final WidgetBuilder? pairingScreenBuilder;

  const TrainingAccessScreen({
    super.key,
    this.pairingService,
    this.trainingScreenBuilder,
    this.pairingScreenBuilder,
  });

  @override
  State<TrainingAccessScreen> createState() => _TrainingAccessScreenState();
}

class _TrainingAccessScreenState extends State<TrainingAccessScreen> {
  late final ReviewDevicePairingService _pairingService;
  late final bool _ownsService;

  bool _isChecking = true;
  String? _message;

  @override
  void initState() {
    super.initState();

    _ownsService = widget.pairingService == null;
    _pairingService = widget.pairingService ?? ReviewDevicePairingService();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _continueToTrainingIfAllowed();
    });
  }

  @override
  void dispose() {
    if (_ownsService) {
      _pairingService.dispose();
    }

    super.dispose();
  }

  Future<void> _continueToTrainingIfAllowed() async {
    if (!mounted) {
      return;
    }

    setState(() {
      _isChecking = true;
      _message = 'Comprobando vinculación del dispositivo...';
    });

    bool isPaired;

    try {
      isPaired = await _pairingService.isDevicePaired();
    } catch (_) {
      isPaired = false;
    }

    if (!mounted) {
      return;
    }

    if (isPaired) {
      _openTraining(replace: true);
      return;
    }

    setState(() {
      _isChecking = false;
      _message = 'Este dispositivo aún no está vinculado.';
    });

    await _openPairing();
  }

  Future<void> _openPairing() async {
    if (!mounted) {
      return;
    }

    final pairingBuilder = widget.pairingScreenBuilder;

    final paired = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder:
            pairingBuilder ??
            (_) => ReviewDevicePairingScreen(
              service: _pairingService,
              closeOnSuccess: true,
            ),
      ),
    );

    if (!mounted) {
      return;
    }

    if (paired == true) {
      _openTraining(replace: true);
      return;
    }

    setState(() {
      _isChecking = false;
      _message = 'Vinculación cancelada.';
    });
  }

  void _openTraining({required bool replace}) {
    final trainingBuilder =
        widget.trainingScreenBuilder ?? (_) => const TrainingCategoryScreen();

    final route = MaterialPageRoute(builder: trainingBuilder);

    if (replace) {
      Navigator.pushReplacement(context, route);
    } else {
      Navigator.push(context, route);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Entrenamiento IA')),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_isChecking) ...[
                    const CircularProgressIndicator(),
                    const SizedBox(height: 18),
                  ] else ...[
                    Icon(
                      Icons.link_off,
                      size: 56,
                      color: Colors.orange.shade700,
                    ),
                    const SizedBox(height: 18),
                  ],
                  Text(
                    _message ?? 'Preparando Entrenamiento IA...',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (!_isChecking) ...[
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: _openPairing,
                      icon: const Icon(Icons.link),
                      label: const Text('Vincular dispositivo'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
