import 'package:flutter/material.dart';
import 'sample_review_screen.dart';
import '../services/validation_service.dart';
import '../widgets/drawing_canvas.dart';
import '../services/review_device_pairing_service.dart';

class TestScreen extends StatefulWidget {
  final List<String> kanjiList;
  final int initialIndex;

  const TestScreen({
    super.key,
    required this.kanjiList,
    required this.initialIndex,
  });

  @override
  State<TestScreen> createState() => _TestScreenState();
}

class _TestScreenState extends State<TestScreen> {
  final GlobalKey<DrawingCanvasState> canvasKey = GlobalKey();

  late final ValidationService _validationService;
  late final ReviewDevicePairingService _pairingService;
  late int currentIndex;

  String? lastFeedbackMessage;

  List<dynamic> strokes = [];

  bool _isSaving = false;

  String get currentKanji {
    if (widget.kanjiList.isEmpty) return "";
    return widget.kanjiList[currentIndex];
  }

  bool get canGoPrevious => currentIndex > 0;
  bool get canGoNext => currentIndex < widget.kanjiList.length - 1;

  @override
  void initState() {
    super.initState();
    _validationService = ValidationService();
    _pairingService = ReviewDevicePairingService();
    currentIndex = widget.initialIndex;
  }

  @override
  void dispose() {
    _pairingService.dispose();
    super.dispose();
  }

  Future<void> sendResult(bool isCorrectUser) async {
    if (_isSaving) return;

    final canvasStrokes = canvasKey.currentState?.convertirStrokes();

    if (canvasStrokes == null || canvasStrokes.isEmpty) {
      debugPrint("No hay trazos");

      setState(() {
        lastFeedbackMessage = "No hay trazos para guardar";
      });

      return;
    }

    setState(() {
      _isSaving = true;
    });

    try {
      final typedStrokes = List<Map<String, dynamic>>.from(canvasStrokes);

      final result = await _validationService.validarKanji(
        kanji: currentKanji,
        strokes: typedStrokes,
      );

      if (!mounted) return;

      if (result == null) {
        debugPrint("Error al validar");

        setState(() {
          lastFeedbackMessage = "Error al validar";
        });

        return;
      }

      final deviceToken = await _pairingService.readDeviceToken();

      if (deviceToken == null || deviceToken.trim().isEmpty) {
        if (!mounted) {
          return;
        }

        setState(() {
          lastFeedbackMessage =
              'Este dispositivo no está vinculado. Vuelve a Entrenamiento IA para vincularlo.';
        });

        return;
      }

      await _validationService.sendFeedback(
        kanji: currentKanji,
        score: result.score,
        isCorrect: isCorrectUser,
        features: result.features,
        strokes: typedStrokes,
        source: "test_screen",
        validationStrategy: result.validationStrategy,
        validationResult: result.validationResult,
        simpleValidation: result.simpleValidation,
        recognitionId: result.recognitionId,
        schemaVersion: result.schemaVersion,
        feedbackType: "manual_debug",
        deviceToken: deviceToken,
      );

      if (!mounted) return;

      debugPrint("Guardado: ${result.score} - correcto: $isCorrectUser");

      setState(() {
        lastFeedbackMessage =
            "Guardado · ${isCorrectUser ? "Correcto" : "Incorrecto"} · score: ${result.score.toStringAsFixed(3)}";
      });

      canvasKey.currentState?.clear();
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  void clearCanvasOnly() {
    canvasKey.currentState?.clear();

    setState(() {
      strokes.clear();
      lastFeedbackMessage = null;
    });
  }

  void nextKanji() {
    if (currentIndex >= widget.kanjiList.length - 1) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Último kanji')));
      return;
    }

    setState(() {
      currentIndex++;
      strokes.clear();
      lastFeedbackMessage = null;
    });

    canvasKey.currentState?.clear();
  }

  void previousKanji() {
    if (currentIndex <= 0) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Primer kanji')));
      return;
    }

    setState(() {
      currentIndex--;
      strokes.clear();
      lastFeedbackMessage = null;
    });

    canvasKey.currentState?.clear();
  }

