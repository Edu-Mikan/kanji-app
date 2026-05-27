import 'package:shared_preferences/shared_preferences.dart';

class SettingsService {
  static final SettingsService _instance = SettingsService._internal();

  factory SettingsService() {
    return _instance;
  }

  SettingsService._internal();

  bool mostrarFurigana = true;
  bool mostrarTraduccion = true;

  Future<void> cargar() async {
    final prefs = await SharedPreferences.getInstance();

    mostrarFurigana = prefs.getBool("mostrarFurigana") ?? true;
    mostrarTraduccion = prefs.getBool("mostrarTraduccion") ?? true;
  }

  Future<void> guardar() async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setBool("mostrarFurigana", mostrarFurigana);
    await prefs.setBool("mostrarTraduccion", mostrarTraduccion);
  }
}
