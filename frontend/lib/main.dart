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
  String lecturaObjetivo = '';
  bool mostrarFeedbackGrande = false;
  bool mostrarFurigana = true;
  Timer? _drawTimer;
  bool _isValidating = false;

  int indiceKanjiActual = 0;
  String kanjiMostrado = '';

  String get kanjiVisible {
    final visibleCount = indiceKanjiActual.clamp(0, kanjiObjetivo.length);
    if (visibleCount == 0) return '';
    return kanjiObjetivo.substring(0, visibleCount);
  }

  @override
  void initState() {
    super.initState();
    cargarLeccion();
  }

  Future<void> cargarLeccion() async {
    final String jsonString = await rootBundle.loadString(
      'assets/data/lecciones.json',
    );

    final data = jsonDecode(jsonString);

    // ✅ FILTRAR
    lecciones = data.where((l) {
      return l['nivel'] == widget.nivel && l['parte'] == widget.numeroLeccion;
    }).toList();

    cargarLeccionActual();
  }

  void siguienteLeccion() {
    if (lecciones.isEmpty) return;

    indiceKanjiActual = 0;
    kanjiMostrado = '';

    // ✅ limpiar canvas
    Future.delayed(const Duration(milliseconds: 50), () {
      canvasKey.currentState?.clear();
    });

    // ✅ avanzar índice
    if (indiceActual < lecciones.length - 1) {
      indiceActual++;
    } else {
      indiceActual = 0;
    }
    //Cancelar el timer
    _cancelTimer();

    // ✅ cargar nueva lección
    final leccion = lecciones[indiceActual];
    final target = leccion['target'];

    setState(() {
      frase = leccion['frase'] ?? '';
      kanjiObjetivo = target?['kanji'] ?? '';
      lecturaObjetivo = target?['lectura'] ?? '';
      _resetEstadoVisualLeccion();
    });
  }

  void cargarLeccionActual() {
    if (lecciones.isEmpty) return;

    final leccion = lecciones[indiceActual];
    final target = leccion['target'];

    final fraseOriginal = leccion['frase'] ?? '';
    final targetKanji = target?['kanji'] ?? '';

    setState(() {
      frase = ocultarKanjiObjetivo(fraseOriginal, targetKanji);

      kanjiObjetivo = target?['kanji'] ?? '';
      lecturaObjetivo = target?['lectura'] ?? '';
      _resetEstadoVisualLeccion();
    });
  }

  void _onUserDraw() {
    if (_isValidating) return;
    _cancelTimer();

    // iniciar nuevo timer
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

    final placeholder = "〇" * kanji.length;

    return frase.replaceFirst(kanji, placeholder);
  }

  String obtenerKanjiActual() {
    if (kanjiObjetivo.isEmpty) return "";

    if (indiceKanjiActual >= kanjiObjetivo.length) {
      return kanjiObjetivo;
    }

    return kanjiObjetivo[indiceKanjiActual];
  }

  void _ocultarFeedbackYLimpiar() {
    if (!mounted) return;

    setState(() {
      mostrarFeedbackGrande = false;

      // ✅ limpiar SOLO el kanji de esquina
      kanjiMostrado = '';
    });

    canvasKey.currentState?.clear();
  }

  void _resetEstadoVisualLeccion() {
    resultado = '';
    feedback = '';
    mostrarSolucion = false;
  }

  void _manejarValidacionIncorrecta({
    required double score,
    required bool limpiarCanvasConPostFrame,
  }) {
    _cancelTimer();

    if (limpiarCanvasConPostFrame) {
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

  void _programarTransicionDespuesDeAcierto({
    required bool esUltimoKanji,
    required bool limpiarKanjiEsquinaEnIntermedio,
  }) {
    if (esUltimoKanji) {
      Future.delayed(const Duration(milliseconds: 1000), () {
        if (!mounted) return;

        setState(() {
          mostrarFeedbackGrande = false;
        });

        siguienteLeccion();
      });
      return;
    }

    Future.delayed(const Duration(milliseconds: 600), () {
      if (!mounted) return;

      if (limpiarKanjiEsquinaEnIntermedio) {
        _ocultarFeedbackYLimpiar();
        return;
      }

      setState(() {
        mostrarFeedbackGrande = false;
      });

      canvasKey.currentState?.clear();
    });
  }

  void _manejarValidacionCorrecta({
    required double score,
    required bool mostrarKanjiEnEsquina,
    required bool limpiarKanjiEsquinaEnIntermedio,
  }) {
    final esUltimoKanji = indiceKanjiActual >= kanjiObjetivo.length - 1;

    setState(() {
      resultado = "Score: ${score.toStringAsFixed(2)}";
      feedback = "Bien";
      mostrarFeedbackGrande = true;

      if (indiceKanjiActual < kanjiObjetivo.length) {
        if (mostrarKanjiEnEsquina) {
          kanjiMostrado = kanjiObjetivo[indiceKanjiActual];
        }
        indiceKanjiActual++;
      }
    });

    _programarTransicionDespuesDeAcierto(
      esUltimoKanji: esUltimoKanji,
      limpiarKanjiEsquinaEnIntermedio: limpiarKanjiEsquinaEnIntermedio,
    );
  }

  Future<void> _autoValidar() async {
    if (_isValidating) return;

    _isValidating = true;

    try {
      final strokes = canvasKey.currentState?.convertirStrokes();

      if (strokes == null || strokes.isEmpty) return;

      final url = Uri.parse('http://localhost:3000/recognize');
      final kanjiActual = obtenerKanjiActual();
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "kanji": kanjiActual,
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
        _manejarValidacionCorrecta(
          score: score,
          mostrarKanjiEnEsquina: false,
          limpiarKanjiEsquinaEnIntermedio: true,
        );
      } else {
        _manejarValidacionIncorrecta(
          score: score,
          limpiarCanvasConPostFrame: false,
        );
      }
    } catch (e) {
      debugPrint("AUTO VALIDAR ERROR: $e");
    } finally {
      _isValidating = false;
    }
  }

  Widget _buildFrase() {
    if (lecciones.isEmpty) {
      return const SizedBox();
    }

    final leccion = lecciones[indiceActual];
    final tokens = leccion['tokens'];
    final visible = kanjiVisible;

    // ✅ fallback si todavía no tienes tokens en el JSON

    if (tokens == null || tokens.isEmpty) {
      return Text(
        frase,
        style: AppTextStyles.jpLarge,
        textAlign: TextAlign.center,
      );
    }

    return RichText(
      textAlign: TextAlign.center,
      text: TextSpan(
        style: AppTextStyles.jpLarge,
        children: (tokens as List).map<InlineSpan>((token) {
          final rawText = (token['text'] ?? '') as String;
          final reading = token['reading'] as String?;

          final maskedText = kanjiObjetivo.isNotEmpty
              ? rawText.replaceFirst(kanjiObjetivo, "〇" * kanjiObjetivo.length)
              : rawText;

          final contieneHueco = maskedText.contains("〇");

          if (!contieneHueco) {
            if (reading == null || !mostrarFurigana) {
              return TextSpan(text: maskedText, style: AppTextStyles.jpLarge);
            }

            return WidgetSpan(
              alignment: PlaceholderAlignment.middle,
              child: FuriganaText(text: maskedText, reading: reading),
            );
          }

          final displayText = reemplazarHuecos(maskedText, visible);

          if (reading != null && mostrarFurigana) {
            return WidgetSpan(
              alignment: PlaceholderAlignment.middle,
              child: FuriganaText(
                text: displayText,
                reading: reading,
                indiceActivo: 0,
              ),
            );
          }

          final spans = <InlineSpan>[];
          int huecoIndex = 0;

          for (int i = 0; i < maskedText.length; i++) {
            final char = maskedText[i];

            if (char != "〇") {
              spans.add(TextSpan(text: char, style: AppTextStyles.jpLarge));
              continue;
            }

            if (huecoIndex < visible.length) {
              spans.add(
                TextSpan(
                  text: visible[huecoIndex],
                  style: AppTextStyles.jpLarge,
                ),
              );
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
        }).toList(),
      ),
    );
  }

  String kanjiToSvgFileName(String kanji) {
    final code = kanji.runes.first;
    return code.toRadixString(16).padLeft(5, '0');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('漢字くん')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: lecciones.isEmpty
                ? const SizedBox()
                : Column(
                    children: [
                      _buildFrase(),

                      const SizedBox(height: 8),

                      Text(
                        lecciones[indiceActual]['traduccion'] ?? '',
                        style: TextStyle(fontSize: 16, color: Colors.grey[700]),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
          ),

          Expanded(
            child: Stack(
              children: [
                // ✅ CANVAS BASE (primero)
                DrawingCanvas(
                  key: canvasKey,
                  solutionKanji: null,
                  onDraw: _onUserDraw,
                ),
                // ✅ kanji resultado (esquina superior derecha)
                if (kanjiMostrado.isNotEmpty)
                  Positioned(
                    top: 16,
                    right: 16,
                    child: Text(
                      kanjiMostrado,
                      style: const TextStyle(
                        fontSize: 40,
                        fontFamily: 'NotoSansJP',
                        fontWeight: FontWeight.bold,
                        color: Colors.black54,
                      ),
                    ),
                  ),
                // ✅ SVG ENCIMA CON OPACIDAD BAJA
                if (mostrarSolucion)
                  IgnorePointer(
                    // 👈 MUY IMPORTANTE
                    child: Center(
                      child: KanjiSvg(
                        kanji: kanjiObjetivo,
                        size: 250,
                        opacity: 0.15,
                      ),
                    ),
                  ),

                // ✅ overlay feedback
                if (mostrarFeedbackGrande)
                  Container(
                    color: Colors.black.withValues(alpha: 0.3),
                    child: const Center(child: Text("🎉 ¡Muy bien! 🎉")),
                  ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: () {
              canvasKey.currentState?.clear();

              setState(() {
                mostrarSolucion = false;
                resultado = '';
                feedback = '';
              });
            },
            child: const Text('Borrar'),
          ),

          ElevatedButton(
            onPressed: () async {
              try {
                final strokes = canvasKey.currentState?.convertirStrokes();

                if (strokes == null) return;

                final url = Uri.parse('http://localhost:3000/recognize');

                final response = await http.post(
                  url,
                  headers: {'Content-Type': 'application/json'},
                  body: jsonEncode({
                    "kanji": kanjiObjetivo,
                    "ink": {"strokes": strokes},
                  }),
                );

                // ✅ comprobar respuesta
                if (response.statusCode != 200) {
                  throw Exception('Error HTTP: ${response.statusCode}');
                }

                // ✅ intentar parsear JSON
                final data = jsonDecode(response.body);

                final scoreRaw = data['score'];

                if (scoreRaw == null) {
                  throw Exception('No viene score en respuesta');
                }

                final score = scoreRaw.toDouble();

                if (score <= 1.5) {
                  _manejarValidacionCorrecta(
                    score: score,
                    mostrarKanjiEnEsquina: true,
                    limpiarKanjiEsquinaEnIntermedio: false,
                  );
                } else {
                  _manejarValidacionIncorrecta(
                    score: score,
                    limpiarCanvasConPostFrame: true,
                  );
                }
              } catch (e) {
                // ✅ IMPORTANTE: ver error real
                debugPrint("ERROR VALIDAR: $e");

                setState(() {
                  feedback = "Error al validar";
                });
              }
            },
            child: const Text('Validar'),
          ),
          ElevatedButton(
            onPressed: () {
              canvasKey.currentState?.clear();
              setState(() {
                mostrarSolucion = true;
                resultado = '';
                feedback = '';
              });
            },
            child: const Text('Mostrar solución'),
          ),
          ElevatedButton(
            onPressed: () {
              setState(() {
                mostrarFurigana = !mostrarFurigana;
              });
            },
            child: Text('Toggle Furigana'),
          ),

          Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Text(resultado, style: const TextStyle(fontSize: 20)),

                const SizedBox(height: 8),
                Text(
                  feedback,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
