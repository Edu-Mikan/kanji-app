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

    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.end,
      children: [
        Text(parts[0], style: const TextStyle(fontSize: 24)),

        // ✅ BLOQUE CORRECTO
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 2),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // ✅ SIN ancho fijo (clave)
              Text(
                lecturaObjetivo,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 2),

              // ✅ círculo define visual, no el ancho
              const Text(
                "〇",
                style: TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),

        Text(parts[1], style: const TextStyle(fontSize: 24)),
      ],
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
