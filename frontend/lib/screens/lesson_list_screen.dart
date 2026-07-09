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
    _cargarProgreso();
    cargarLecciones();
  }

  void _cargarProgreso() {
    progreso = _progress.obtenerTodo();
  }

  Future<void> cargarLecciones() async {
    try {
      final ruta = 'assets/data/lecciones_${widget.nivel}.json';
      final jsonString = await rootBundle.loadString(ruta);
      final data = jsonDecode(jsonString);

      final totalFrases = data.length;
      final totalLecciones = (totalFrases / frasesPorLeccion).ceil();

      if (!mounted) return;

      setState(() {
        lecciones = List.generate(totalLecciones, (i) => i + 1);
        cargando = false;
        hayDatos = true;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        hayDatos = false;
        cargando = false;
      });
    }
  }

  String _formatearFecha(String iso) {
    try {
      final date = DateTime.parse(iso);

      return "${date.day.toString().padLeft(2, '0')}/"
          "${date.month.toString().padLeft(2, '0')}/"
          "${date.year}";
    } catch (_) {
      return iso;
    }
  }

  bool _isDesktopWidth(double screenWidth) {
    return screenWidth >= 900;
  }

  double _getContentMaxWidth(double screenWidth) {
    if (_isDesktopWidth(screenWidth)) {
      return 760;
    }

    return screenWidth;
  }

  EdgeInsets _getListPadding(double screenWidth) {
    if (_isDesktopWidth(screenWidth)) {
      return const EdgeInsets.fromLTRB(24, 24, 24, 32);
    }

    // Mismo estilo que training_category_screen.dart
    return const EdgeInsets.all(16);
  }

  Future<void> _abrirLeccion(int numeroLeccion) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            CanvasScreen(nivel: widget.nivel, numeroLeccion: numeroLeccion),
      ),
    );

    if (!mounted) return;

    setState(() {
      _cargarProgreso();
    });
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
      return _buildCenteredMessage(
        'No hay lecciones disponibles para ${widget.nivel}',
      );
    }

    if (lecciones.isEmpty) {
      return _buildCenteredMessage(
        'No se encontraron lecciones para ${widget.nivel}',
      );
    }

    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final screenWidth = constraints.maxWidth;
          final contentMaxWidth = _getContentMaxWidth(screenWidth);
          final listPadding = _getListPadding(screenWidth);
          final isDesktop = _isDesktopWidth(screenWidth);

          return ListView.builder(
            padding: listPadding,
            itemCount: lecciones.length,
            itemBuilder: (context, index) {
              final numeroLeccion = lecciones[index];

              if (!isDesktop) {
                return _buildLessonCard(numeroLeccion);
              }

              return Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: contentMaxWidth),
                  child: _buildLessonCard(numeroLeccion),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildCenteredMessage(String message) {
    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final screenWidth = constraints.maxWidth;
          final contentMaxWidth = _getContentMaxWidth(screenWidth);
          final isDesktop = _isDesktopWidth(screenWidth);

          final messageWidget = Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18),
            ),
          );

          if (!isDesktop) {
            return Center(child: messageWidget);
          }

          return Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: contentMaxWidth),
              child: messageWidget,
            ),
          );
        },
      ),
    );
  }

  Widget _buildLessonCard(int numeroLeccion) {
    final key = "progreso_${widget.nivel}_$numeroLeccion";
    final data = progreso[key];

    // Mismo estilo base que training_category_screen.dart
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: _buildIcon(data),
        title: Text(
          'Lección $numeroLeccion',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: _buildSubtitle(data),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _abrirLeccion(numeroLeccion),
      ),
    );
  }

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

  Widget _buildSubtitle(dynamic data) {
    if (data == null) {
      return const Text('No completado');
    }

    final aciertos = data['aciertos'];
    final total = data['total'];
    final fecha = data['fecha'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (aciertos != null && total != null)
          Text('$aciertos / $total kanjis')
        else
          const Text('Completado'),
        if (fecha != null)
          Text(
            _formatearFecha(fecha),
            style: const TextStyle(fontSize: 12, color: Colors.grey),
          ),
      ],
    );
  }
}
