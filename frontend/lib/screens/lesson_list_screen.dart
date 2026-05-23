import 'package:flutter/material.dart';
import '../main.dart';

class LessonListScreen extends StatelessWidget {
  final String nivel;

  const LessonListScreen({super.key, required this.nivel});

  @override
  Widget build(BuildContext context) {
    // 👉 ejemplo: 10 lecciones por nivel
    final List<int> lecciones = List.generate(10, (i) => i + 1);

    return Scaffold(
      appBar: AppBar(title: Text('Nivel $nivel')),
      body: ListView.builder(
        itemCount: lecciones.length,
        itemBuilder: (context, index) {
          final leccion = lecciones[index];

          return ListTile(
            title: Text('Lección $leccion'),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      CanvasScreen(nivel: nivel, numeroLeccion: leccion),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
