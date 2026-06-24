import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:convert';
import '../services/validation_service.dart';
import '../widgets/drawing_canvas.dart';

class TestScreen extends StatefulWidget {
  final String nivel;
  final int numeroLeccion;

  const TestScreen({
    super.key,
    required this.nivel,
    required this.numeroLeccion,
  });

  @override
  _TestScreenState createState() => _TestScreenState();
}

class _TestScreenState extends State<TestScreen> {
  final GlobalKey<DrawingCanvasState> canvasKey = GlobalKey();

  late final ValidationService _validationService;
  List<String> kanjiList = [];
  int currentIndex = 0;

  String get currentKanji {
    if (kanjiList.isEmpty) return "";
    return kanjiList[currentIndex];
  }

  // Aquí integrarás tu canvas real
  List<dynamic> strokes = [];

  Future<void> sendResult(bool isCorrectUser) async {
    final strokes = canvasKey.currentState?.convertirStrokes();

    if (strokes == null || strokes.isEmpty) {
      debugPrint("No hay trazos");
      return;
    }

    // ✅ 1. usar ValidationService (recognize)
    final result = await _validationService.validarKanji(
      kanji: currentKanji,
      strokes: List<Map<String, dynamic>>.from(strokes),
    );

    if (result == null) {
      debugPrint("Error al validar");
      return;
    }

    // ✅ 2. enviar feedback (con tu decisión manual)
    await _validationService.sendFeedback(
      kanji: currentKanji,
      score: result.score,
      isCorrect: isCorrectUser,
      features: result.features,
      strokes: List<Map<String, dynamic>>.from(strokes),
      source: "test_screen",
    );

    debugPrint("Guardado: ${result.score} - correcto: $isCorrectUser");
  }

  Future<void> cargarLeccion() async {
    final ruta = 'assets/data/lecciones_${widget.nivel}.json';
    final jsonString = await rootBundle.loadString(ruta);
    final data = jsonDecode(jsonString);

    final leccionData = data.where((l) {
      return l['leccion'] == widget.numeroLeccion;
    }).toList();

    // 🔥 extraer SOLO los kanjis objetivo
    kanjiList = leccionData.map<String>((l) => l['target'] as String).toList();

    setState(() {});
  }

  void nextKanji() {
    if (kanjiList.isEmpty) return;

    if (currentIndex < kanjiList.length - 1) {
      setState(() {
        currentIndex++;
        strokes.clear();
      });
      canvasKey.currentState?.clear();
    } else {
      Navigator.pop(context);
    }
  }

  @override
  void initState() {
    super.initState();
    _validationService = ValidationService();
    cargarLeccion();
  }

  @override
  Widget build(BuildContext context) {
    if (kanjiList.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: Text("TEST · ${widget.nivel} L${widget.numeroLeccion}"),
        backgroundColor: Colors.orange, // visual de modo debug
      ),
      backgroundColor: Colors.white,
      body: Column(
        children: [
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

          const SizedBox(height: 30),

          // BOTONES
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 30,
                    vertical: 15,
                  ),
                ),
                onPressed: () async {
                  await sendResult(true);
                  nextKanji();
                },
                child: const Text("Correcto", style: TextStyle(fontSize: 18)),
              ),

              const SizedBox(width: 20),

              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 30,
                    vertical: 15,
                  ),
                ),
                onPressed: () async {
                  await sendResult(false);
                  nextKanji();
                },
                child: const Text("Incorrecto", style: TextStyle(fontSize: 18)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
