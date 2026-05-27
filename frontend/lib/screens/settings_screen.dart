import 'package:flutter/material.dart';
import 'package:kanji_app/services/settings_service.dart';

class SettingsScreen extends StatefulWidget {
  // final bool mostrarFurigana;
  // final bool mostrarTraduccion;

  // const SettingsScreen({
  //   super.key,
  //   required this.mostrarFurigana,
  //   required this.mostrarTraduccion,
  // });
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late bool _mostrarFurigana;
  late bool _mostrarTraduccion;
  final SettingsService _settings = SettingsService();

  @override
  void initState() {
    super.initState();

    _mostrarFurigana = _settings.mostrarFurigana;
    _mostrarTraduccion = _settings.mostrarTraduccion;
  }

  void _guardarYVolver() async {
    _settings.mostrarFurigana = _mostrarFurigana;
    _settings.mostrarTraduccion = _mostrarTraduccion;

    await _settings.guardar();

    if (!mounted) return;

    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Configuración"),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _guardarYVolver,
        ),
      ),
      body: ListView(
        children: [
          SwitchListTile(
            title: const Text("Mostrar furigana"),
            value: _mostrarFurigana,
            onChanged: (value) {
              setState(() {
                _mostrarFurigana = value;
              });
            },
          ),

          SwitchListTile(
            title: const Text("Mostrar traducción"),
            value: _mostrarTraduccion,
            onChanged: (value) {
              setState(() {
                _mostrarTraduccion = value;
              });
            },
          ),
        ],
      ),
    );
  }
}
