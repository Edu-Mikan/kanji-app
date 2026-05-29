import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kanji_app/screens/loading_screen.dart';
import 'package:kanji_app/screens/resultado_screen.dart';
import 'package:kanji_app/styles/app_text_styles.dart';
import 'package:kanji_app/widgets/icon_text_button.dart';
import 'widgets/drawing_canvas.dart';
import 'dart:convert';
import 'widgets/kanji_svg.dart';
import 'widgets/furigana_text.dart';
import 'services/validation_service.dart';
import 'screens/settings_screen.dart';
import 'services/settings_service.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(fontFamily: 'NotoSansJP'),
      home: const LoadingScreen(),
    );
  }
}

class CanvasScreen extends StatefulWidget {
  final String nivel;
  final int numeroLeccion;

  const CanvasScreen({
    super.key,
    required this.nivel,
    required this.numeroLeccion,
  });

  @override
  State<CanvasScreen> createState() => _CanvasScreenState();
}

class _CanvasScreenState extends State<CanvasScreen> {
  final GlobalKey<DrawingCanvasState> canvasKey = GlobalKey();
  final SettingsService _settings = SettingsService();
  String resultado = '';
  String feedback = '';
  String frase = '';
  String kanjiObjetivo = '';
  bool mostrarSolucion = false;
  List<dynamic> lecciones = [];
  int indiceActual = 0;
  bool mostrarFeedbackGrande = false;
  bool mostrarFurigana = true;
  bool mostrarTraduccion = true;
  Timer? _drawTimer;
  bool _isValidating = false;
  int indiceKanjiActual = 0;
  String kanjiMostrado = '';
  bool hayTrazos = false;

  late final ValidationService _validationService;

  String get kanjiVisible {
    return kanjiObjetivo.substring(
      0,
      indiceKanjiActual.clamp(0, kanjiObjetivo.length),
    );
  }

  @override
  void initState() {
    super.initState();
    _validationService = ValidationService(baseUrl: 'http://localhost:3000');

    _initSettings();
    cargarLeccion();
  }

  Future<void> _initSettings() async {
    await _settings.cargar();

    setState(() {
      mostrarFurigana = _settings.mostrarFurigana;
      mostrarTraduccion = _settings.mostrarTraduccion;
    });
  }

  bool _isKanji(String char) {
    final code = char.codeUnitAt(0);
    return (code >= 0x4E00 && code <= 0x9FFF);
  }

  List<Map<String, String?>> parseFurigana(String text) {
    final tokens = <Map<String, String?>>[];

    int i = 0;

    while (i < text.length) {
      final open = text.indexOf('[', i);

      if (open == -1) {
        tokens.add({"text": text.substring(i), "reading": null});
        break;
      }

      final close = text.indexOf(']', open);

      final before = text.substring(i, open);
      final reading = text.substring(open + 1, close);

      // ✅ find the LAST contiguous kanji block at the end of "before"
      int splitIndex = before.length;

      while (splitIndex > 0 && _isKanji(before[splitIndex - 1])) {
        splitIndex--;
      }

      final prefix = before.substring(0, splitIndex);
      final kanjiBlock = before.substring(splitIndex);

      // ✅ prefix (no reading)
      if (prefix.isNotEmpty) {
        tokens.add({"text": prefix, "reading": null});
      }

      // ✅ kanji block (with reading)
      tokens.add({"text": kanjiBlock, "reading": reading});

      i = close + 1;
    }

    return tokens;
  }

  Future<void> cargarLeccion() async {
    final jsonString = await rootBundle.loadString(
      'assets/data/lecciones.json',
    );

    final data = jsonDecode(jsonString);

    lecciones = data.where((l) {
      return l['nivel'] == widget.nivel && l['parte'] == widget.numeroLeccion;
    }).toList();

    cargarLeccionActual();
  }

