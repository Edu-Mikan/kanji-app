import 'package:flutter/material.dart';
import 'package:kanji_app/main.dart';

class ResultadoScreen extends StatelessWidget {
  final List<Map<String, dynamic>> kanjis;
  final String nivel;
  final int numeroLeccion;

  const ResultadoScreen({
    super.key,
    required this.kanjis,
    required this.nivel,
    required this.numeroLeccion,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Resultado lección")),
      body: Column(
        children: [
          const SizedBox(height: 16),

          const Text(
            "Kanjis practicados",
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 16),

          Expanded(
            child: ListView.builder(
              itemCount: kanjis.length,
              itemBuilder: (context, index) {
                final item = kanjis[index];
                return ListTile(
                  leading: Text(
                    item["kanji"],
                    style: const TextStyle(fontSize: 32),
                  ),

                  title: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item["lectura"],
                        style: const TextStyle(fontSize: 16),
                      ),
                      Text(
                        item["significado"],
                        style: const TextStyle(
                          fontSize: 14,
                          color: Colors.grey,
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
                // ✅ Volver (izquierda)
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(context);
                    },
                    child: const Text("Volver"),
                  ),
                ),

                const SizedBox(width: 8),

                // ✅ Repetir (centro)
                Expanded(
                  flex: 2, // 👈 más ancho
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

                // ✅ Siguiente (derecha)
                Expanded(
                  flex: 2, // 👈 más ancho
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