  Future<void> openSampleReview() async {
    final kanji = currentKanji;

    if (kanji.isEmpty || _isSaving) {
      return;
    }

    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => SampleReviewScreen(kanji: kanji)),
    );
  }

  double _getContentMaxWidth(double screenWidth) {
    if (screenWidth >= 900) {
      return 560;
    }

    return screenWidth;
  }

  double _getCanvasSize({
    required double screenWidth,
    required double screenHeight,
  }) {
    final shortestSide = screenWidth < screenHeight
        ? screenWidth
        : screenHeight;

    if (screenWidth >= 900) {
      return 320;
    }

    if (screenHeight < 700) {
      return (shortestSide * 0.62).clamp(220.0, 280.0).toDouble();
    }

    return (screenWidth * 0.78).clamp(250.0, 320.0).toDouble();
  }

  double _getKanjiFontSize(double screenHeight) {
    if (screenHeight < 700) {
      return 56;
    }

    return 72;
  }

  Widget _buildCounter() {
    return Text(
      '${currentIndex + 1} / ${widget.kanjiList.length}',
      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
      textAlign: TextAlign.center,
    );
  }

  Widget _buildKanji(double screenHeight) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Text(
        currentKanji,
        style: TextStyle(
          fontSize: _getKanjiFontSize(screenHeight),
          fontWeight: FontWeight.bold,
          fontFamily: 'NotoSansJP',
        ),
      ),
    );
  }

  Widget _buildCanvas(double canvasSize) {
    return Center(
      child: Container(
        width: canvasSize,
        height: canvasSize,
        decoration: BoxDecoration(
          color: Colors.grey[200],
          border: Border.all(color: Colors.black54, width: 2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: DrawingCanvas(key: canvasKey, onDraw: () {}),
        ),
      ),
    );
  }

  Widget _buildFeedback() {
    if (lastFeedbackMessage == null) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Text(
        lastFeedbackMessage!,
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.bold,
          color: Colors.black87,
        ),
      ),
    );
  }

  ButtonStyle _buttonStyle(Color color, {bool compact = false}) {
    return ElevatedButton.styleFrom(
      backgroundColor: color,
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 16 : 22,
        vertical: compact ? 11 : 13,
      ),
      textStyle: TextStyle(
        fontSize: compact ? 15 : 17,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildActionButtons(double screenWidth) {
    final isDesktop = screenWidth >= 900;
    final compact = screenWidth < 390;

    final correctButton = ElevatedButton(
      style: _buttonStyle(Colors.green, compact: compact),
      onPressed: _isSaving
          ? null
          : () async {
              await sendResult(true);
            },
      child: const Text("Correcto"),
    );

    final incorrectButton = ElevatedButton(
      style: _buttonStyle(Colors.red, compact: compact),
      onPressed: _isSaving
          ? null
          : () async {
              await sendResult(false);
            },
      child: const Text("Incorrecto"),
    );

    final clearButton = ElevatedButton(
      style: _buttonStyle(Colors.grey, compact: compact),
      onPressed: _isSaving ? null : clearCanvasOnly,
      child: const Text("Borrar"),
    );

    final previousButton = ElevatedButton(
      style: _buttonStyle(Colors.blue, compact: compact),
      onPressed: !_isSaving && canGoPrevious ? previousKanji : null,
      child: const Text("Anterior"),
    );

    final nextButton = ElevatedButton(
      style: _buttonStyle(Colors.blue, compact: compact),
      onPressed: !_isSaving && canGoNext ? nextKanji : null,
      child: const Text("Siguiente"),
    );

    if (isDesktop) {
      return Column(
        children: [
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 12,
            runSpacing: 10,
            children: [correctButton, incorrectButton, clearButton],
          ),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 12,
            runSpacing: 10,
            children: [previousButton, nextButton],
          ),
        ],
      );
    }

    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 10,
      runSpacing: 10,
      children: [
        correctButton,
        incorrectButton,
        clearButton,
        previousButton,
        nextButton,
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.kanjiList.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Entrenamiento IA'),
        backgroundColor: Colors.orange,
        actions: [
          IconButton(
            tooltip: 'Ver muestras de $currentKanji',
            onPressed: _isSaving ? null : openSampleReview,
            icon: const Icon(Icons.collections_outlined),
          ),
        ],
      ),
      backgroundColor: Colors.white,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final screenWidth = constraints.maxWidth;
            final screenHeight = constraints.maxHeight;
            final contentMaxWidth = _getContentMaxWidth(screenWidth);
            final canvasSize = _getCanvasSize(
              screenWidth: screenWidth,
              screenHeight: screenHeight,
            );

            final isShortScreen = screenHeight < 700;

            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(16, isShortScreen ? 10 : 16, 16, 24),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: contentMaxWidth),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildCounter(),
                      SizedBox(height: isShortScreen ? 10 : 18),
                      Center(child: _buildKanji(screenHeight)),
                      SizedBox(height: isShortScreen ? 10 : 16),
                      _buildCanvas(canvasSize),
                      SizedBox(height: isShortScreen ? 10 : 14),
                      _buildFeedback(),
                      SizedBox(height: isShortScreen ? 14 : 18),
                      _buildActionButtons(screenWidth),
                      if (_isSaving) ...[
                        const SizedBox(height: 16),
                        const Center(child: CircularProgressIndicator()),
                      ],
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