  void cargarLeccionActual() {
    if (lecciones.isEmpty) return;

    final leccion = lecciones[indiceActual];

    final fraseOriginal = leccion['frase'] ?? '';
    final targetKanji = leccion['target'] ?? '';

    final tokens = parseFurigana(fraseOriginal);

    // ✅ Inject tokens EXACTLY like old JSON
    leccion['tokens'] = tokens;

    // ✅ DEBUG
    print("TOKENS GENERADOS:");
    for (var t in tokens) {
      print("text='${t['text']}' reading='${t['reading']}'");
    }

    // ✅ IMPORTANT: remove [reading] before masking
    final fraseLimpia = fraseOriginal.replaceAll(RegExp(r'\[([^\]]+)\]'), '');

    setState(() {
      frase = ocultarKanjiObjetivo(fraseLimpia, targetKanji);
      kanjiObjetivo = targetKanji;
      _resetEstado();
    });
  }

  void siguienteLeccion() {
    if (lecciones.isEmpty) return;

    indiceKanjiActual = 0;
    kanjiMostrado = '';

    Future.delayed(const Duration(milliseconds: 50), () {
      canvasKey.currentState?.clear();
    });

    indiceActual = (indiceActual < lecciones.length - 1) ? indiceActual + 1 : 0;

    _cancelTimer();
    cargarLeccionActual();
  }

  void _resetEstado() {
    resultado = '';
    feedback = '';
    mostrarSolucion = false;
  }

  void _onUserDraw() {
    if (_isValidating) return;

    _cancelTimer();

    _drawTimer = Timer(const Duration(milliseconds: 1500), () {
      _autoValidar();
    });
  }

  void _cancelTimer() {
    _drawTimer?.cancel();
    _drawTimer = null;
  }

  String reemplazarHuecos(String texto, String resultado) {
    int index = 0;

    return texto.replaceAllMapped(RegExp("〇"), (match) {
      if (index < resultado.length) {
        return resultado[index++];
      }
      return "〇";
    });
  }

  String ocultarKanjiObjetivo(String frase, String kanji) {
    if (kanji.isEmpty) return frase;
    return frase.replaceFirst(kanji, "〇" * kanji.length);
  }

  String obtenerKanjiActual() {
    if (indiceKanjiActual >= kanjiObjetivo.length) {
      return kanjiObjetivo;
    }
    return kanjiObjetivo[indiceKanjiActual];
  }

  // ✅ VALIDACIÓN UNIFICADA
  void _validacionCorrecta(double score, {bool mostrarKanji = false}) {
    final esUltimoKanji = indiceKanjiActual >= kanjiObjetivo.length - 1;

    setState(() {
      resultado = "Score: ${score.toStringAsFixed(2)}";
      feedback = "Bien";
      mostrarFeedbackGrande = true;

      if (indiceKanjiActual < kanjiObjetivo.length) {
        if (mostrarKanji) {
          kanjiMostrado = kanjiObjetivo[indiceKanjiActual];
        }
        indiceKanjiActual++;
      }
    });

    if (esUltimoKanji) {
      final esUltimaLeccion = indiceActual >= lecciones.length - 1;

      Future.delayed(const Duration(milliseconds: 1000), () {
        if (!mounted) return;

        setState(() => mostrarFeedbackGrande = false);

        if (esUltimaLeccion) {
          _irResultado();
        } else {
          siguienteLeccion();
        }
      });

      return;
    } else {
      Future.delayed(const Duration(milliseconds: 600), () {
        if (!mounted) return;
        _limpiarParaSiguienteKanji();
      });
    }
  }

  void _validacionIncorrecta(double score) {
    _cancelTimer();

    setState(() {
      resultado = "Score: ${score.toStringAsFixed(2)}";
      feedback = "Incorrecto";
      mostrarFeedbackGrande = true;
      hayTrazos = true;
    });

    // ✅ ocultar después de un tiempo
    Future.delayed(const Duration(milliseconds: 800), () {
      if (!mounted) return;

      setState(() {
        mostrarFeedbackGrande = false;
      });
    });
  }

  void _limpiarParaSiguienteKanji() {
    setState(() {
      mostrarFeedbackGrande = false;
      kanjiMostrado = '';
    });

    canvasKey.currentState?.clear();
  }

