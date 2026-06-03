import 'dart:convert';
import 'package:hive/hive.dart';

class ProgressService {
  final Box _box = Hive.box('progreso');

  String _key(String nivel, int leccion) {
    return 'progreso_${nivel}_$leccion';
  }

  // ✅ Guardar progreso
  Future<void> guardar({
    required String nivel,
    required int leccion,
    required Map<String, dynamic> resultados,
  }) async {
    final resumen = {
      "fecha": DateTime.now().toIso8601String(),
      "aciertos": resultados.values.where((r) => r["correcto"] == true).length,
      "total": resultados.length,
      "resultados": resultados,
    };

    await _box.put(_key(nivel, leccion), jsonEncode(resumen));
  }

  Map<String, dynamic> obtenerTodo() {
    final Map<String, dynamic> progreso = {};

    for (var key in _box.keys) {
      final value = _box.get(key);
      if (value == null) continue;

      progreso[key] = jsonDecode(value);
    }

    return progreso;
  }

  // ✅ Cargar progreso
  Map<String, dynamic>? cargar({required String nivel, required int leccion}) {
    final data = _box.get(_key(nivel, leccion));

    if (data == null) return null;

    final decoded = jsonDecode(data);

    return Map<String, dynamic>.from(decoded);
  }
}
