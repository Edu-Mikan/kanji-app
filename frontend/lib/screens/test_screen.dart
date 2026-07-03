import 'package:flutter/material.dart';
import '../services/validation_service.dart';
import '../widgets/drawing_canvas.dart';

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
  late int currentIndex;
  String? lastFeedbackMessage;

  String get currentKanji {
    if (widget.kanjiList.isEmpty) return "";
    return widget.kanjiList[currentIndex];
  }

  // Aquí integrarás tu canvas real
  List<dynamic> strokes = [];

  bool get canGoPrevious => currentIndex > 0;

  bool get canGoNext => currentIndex < widget.kanjiList.length - 1;

  Future<void> sendResult(bool isCorrectUser) async {
    final strokes = canvasKey.currentState?.convertirStrokes();

    if (strokes == null || strokes.isEmpty) {
      debugPrint("No hay trazos");

      setState(() {
        lastFeedbackMessage = "No hay trazos para guardar";
      });

      return;
    }

    final typedStrokes = List<Map<String, dynamic>>.from(strokes);

    // ✅ 1. usar ValidationService (recognize)
    final result = await _validationService.validarKanji(
      kanji: currentKanji,
      strokes: typedStrokes,
    );

    if (result == null) {
      debugPrint("Error al validar");

      setState(() {
        lastFeedbackMessage = "Error al validar";
      });

      return;
    }

    // ✅ 2. enviar feedback (con tu decisión manual)
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

      // Nuevos campos
      recognitionId: result.recognitionId,
      schemaVersion: result.schemaVersion,
      feedbackType: "manual_debug",
    );

    debugPrint("Guardado: ${result.score} - correcto: $isCorrectUser");

    // ✅ 3. Mostrar resultado y limpiar canvas, pero SIN pasar al siguiente kanji
    setState(() {
      lastFeedbackMessage =
          "Guardado · ${isCorrectUser ? "Correcto" : "Incorrecto"} · score: ${result.score.toStringAsFixed(3)}";
    });

    canvasKey.currentState?.clear();
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

  @override
  void initState() {
    super.initState();
    _validationService = ValidationService();
    //cargarKanjis();

    currentIndex = widget.initialIndex;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.kanjiList.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text("Entrenamiento IA"),
        backgroundColor: Colors.orange, // visual de modo debug
      ),
      backgroundColor: Colors.white,
      body: Column(
        children: [
          Text(
            '${currentIndex + 1} / ${widget.kanjiList.length}',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 40),

          // KANJI
          Text(currentKanji, style: const TextStyle(fontSize: 80)),

          const SizedBox(height: 20),

          // CANVAS (aquí metes el tuyo)
          Container(
            width: 300,
            height: 300,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              border: Border.all(color: Colors.black54, width: 2),
              borderRadius: BorderRadius.circular(
                12,
              ), // 👈 opcional pero queda mejor
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: DrawingCanvas(key: canvasKey, onDraw: () {}),
            ),
          ),

          //const SizedBox(height: 30),
          const SizedBox(height: 16),

          if (lastFeedbackMessage != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                lastFeedbackMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
            ),

          const SizedBox(height: 20),

          // BOTONES
          Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 14,
                      ),
                    ),
                    onPressed: () async {
                      await sendResult(true);
                    },
                    child: const Text(
                      "Correcto",
                      style: TextStyle(fontSize: 18),
                    ),
                  ),
                  const SizedBox(width: 16),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 14,
                      ),
                    ),
                    onPressed: () async {
                      await sendResult(false);
                    },
                    child: const Text(
                      "Incorrecto",
                      style: TextStyle(fontSize: 18),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.grey,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 14,
                      ),
                    ),
                    onPressed: clearCanvasOnly,
                    child: const Text("Borrar", style: TextStyle(fontSize: 18)),
                  ),
                  const SizedBox(width: 16),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 14,
                      ),
                    ),

                    onPressed: canGoPrevious ? previousKanji : null,

                    child: const Text(
                      "Anterior",
                      style: TextStyle(fontSize: 18),
                    ),
                  ),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 14,
                      ),
                    ),

                    onPressed: canGoNext ? nextKanji : null,

                    child: const Text(
                      "Siguiente",
                      style: TextStyle(fontSize: 18),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