  Future<void> _autoValidar() async {
    if (_isValidating) return;
    _isValidating = true;

    try {
      final strokes = canvasKey.currentState?.convertirStrokes();
      if (strokes == null || strokes.isEmpty) return;

      final result = await _validationService.validarKanji(
        kanji: obtenerKanjiActual(),
        strokes: strokes,
      );

      if (result == null) return;

      if (result.isCorrect) {
        _validacionCorrecta(result.score);
      } else {
        _validacionIncorrecta(result.score);
      }
    } finally {
      _isValidating = false;
    }
  }

  Widget _buildFrase() {
    if (lecciones.isEmpty) return const SizedBox();

    final leccion = lecciones[indiceActual];
    final tokens = leccion['tokens'];

    if (tokens == null || tokens.isEmpty) {
      return Text(frase, style: AppTextStyles.jpLarge);
    }

    return RichText(
      textAlign: TextAlign.center,
      text: TextSpan(
        style: AppTextStyles.jpLarge,
        children: (tokens as List)
            .map<InlineSpan>((token) => _buildToken(token))
            .toList(),
      ),
    );
  }

  String get progresoKanji {
    if (lecciones.isEmpty) return "";

    final actual = indiceActual + 1;
    final total = lecciones.length;

    return "Kanji $actual de $total";
  }

  InlineSpan _buildToken(dynamic token) {
    final rawText = (token['text'] ?? '') as String;
    final reading = token['reading'] as String?;

    final masked = _buildMaskedText(rawText);
    final display = reemplazarHuecos(masked, kanjiVisible);

    final contieneHueco = masked.contains("〇");

    final mostrarFuriganaToken =
        reading != null && (mostrarFurigana || contieneHueco);
    final textForFurigana = display;
    if (mostrarFuriganaToken) {
      return WidgetSpan(
        alignment: PlaceholderAlignment.middle,
        child: IntrinsicWidth(
          // ✅ ADD THIS WRAPPER
          child: FuriganaText(
            text: textForFurigana,
            reading: reading,
            indiceActivo: contieneHueco
                ? (indiceKanjiActual - kanjiVisible.length)
                : null,
          ),
        ),
      );
    }

    if (!contieneHueco) {
      return TextSpan(text: display);
    }

    return _buildHuecoSpan(masked);
  }

  String _buildMaskedText(String rawText) {
    if (kanjiObjetivo.isEmpty) return rawText;

    // ✅ only mask the PART that belongs to this token
    if (!rawText.contains(kanjiObjetivo)) {
      return rawText;
    }

    // ✅ If token exactly equals target → full mask
    if (rawText == kanjiObjetivo) {
      return "〇" * kanjiObjetivo.length;
    }

    // ✅ partial case (keep structure like before)
    return rawText.replaceFirst(kanjiObjetivo, "〇" * kanjiObjetivo.length);
  }

  InlineSpan _buildHuecoSpan(String maskedText) {
    final spans = <InlineSpan>[];
    int huecoIndex = 0;

    for (int i = 0; i < maskedText.length; i++) {
      final char = maskedText[i];

      if (char != "〇") {
        spans.add(TextSpan(text: char));
        continue;
      }

      if (huecoIndex < kanjiVisible.length) {
        spans.add(TextSpan(text: kanjiVisible[huecoIndex]));
      } else if (huecoIndex == indiceKanjiActual) {
        spans.add(
          TextSpan(
            text: "〇",
            style: AppTextStyles.jpLarge.copyWith(
              color: Colors.red,
              //decoration: TextDecoration.underline,
            ),
          ),
        );
      } else {
        spans.add(
          TextSpan(
            text: "〇",
            style: AppTextStyles.jpLarge.copyWith(color: Colors.grey),
          ),
        );
      }

      huecoIndex++;
    }

    return TextSpan(children: spans);
  }

