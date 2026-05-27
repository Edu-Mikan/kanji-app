import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kanji_app/screens/loading_screen.dart';
import 'package:kanji_app/styles/app_text_styles.dart';
import 'widgets/drawing_canvas.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'widgets/kanji_svg.dart';
import 'widgets/furigana_text.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(fontFamily: 'NotoSansJP'),
      home: const LoadingScreen(),
    );
  }
}

class CanvasScreen extends StatefulWidget {
  final String nivel;
  final int numeroLeccion;

  const CanvasScreen({
    super.key,
    required this.nivel,
    required this.numeroLeccion,
  });

  @override
  State<CanvasScreen> createState() => _CanvasScreenState();
}

class _CanvasScreenState extends State<CanvasScreen> {
  final GlobalKey<DrawingCanvasState> canvasKey = GlobalKey();

  String resultado = '';
  String feedback = '';
  String frase = '';
  String kanjiObjetivo = '';
  bool mostrarSolucion = false;
  List<dynamic> lecciones = [];
  int indiceActual = 0;

  bool mostrarFeedbackGrande = false;
  bool mostrarFurigana = true;
  Timer? _drawTimer;
  bool _isValidating = false;

  int indiceKanjiActual = 0;
  String kanjiMostrado = '';

  String get kanjiVisible {
    return kanjiObjetivo.substring(
      0,
      indiceKanjiActual.clamp(0, kanjiObjetivo.length),
    );
  }

  @override
  void initState() {
    super.initState();
    cargarLeccion();
  }

  Future<void> cargarLeccion() async {
    final jsonString = await rootBundle.loadString(
      'assets/data/lecciones.json',
    );

    final data = jsonDecode(jsonString);

    lecciones = data.where((l) {
      return l['nivel'] == widget.nivel && l['parte'] == widget.numeroLeccion;
    }).toList();

    cargarLeccionActual();
  }

  void cargarLeccionActual() {
    if (lecciones.isEmpty) return;

    final leccion = lecciones[indiceActual];
    final target = leccion['target'];

    final fraseOriginal = leccion['frase'] ?? '';
    final targetKanji = target?['kanji'] ?? '';

    setState(() {
      frase = ocultarKanjiObjetivo(fraseOriginal, targetKanji);
      kanjiObjetivo = targetKanji;
      _resetEstado();
    });
  }

  void siguienteLeccion() {
    if (lecciones.isEmpty) return;

    indiceKanjiActual = 0;
    kanjiMostrado = '';

    Future.delayed(const Duration(milliseconds: 50), () {
      canvasKey.currentState?.clear();
    });

    indiceActual = (indiceActual < lecciones.length - 1) ? indiceActual + 1 : 0;

    _cancelTimer();
    cargarLeccionActual();
  }

  void _resetEstado() {
    resultado = '';
    feedback = '';
    mostrarSolucion = false;
  }

  void _onUserDraw() {
    if (_isValidating) return;

    _cancelTimer();

    _drawTimer = Timer(const Duration(milliseconds: 1500), () {
      _autoValidar();
    });
  }

  void _cancelTimer() {
    _drawTimer?.cancel();
    _drawTimer = null;
  }

  String reemplazarHuecos(String texto, String resultado) {
    int index = 0;

    return texto.replaceAllMapped(RegExp("〇"), (match) {
      if (index < resultado.length) {
        return resultado[index++];
      }
      return "〇";
    });
  }

  String ocultarKanjiObjetivo(String frase, String kanji) {
    if (kanji.isEmpty) return frase;
    return frase.replaceFirst(kanji, "〇" * kanji.length);
  }

  String obtenerKanjiActual() {
    if (indiceKanjiActual >= kanjiObjetivo.length) {
      return kanjiObjetivo;
    }
    return kanjiObjetivo[indiceKanjiActual];
  }

  // ✅ VALIDACIÓN UNIFICADA
  void _validacionCorrecta(double score, {bool mostrarKanji = false}) {
    final esUltimoKanji = indiceKanjiActual >= kanjiObjetivo.length - 1;

    setState(() {
      resultado = "Score: ${score.toStringAsFixed(2)}";
      feedback = "Bien";
      mostrarFeedbackGrande = true;

      if (indiceKanjiActual < kanjiObjetivo.length) {
        if (mostrarKanji) {
          kanjiMostrado = kanjiObjetivo[indiceKanjiActual];
        }
        indiceKanjiActual++;
      }
    });

    if (esUltimoKanji) {
      Future.delayed(const Duration(milliseconds: 1000), () {
        if (!mounted) return;
        setState(() => mostrarFeedbackGrande = false);
        siguienteLeccion();
      });
    } else {
      Future.delayed(const Duration(milliseconds: 600), () {
        if (!mounted) return;
        _limpiarParaSiguienteKanji();
      });
    }
  }

