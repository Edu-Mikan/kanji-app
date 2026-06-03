import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kanji_app/main.dart';
import '../services/progress_service.dart';

class LessonListScreen extends StatefulWidget {
  final String nivel;

  const LessonListScreen({super.key, required this.nivel});

  @override
  State<LessonListScreen> createState() => _LessonListScreenState();
}

class _LessonListScreenState extends State<LessonListScreen> {
  final ProgressService _progress = ProgressService();

  Map<String, dynamic> progreso = {};

  List<int> lecciones = [];
  bool cargando = true;
  bool hayDatos = true;

  static const int frasesPorLeccion = 5;

  @override
  void initState() {
    super.initState();
    cargarLecciones();
    _cargarProgreso();
  }

  // ✅ CARGAR PROGRESO
  void _cargarProgreso() {
    progreso = _progress.obtenerTodo();
  }

  // ✅ CARGAR LECCIONES DINÁMICAMENTE
  Future<void> cargarLecciones() async {
    try {
      final ruta = 'data/lecciones_${widget.nivel}.json';
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
      setState(() {
        hayDatos = false;
        cargando = false;
      });
    }
  }

  String _formatearFecha(String iso) {
    final date = DateTime.parse(iso);

    return "${date.day.toString().padLeft(2, '0')}/"
        "${date.month.toString().padLeft(2, '0')}/"
        "${date.year}";
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Nivel ${widget.nivel}')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (cargando) {
      return const Center(child: CircularProgressIndicator());
    }

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

    return ListView.builder(
      itemCount: lecciones.length,
      itemBuilder: (context, index) {
        final numeroLeccion = lecciones[index];

        final key = "progreso_${widget.nivel}_$numeroLeccion";
        final data = progreso[key];

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: ListTile(
            onTap: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => CanvasScreen(
                    nivel: widget.nivel,
                    numeroLeccion: numeroLeccion,
                  ),
                ),
              );

              // ✅ refrescar al volver
              setState(() {
                _cargarProgreso();
              });
            },

            // ✅ ICONO
            leading: _buildIcon(data),

            // ✅ TÍTULO
            title: Text(
              'Lección $numeroLeccion',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),

            // ✅ SUBTEXTO (resultado + fecha)
            subtitle: _buildSubtitle(data),

            trailing: const Icon(Icons.chevron_right),
          ),
        );
      },
    );
  }

  // ✅ ICONO DINÁMICO
  Widget _buildIcon(dynamic data) {
    if (data == null) {
      return const Icon(Icons.radio_button_unchecked);
    }

    final aciertos = data['aciertos'];
    final total = data['total'];

    if (aciertos == total) {
      return const Icon(Icons.star, color: Colors.amber);
    }

    return const Icon(Icons.check_circle, color: Colors.green);
  }

  // ✅ SUBTEXTO
  Widget _buildSubtitle(dynamic data) {
    if (data == null) {
      return const Text("No completado");
    }

    final aciertos = data['aciertos'];
    final total = data['total'];
    final fecha = data['fecha'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (aciertos != null && total != null)
          Text("$aciertos / $total kanjis")
        else
          const Text("Completado"),

        if (fecha != null)
          Text(
            _formatearFecha(fecha),
            style: const TextStyle(fontSize: 12, color: Colors.grey),
          ),
      ],
    );
  }
}
