import 'package:flutter/material.dart';
import 'package:kanji_app/main.dart';

class ResultadoScreen extends StatelessWidget {
  final List<Map<String, dynamic>> resultados;
  final String nivel;
  final int numeroLeccion;
  final int aciertos;

  const ResultadoScreen({
    super.key,
    required this.resultados,
    required this.nivel,
    required this.numeroLeccion,
    required this.aciertos,
  });

  String get mensajeResultado {
    final total = resultadosAgrupados.length;

    final aciertosAgrupados = resultadosAgrupados
        .where((r) => r["correcto"] == true)
        .length;

    if (aciertosAgrupados == 0) {
      return "No has acertado ningún kanji, ¡la próxima vez seguro que lo haces mejor! 💪";
    }

    if (aciertosAgrupados == total) {
      return "¡Has acertado todos los kanjis, eres increíble! 🎉";
    }

    return "Has acertado $aciertosAgrupados de $total kanjis";
  }

  List<Map<String, dynamic>> get resultadosAgrupados {
    final Map<String, Map<String, dynamic>> agrupados = {};

    for (final r in resultados) {
      final key =
          r["lectura"]; // 👈 o mejor: usar un id de palabra si lo tienes

      if (!agrupados.containsKey(key)) {
        agrupados[key] = {
          "kanji": "",
          "lectura": r["lectura"],
          "significado": r["significado"],
          "correcto": true,
        };
      }

      agrupados[key]!["kanji"] += r["kanji"];

      // si alguno es incorrecto → todo incorrecto
      if (r["correcto"] == false) {
        agrupados[key]!["correcto"] = false;
      }
    }

    return agrupados.values.toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Resultado lección")),
      body: Column(
        children: [
          const SizedBox(height: 8),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              mensajeResultado,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            "Kanjis practicados",
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 16),

          Expanded(
            child: ListView.builder(
              itemCount: resultadosAgrupados.length,
              itemBuilder: (context, index) {
                final lista = resultadosAgrupados; // 👈 AQUI
                final item = lista[index];

                final correcto = item["correcto"] == true;

                return ListTile(
                  leading: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: correcto ? Colors.green : Colors.red,
                    ),
                    child: Icon(
                      correcto ? Icons.check : Icons.close,
                      color: Colors.white,
                    ),
                  ),
                  title: Row(
                    children: [
                      Text(item["kanji"], style: const TextStyle(fontSize: 32)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item["lectura"]),
                            Text(item["significado"]),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 10),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(context);
                    },
                    child: const Text("Volver"),
                  ),
                ),

                const SizedBox(width: 8),

                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(
                          builder: (_) => CanvasScreen(
                            nivel: nivel,
                            numeroLeccion: numeroLeccion,
                          ),
                        ),
                      );
                    },
                    child: const Text("Repetir"),
                  ),
                ),

                const SizedBox(width: 8),

                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(
                          builder: (_) => CanvasScreen(
                            nivel: nivel,
                            numeroLeccion: numeroLeccion + 1,
                          ),
                        ),
                      );
                    },
                    child: const Text("Siguiente"),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
