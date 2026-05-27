import 'package:flutter/material.dart';

class ResultadoScreen extends StatelessWidget {
  final List<String> kanjis;

  const ResultadoScreen({super.key, required this.kanjis});

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
                return ListTile(
                  title: Text(
                    kanjis[index],
                    style: const TextStyle(fontSize: 32),
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 10),

          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
            },
            child: const Text("Volver"),
          ),

          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
