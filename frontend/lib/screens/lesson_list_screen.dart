import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../main.dart';

class LessonListScreen extends StatefulWidget {
  final String nivel;

  const LessonListScreen({super.key, required this.nivel});

  @override
  State<LessonListScreen> createState() => _LessonListScreenState();
}

class _LessonListScreenState extends State<LessonListScreen> {
  List<int> lecciones = [];
  bool cargando = true;
  bool hayDatos = true;

  static const int frasesPorLeccion = 5;

  @override
  void initState() {
    super.initState();
    cargarLecciones();
  }

  Future<void> cargarLecciones() async {
    try {
      final ruta = 'assets/data/lecciones_${widget.nivel}.json';
      final jsonString = await rootBundle.loadString(ruta);

      final data = jsonDecode(jsonString);

      // ✅ total de frases en el fichero
      final totalFrases = data.length;

      // ✅ calcular nº de lecciones
      final totalLecciones = (totalFrases / frasesPorLeccion).ceil();

      setState(() {
        lecciones = List.generate(totalLecciones, (i) => i + 1);
        cargando = false;
      });
    } catch (e) {
      // ✅ si el fichero no existe
      setState(() {
        hayDatos = false;
        cargando = false;
      });
    }
  }

  IconData getIconForLeccion(int leccion) {
    return leccion == 1 ? Icons.star : Icons.menu_book;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Nivel ${widget.nivel}')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    // ✅ loading
    if (cargando) {
      return const Center(child: CircularProgressIndicator());
    }

    // ✅ no hay datos para ese nivel
    if (!hayDatos) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'No hay lecciones disponibles para ${widget.nivel}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18),
          ),
        ),
      );
    }

    // ✅ lista de lecciones
    return ListView.builder(
      itemCount: lecciones.length,
      itemBuilder: (context, index) {
        final leccion = lecciones[index];

        return ListTile(
          leading: Icon(getIconForLeccion(leccion)),
          title: Text('Lección $leccion'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) =>
                    CanvasScreen(nivel: widget.nivel, numeroLeccion: leccion),
              ),
            );
          },
        );
      },
    );
  }
}
