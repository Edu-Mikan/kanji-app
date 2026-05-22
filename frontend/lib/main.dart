import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kanji_app/screens/loading_screen.dart';
import 'widgets/drawing_canvas.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'widgets/kanji_svg.dart';

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
  //int start = 0;
  //int length = 0;
  List<dynamic> lecciones = [];
  int indiceActual = 0;
  String lecturaObjetivo = '';

  bool mostrarFeedbackGrande = false;

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
    canvasKey.currentState?.clear();

    // ✅ avanzar índice
    if (indiceActual < lecciones.length - 1) {
      indiceActual++;
    } else {
      indiceActual = 0;
    }

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
    });
  }

  // void cargarLeccionActual() {
  //   if (lecciones.isEmpty) return;

  //   final leccion = lecciones[indiceActual];
  //   final target = leccion['target'];

  //   setState(() {
  //     frase = leccion['frase'] ?? '';
  //     start = target?['start'] ?? 0;
  //     length = target?['length'] ?? 0;
  //     kanjiObjetivo = target?['kanji'] ?? '';

  //     resultado = '';
  //     feedback = '';
  //     mostrarSolucion = false;
  //   });
  // }

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

  Widget _buildFrase() {
    final parts = frase.split('〇');

    if (parts.length != 2) {
      return Text(frase, style: const TextStyle(fontSize: 24));
    }

    return RichText(
      textAlign: TextAlign.center,
      text: TextSpan(
        style: const TextStyle(fontSize: 24, color: Colors.black),
        children: [
          TextSpan(text: parts[0]),

          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            baseline: TextBaseline.ideographic,
            child: SizedBox(
              width: 28,
              height: 36, // 👈 altura total del bloque
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.center,
                children: [
                  // ✅ círculo (parte base inline)
                  Transform.translate(
                    offset: const Offset(0, -3), // 👈 🔥 ajuste vertical CLAVE
                    child: const Text(
                      "〇",
                      style: TextStyle(fontSize: 26, color: Colors.black),
                    ),
                  ),

                  // ✅ furigana flotante arriba
                  Positioned(
                    top: -16, // ajustable
                    child: IgnorePointer(
                      child: Text(
                        lecturaObjetivo,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          TextSpan(text: parts[1]),
        ],
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

            child: frase.isEmpty ? const SizedBox() : _buildFrase(),
          ),
          // Expanded(
          //   child:
          //     DrawingCanvas(
          //       key: canvasKey,
          //       solutionKanji: mostrarSolucion ? kanjiObjetivo : null
          //     ),
          // ),
          Expanded(
            child: Stack(
              children: [
                // ✅ CANVAS BASE (primero)
                DrawingCanvas(key: canvasKey, solutionKanji: null),

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

                if (score < 0.4) {
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
                } else if (score < 0.7) {
                  mensaje = "Mejorable";

                  setState(() {
                    resultado = "Score: ${score.toStringAsFixed(2)}";
                    feedback = mensaje;
                  });
                } else {
                  mensaje = "Incorrecto";

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