  void _validacionIncorrecta(double score, {bool postFrame = false}) {
    _cancelTimer();

    if (postFrame) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        canvasKey.currentState?.clear();
      });
    } else {
      Future.delayed(const Duration(milliseconds: 50), () {
        canvasKey.currentState?.clear();
      });
    }

    setState(() {
      resultado = "Score: ${score.toStringAsFixed(2)}";
      feedback = "Incorrecto";
    });
  }

  void _limpiarParaSiguienteKanji() {
    setState(() {
      mostrarFeedbackGrande = false;
      kanjiMostrado = '';
    });

    canvasKey.currentState?.clear();
  }

  Future<void> _autoValidar() async {
    if (_isValidating) return;
    _isValidating = true;

    try {
      final strokes = canvasKey.currentState?.convertirStrokes();
      if (strokes == null || strokes.isEmpty) return;

      final response = await http.post(
        Uri.parse('http://localhost:3000/recognize'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "kanji": obtenerKanjiActual(),
          "ink": {"strokes": strokes},
        }),
      );

      if (response.statusCode != 200) {
        throw Exception('Error HTTP: ${response.statusCode}');
      }

      final data = jsonDecode(response.body);
      final score = data['score']?.toDouble();

      if (score == null) return;

      if (score <= 1.5) {
        _validacionCorrecta(score);
      } else {
        _validacionIncorrecta(score);
      }
    } catch (e) {
      debugPrint("AUTO VALIDAR ERROR: $e");
    } finally {
      _isValidating = false;
    }
  }

  Widget _buildFrase() {
    if (lecciones.isEmpty) return const SizedBox();

    final leccion = lecciones[indiceActual];
    final tokens = leccion['tokens'];

    if (tokens == null || tokens.isEmpty) {
      return Text(frase, style: AppTextStyles.jpLarge);
    }

    return RichText(
      textAlign: TextAlign.center,
      text: TextSpan(
        style: AppTextStyles.jpLarge,
        children: (tokens as List)
            .map<InlineSpan>((token) => _buildToken(token))
            .toList(),
      ),
    );
  }

  InlineSpan _buildToken(dynamic token) {
    final rawText = (token['text'] ?? '') as String;
    final reading = token['reading'] as String?;

    final masked = _buildMaskedText(rawText);
    final display = reemplazarHuecos(masked, kanjiVisible);

    if (reading != null && mostrarFurigana) {
      return WidgetSpan(
        alignment: PlaceholderAlignment.middle,
        child: FuriganaText(
          text: display,
          reading: reading,
          indiceActivo: indiceKanjiActual,
        ),
      );
    }

    if (!masked.contains("〇")) {
      return TextSpan(text: display);
    }

    return _buildHuecoSpan(masked);
  }

  String _buildMaskedText(String rawText) {
    if (kanjiObjetivo.isEmpty) return rawText;
    return rawText.replaceFirst(kanjiObjetivo, "〇" * kanjiObjetivo.length);
  }

  InlineSpan _buildHuecoSpan(String maskedText) {
    final spans = <InlineSpan>[];
    int huecoIndex = 0;

    for (int i = 0; i < maskedText.length; i++) {
      final char = maskedText[i];

      if (char != "〇") {
        spans.add(TextSpan(text: char));
        continue;
      }

      if (huecoIndex < kanjiVisible.length) {
        spans.add(TextSpan(text: kanjiVisible[huecoIndex]));
      } else if (huecoIndex == indiceKanjiActual) {
        spans.add(
          TextSpan(
            text: "〇",
            style: AppTextStyles.jpLarge.copyWith(
              color: Colors.red,
              decoration: TextDecoration.underline,
            ),
          ),
        );
      } else {
        spans.add(
          TextSpan(
            text: "〇",
            style: AppTextStyles.jpLarge.copyWith(color: Colors.grey),
          ),
        );
      }

      huecoIndex++;
    }

    return TextSpan(children: spans);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('漢字くん')),
      body: Column(
        children: [
          Padding(padding: const EdgeInsets.all(16), child: _buildFrase()),

          Expanded(
            child: Stack(
              children: [
                DrawingCanvas(key: canvasKey, onDraw: _onUserDraw),

                if (kanjiMostrado.isNotEmpty)
                  Positioned(
                    top: 16,
                    right: 16,
                    child: Text(
                      kanjiMostrado,
                      style: const TextStyle(fontSize: 40),
                    ),
                  ),

                if (mostrarSolucion)
                  IgnorePointer(
                    child: Center(
                      child: KanjiSvg(
                        kanji: kanjiObjetivo,
                        size: 250,
                        opacity: 0.15,
                      ),
                    ),
                  ),

                if (mostrarFeedbackGrande)
                  Container(
                    color: Colors.black.withValues(alpha: 0.3),
                    child: const Center(child: Text("🎉 ¡Muy bien! 🎉")),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