  void _irResultado() {
    final kanjis = lecciones.map<String>((l) {
      return l['target'] as String;
    }).toList();

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => ResultadoScreen(kanjis: kanjis)),
    );
  }

  Future<void> _abrirSettings() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const SettingsScreen(), // ✅ SIN parámetros
      ),
    );

    if (result == true) {
      // ✅ recargar desde el service
      setState(() {
        mostrarFurigana = _settings.mostrarFurigana;
        mostrarTraduccion = _settings.mostrarTraduccion;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("${widget.nivel} - Lección ${widget.numeroLeccion}"),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: _abrirSettings,
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ✅ PROGRESO (PEGADO ARRIBA)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), // 🔥 clave
            child: Text(
              progresoKanji,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),

          // ✅ FRASE (PEGADA PERO CON UN POCO DE ESPACIO)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ✅ FRASE ocupa todo el espacio disponible
                    Expanded(child: Center(child: _buildFrase())),

                    const SizedBox(width: 8),

                    // ✅ BOTÓN MOSTRAR SOLUCIÓN
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconTextButton(
                          icon: Icons.visibility,
                          label: "Solución",
                          scale: 0.8, // 🔥 más pequeño
                          onTap: () {
                            canvasKey.currentState?.clear();
                            setState(() {
                              mostrarSolucion = true;
                              resultado = '';
                              feedback = '';
                              hayTrazos = false;
                            });
                          },
                        ),
                      ],
                    ),
                  ],
                ),

                const SizedBox(height: 6),

                // ✅ TRADUCCIÓN
                if (mostrarTraduccion &&
                    lecciones.isNotEmpty &&
                    indiceActual < lecciones.length)
                  Text(
                    lecciones[indiceActual]['traduccion'] ?? '',
                    style: TextStyle(fontSize: 14, color: Colors.grey.shade700),
                    textAlign: TextAlign.center,
                  ),
              ],
            ),
          ),

          Expanded(
            child: Stack(
              children: [
                DrawingCanvas(key: canvasKey, onDraw: _onUserDraw),

                if (kanjiMostrado.isNotEmpty)
                  Positioned(
                    top: 16,
                    right: 16,
                    child: Text(
                      kanjiMostrado,
                      style: const TextStyle(fontSize: 40),
                    ),
                  ),

                if (mostrarSolucion)
                  IgnorePointer(
                    child: Center(
                      child: KanjiSvg(
                        kanji: kanjiObjetivo,
                        size: 250,
                        opacity: 0.15,
                      ),
                    ),
                  ),

                if (mostrarFeedbackGrande)
                  Center(
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 200),
                      opacity: mostrarFeedbackGrande ? 1.0 : 0.0,
                      curve: Curves.easeOut,
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.9),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: feedback == "Bien"
                                ? Colors.green
                                : Colors.red,
                            width: 2,
                          ),
                          boxShadow: const [
                            BoxShadow(
                              color: Colors.black26,
                              blurRadius: 8,
                              offset: Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Icon(
                          feedback == "Bien" ? Icons.check : Icons.close,
                          color: feedback == "Bien" ? Colors.green : Colors.red,
                          size: 60,
                        ),
                      ),
                    ),
                  ),

                // ✅ BOTÓN BORRAR (esquina inferior derecha)
                if (hayTrazos)
                  Positioned(
                    bottom: 16,
                    right: 16,
                    child: IconTextButton(
                      icon: Icons.cleaning_services,
                      label: "Borrar",
                      scale: 1.0,
                      onTap: () {
                        canvasKey.currentState?.clear();

                        setState(() {
                          mostrarSolucion = false;
                          resultado = '';
                          feedback = '';
                          hayTrazos = false;
                        });
                      },
                    ),
                  ),
              ],
            ),
          ),

          ElevatedButton(
            onPressed: () {
              canvasKey.currentState?.clear();
              setState(() {
                mostrarSolucion = true;
                resultado = '';
                feedback = '';
                hayTrazos = false;
              });
            },
            child: const Text('Mostrar solución'),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Text(resultado, style: const TextStyle(fontSize: 20)),
                const SizedBox(height: 8),
                Text(
                  feedback,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
