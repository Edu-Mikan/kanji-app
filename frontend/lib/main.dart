import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'widgets/drawing_canvas.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: CanvasScreen(),
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
  //String lecturaObjetivo = '';
  String kanjiObjetivo = '';
  String kanjiMostrado = '';
  bool mostrarSolucion = false;

  
  int start = 0;
  int length = 0;


  @override
  void initState() {
    super.initState();
    cargarLeccion();
  }

  Future<void> cargarLeccion() async {
  final String jsonString =
      await rootBundle.loadString('assets/data/lecciones.json');

  final data = jsonDecode(jsonString);
  debugPrint(jsonEncode(data));

  final leccion = data[0]; // de momento solo una
  debugPrint(leccion.toString());

  setState(() {
    final target = leccion['target'];

    if (target != null) {
      start = target['start'];
      length = target['length'];
      kanjiObjetivo = target['kanji'] ?? '';
    }
    else{ 
      start = 0;
      length = 0;
      kanjiObjetivo = '';
    }
    frase = leccion['frase'];

  });
}

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('漢字くん')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: (frase.isEmpty)
                ? const SizedBox()
                : Builder(
                    builder: (_) {
                      debugPrint("frase: $frase");
                      if (frase.isEmpty ||
                          start < 0 ||
                          length <= 0 ||
                          start >= frase.length ||
                          start + length > frase.length) {
                        return const SizedBox();
                      }

                      debugPrint("frase length: ${frase.length}");
                      debugPrint("start: $start, length: $length");


                      final chars = frase.characters.toList();

                      final before = chars.take(start).join('');
                      final target = chars.skip(start).take(length).join('');
                      final after = chars.skip(start + length).join('');



                      //if (partes.length < 2) return const SizedBox();

                      return RichText(
                        text: TextSpan(
                          style: const TextStyle(fontSize: 24, color: Colors.black),
                          children: [
                            TextSpan(text: before),
                            TextSpan(
                              text: target,
                              style: TextStyle(
                                decoration: TextDecoration.underline,
                                color: Colors.blue,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            TextSpan(text: after),
                          ]
                          // children: [
                          //   TextSpan(text: partes[0]),
                          //   TextSpan(
                          //     text: lecturaObjetivo,
                          //     style: const TextStyle(
                          //       decoration: TextDecoration.underline,
                          //       fontWeight: FontWeight.bold,
                          //       color: Colors.blue,
                          //     ),
                          //   ),
                          //   TextSpan(text: partes[1]),
                          // ],
                        ),
                      );
                    },
                  ),
          ),
          
          // SizedBox(
          //   height: 400,
          //   width: double.infinity,
          //   child: DrawingCanvas(
          //     key: canvasKey,
          //     solutionKanji: mostrarSolucion ? kanjiMostrado : null,
          //   ),
          // ),

          Expanded(
            child: 
              DrawingCanvas(
                key: canvasKey,
                solutionKanji: mostrarSolucion ? kanjiObjetivo : null
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
              final strokes =
                  canvasKey.currentState?.convertirStrokes();

              if (strokes == null) return;

              final url = Uri.parse('http://localhost:3000/recognize');

              final response = await http.post(
                url,
                headers: {'Content-Type': 'application/json'},
                body: jsonEncode({
                  "kanji": kanjiObjetivo,
                  "ink": {
                    "strokes": strokes,
                  }
                }),
              );

              final data = jsonDecode(response.body);
              final score = data['score'];
              //final strokesSolucion = data['strokes'];

              String mensaje;

              if (score < 0.4) {
                mensaje = "✅ Bien";
              } else if (score < 0.7) {
                mensaje = "⚠️ Mejorable";
              } else {
                mensaje = "❌ Incorrecto";
              }

              setState(() {
                resultado = "Score: ${score.toStringAsFixed(2)}";
                feedback = mensaje;
                //strokesReferencia = strokesSolucion;
                
                if (score < 0.4) {
                  kanjiMostrado = "";
                  //mostrarSolucion = false;
                } else {
                  kanjiMostrado = kanjiObjetivo;
                  //mostrarSolucion = true;
                }

              });
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
                Text(
                  resultado,
                  style: const TextStyle(fontSize: 20),
                ),

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
      )
    );
  }
}