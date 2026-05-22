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
  const CanvasScreen({super.key});

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

  String kanjiResultado = '';
  bool mostrarKanjiEnFrase = false;

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
    lecciones = data;

    cargarLeccionActual();
  }

  void siguienteLeccion() {
    if (lecciones.isEmpty) return;

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
      //start = target?['start'] ?? 0;
      //length = target?['length'] ?? 0;
      kanjiObjetivo = target?['kanji'] ?? '';
      mostrarSolucion = false;
      lecturaObjetivo = target?['lectura'] ?? '';

      resultado = '';
      feedback = '';
      mostrarSolucion = false;

      kanjiResultado = '';
      mostrarKanjiEnFrase = false;
    });
  }

  void cargarLeccionActual() {
    if (lecciones.isEmpty) return;

    final leccion = lecciones[indiceActual];
    final target = leccion['target'];

    setState(() {
      frase = leccion['frase'] ?? '';
      kanjiObjetivo = target?['kanji'] ?? '';
      lecturaObjetivo = target?['lectura'] ?? '';

      resultado = '';
      feedback = '';
      mostrarSolucion = false;
    });
  }

  void _onUserDraw() {
    if (_isValidating) return;
    // cancelar timer anterior
    //_drawTimer?.cancel();
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

  Future<void> _autoValidar() async {
    if (_isValidating) return;

    _isValidating = true;

    try {
      final strokes = canvasKey.currentState?.convertirStrokes();

      if (strokes == null || strokes.isEmpty) return;

      final url = Uri.parse('http://localhost:3000/recognize');

      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "kanji": kanjiObjetivo,
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
        setState(() {
          resultado = "Score: ${score.toStringAsFixed(2)}";
          feedback = "Bien";
          mostrarFeedbackGrande = true;

          kanjiResultado = kanjiObjetivo;
          mostrarKanjiEnFrase = true;
        });

        Future.delayed(const Duration(milliseconds: 1000), () {
          if (!mounted) return;

          setState(() {
            mostrarFeedbackGrande = false;
          });

          siguienteLeccion();
        });
      }
      // else if (score < 0.7) {
      //   setState(() {
      //     resultado = "Score: ${score.toStringAsFixed(2)}";
      //     feedback = "Mejorable";
      //   });
      // }
      else {
        _cancelTimer();

        setState(() {
          resultado = "Score: ${score.toStringAsFixed(2)}";
          feedback = "Incorrecto";
        });

        Future.delayed(const Duration(milliseconds: 50), () {
          canvasKey.currentState?.clear();
        });
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
          // final text = token['text'];
          // final reading = token['reading'];
          // final esHueco = text == "〇";

          String text = token['text'];
          final reading = token['reading'];
          final esHueco = text == "〇";

          // ✅ sustituir si se ha acertado
          if (esHueco && mostrarKanjiEnFrase) {
            text = kanjiResultado;
          }

          if (reading == null || (!mostrarFurigana && !esHueco)) {
            return TextSpan(text: text, style: AppTextStyles.jpLarge);
          }

          return WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: FuriganaText(text: text, reading: reading),
          );
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
                if (kanjiResultado.isNotEmpty)
                  Positioned(
                    top: 16,
                    right: 16,
                    child: Text(
                      kanjiResultado,
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

                String mensaje;

                if (score <= 1.5) {
                  setState(() {
                    resultado = "Score: ${score.toStringAsFixed(2)}";
                    feedback = "Bien";
                    mostrarSolucion = false;
                    mostrarFeedbackGrande = true;
                  });

                  Future.delayed(const Duration(milliseconds: 1000), () {
                    if (!mounted) return;

                    setState(() {
                      mostrarFeedbackGrande = false;
                    });

                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (!mounted) return;
                      siguienteLeccion();
                    });
                  });
                }
                // else if (score < 0.7) {
                //   mensaje = "Mejorable";
                //   setState(() {
                //     resultado = "Score: ${score.toStringAsFixed(2)}";
                //     feedback = mensaje;
                //   });
                // }
                else {
                  mensaje = "Incorrecto";

                  // ✅ detener validación futura
                  _cancelTimer();

                  // ✅ borrar canvas
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    canvasKey.currentState?.clear();
                  });

                  setState(() {
                    resultado = "Score: ${score.toStringAsFixed(2)}";
                    feedback = mensaje;
                  });
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
