import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:kanji_app/screens/loading_screen.dart';
import 'package:kanji_app/screens/resultado_screen.dart';
import 'package:kanji_app/services/progress_service.dart';
import 'package:kanji_app/styles/app_text_styles.dart';
import 'package:kanji_app/widgets/icon_text_button.dart';

import 'config/app_config.dart';
import 'screens/settings_screen.dart';
import 'services/settings_service.dart';
import 'services/validation_service.dart';
import 'widgets/drawing_canvas.dart';
import 'widgets/furigana_text.dart';
import 'widgets/kanji_svg.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Hive.initFlutter();
  await Hive.openBox('progreso');
  await AppConfig.load();

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
  final ProgressService _progress = ProgressService();

  late final ValidationService _validationService;

  String resultado = '';
  String feedback = '';
  String frase = '';
  String kanjiObjetivo = '';
  String kanjiMostrado = '';

  bool mostrarSolucion = false;
  bool mostrarFeedbackGrande = false;
  bool mostrarFurigana = true;
  bool mostrarTraduccion = true;
  bool _isValidating = false;
  bool hayTrazos = false;

  List<dynamic> lecciones = [];
  int indiceActual = 0;
  int indiceKanjiActual = 0;

  Timer? _drawTimer;

  Map<String, Map<String, dynamic>> resultados = {};

  int get aciertosFinales {
    return resultados.values.where((r) => r["correcto"] == true).length;
  }

  String get kanjiVisible {
    return kanjiObjetivo.substring(
      0,
      indiceKanjiActual.clamp(0, kanjiObjetivo.length),
    );
  }

  String get progresoKanji {
    if (lecciones.isEmpty) return '';

    final actual = indiceActual + 1;
    final total = lecciones.length;

    return 'Kanji $actual de $total';
  }

  @override
  void initState() {
    super.initState();

    _validationService = ValidationService();
    _initSettings();
    cargarLeccion();
  }

  @override
  void dispose() {
    _cancelTimer();
    super.dispose();
  }

  Future<void> _initSettings() async {
    await _settings.cargar();

    if (!mounted) return;

    setState(() {
      mostrarFurigana = _settings.mostrarFurigana;
      mostrarTraduccion = _settings.mostrarTraduccion;
    });
  }

  bool _isKanji(String char) {
    final code = char.codeUnitAt(0);
    return code >= 0x4E00 && code <= 0x9FFF;
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

      int splitIndex = before.length;

      while (splitIndex > 0 && _isKanji(before[splitIndex - 1])) {
        splitIndex--;
      }

      final prefix = before.substring(0, splitIndex);
      final kanjiBlock = before.substring(splitIndex);

      if (prefix.isNotEmpty) {
        tokens.add({"text": prefix, "reading": null});
      }

      tokens.add({"text": kanjiBlock, "reading": reading});

      i = close + 1;
    }

    return tokens;
  }

  Map<String, dynamic> _crearResultado(String kanji, bool correcto) {
    final leccion = lecciones[indiceActual];

    return {
      "kanji": kanji,
      "lectura": leccion['lectura'],
      "significado": leccion['significado'],
      "correcto": correcto,
    };
  }

  Future<void> cargarLeccion() async {
    try {
      final ruta = 'assets/data/lecciones_${widget.nivel}.json';
      final jsonString = await rootBundle.loadString(ruta);
      final data = jsonDecode(jsonString);

      data.shuffle();

      lecciones = data.where((l) {
        return l['leccion'] == widget.numeroLeccion;
      }).toList();

      cargarLeccionActual();
    } catch (e) {
      debugPrint("Error cargando JSON: $e");
    }
  }

  void cargarLeccionActual() {
    if (lecciones.isEmpty) return;

    final leccion = lecciones[indiceActual];
    final fraseOriginal = leccion['frase'] ?? '';
    final targetKanji = leccion['target'] ?? '';
    final tokens = parseFurigana(fraseOriginal);

    leccion['tokens'] = tokens;

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
    mostrarSolucion = false;

    Future.delayed(const Duration(milliseconds: 50), () {
      canvasKey.currentState?.clear();
    });

    indiceActual = indiceActual < lecciones.length - 1 ? indiceActual + 1 : 0;

    _cancelTimer();
    cargarLeccionActual();
  }

  void _resetEstado() {
    resultado = '';
    feedback = '';
    mostrarSolucion = false;
    hayTrazos = false;
  }

  void _onUserDraw() {
    if (_isValidating) return;

    setState(() {
      hayTrazos = true;
    });

    _cancelTimer();

    _drawTimer = Timer(const Duration(milliseconds: 1500), () {
      _autoValidar();
    });
  }

  void _cancelTimer() {
    _drawTimer?.cancel();
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

  void _validacionCorrecta(double score) {
    final esUltimoKanji = indiceKanjiActual >= kanjiObjetivo.length - 1;

    String? kanji;

    if (indiceKanjiActual < kanjiObjetivo.length) {
      kanji = kanjiObjetivo[indiceKanjiActual];
    }

    setState(() {
      resultado = "Score: ${score.toStringAsFixed(2)}";
      feedback = "Bien";
      mostrarFeedbackGrande = true;

      if (kanji != null) {
        kanjiMostrado = kanji;

        final existing = resultados[kanji];

        if (existing == null) {
          resultados[kanji] = _crearResultado(kanji, true);
        } else if (existing["correcto"] == true) {
          // Ya era correcto. No cambiamos nada.
        } else {
          // Ya falló antes. Mantenemos incorrecto.
        }

        indiceKanjiActual++;
        mostrarSolucion = false;
        hayTrazos = false;
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
    }

    Future.delayed(const Duration(milliseconds: 600), () {
      if (!mounted) return;

      _limpiarParaSiguienteKanji();
    });
  }

  void _validacionIncorrecta(double score) {
    _cancelTimer();

    setState(() {
      resultado = "Score: ${score.toStringAsFixed(2)}";
      feedback = "Incorrecto";
      mostrarFeedbackGrande = true;
      hayTrazos = true;

      final kanji = obtenerKanjiActual();

      resultados.putIfAbsent(kanji, () => _crearResultado(kanji, false));
    });

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
      mostrarSolucion = false;
      hayTrazos = false;
    });

    canvasKey.currentState?.clear();
  }

  Future<void> _autoValidar() async {
    if (_isValidating) return;

    setState(() => _isValidating = true);

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
      if (mounted) {
        setState(() => _isValidating = false);
      }
    }
  }

  Widget _buildFrase() {
    if (lecciones.isEmpty) return const SizedBox();

    final leccion = lecciones[indiceActual];
    final tokens = leccion['tokens'];

    if (tokens == null || tokens.isEmpty) {
      return Text(
        frase,
        style: AppTextStyles.jpLarge,
        textAlign: TextAlign.center,
      );
    }

    return RichText(
      textAlign: TextAlign.center,
      text: TextSpan(
        style: AppTextStyles.jpLarge.copyWith(fontSize: 36),
        children: (tokens as List)
            .map<InlineSpan>((token) => _buildToken(token))
            .toList(),
      ),
    );
  }

  InlineSpan _buildToken(dynamic token) {
    final rawText = token['text'] as String? ?? '';
    final reading = token['reading'] as String?;
    final masked = _buildMaskedText(rawText);
    final display = reemplazarHuecos(masked, kanjiVisible);
    final contieneHueco = masked.contains("〇");
    final showFurigana = reading != null && (mostrarFurigana || contieneHueco);

    if (showFurigana) {
      return WidgetSpan(
        alignment: PlaceholderAlignment.middle,
        child: FuriganaText(
          text: display,
          reading: reading,
          indiceActivo: contieneHueco
              ? indiceKanjiActual - kanjiVisible.length
              : null,
        ),
      );
    }

    if (contieneHueco) {
      return _buildHuecoSpan(masked);
    }

    return TextSpan(text: display);
  }

  String _buildMaskedText(String rawText) {
    if (kanjiObjetivo.isEmpty) return rawText;

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
            style: AppTextStyles.jpLarge.copyWith(color: Colors.red),
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

  Future<void> _irResultado() async {
    final listaResultados = resultados.values.toList();

    await _progress.guardar(
      nivel: widget.nivel,
      leccion: widget.numeroLeccion,
      resultados: resultados,
    );

    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => ResultadoScreen(
          resultados: listaResultados,
          nivel: widget.nivel,
          numeroLeccion: widget.numeroLeccion,
          aciertos: aciertosFinales,
        ),
      ),
    );
  }

  Future<void> _abrirSettings() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
    );

    if (result == true) {
      await _settings.cargar();

      if (!mounted) return;

      setState(() {
        mostrarFurigana = _settings.mostrarFurigana;
        mostrarTraduccion = _settings.mostrarTraduccion;
      });
    }
  }

  void _toggleFurigana() {
    setState(() {
      mostrarFurigana = !mostrarFurigana;
    });

    _settings.mostrarFurigana = mostrarFurigana;
    _settings.guardar();
  }

  void _toggleTraduccion() {
    setState(() {
      mostrarTraduccion = !mostrarTraduccion;
    });

    _settings.mostrarTraduccion = mostrarTraduccion;
    _settings.guardar();
  }

  void _mostrarSolucionActual() {
    canvasKey.currentState?.clear();

    if (indiceKanjiActual < kanjiObjetivo.length) {
      final kanji = obtenerKanjiActual();

      resultados.putIfAbsent(kanji, () => _crearResultado(kanji, false));
    }

    setState(() {
      mostrarSolucion = true;
      resultado = '';
      feedback = 'Incorrecto';
      hayTrazos = false;
    });
  }

  void _borrarCanvas() {
    canvasKey.currentState?.clear();

    setState(() {
      mostrarSolucion = false;
      resultado = '';
      feedback = '';
      hayTrazos = false;
    });
  }

  double _getContentMaxWidth(double screenWidth) {
    if (screenWidth >= 1200) {
      return 980;
    }

    if (screenWidth >= 900) {
      return 920;
    }

    return screenWidth;
  }

  double _getCanvasHeight(double screenHeight, double screenWidth) {
    if (screenWidth >= 900) {
      return (screenHeight * 0.52).clamp(360.0, 520.0).toDouble();
    }

    if (screenWidth < 560) {
      return (screenHeight * 0.48).clamp(320.0, 480.0).toDouble();
    }

    return (screenHeight * 0.50).clamp(340.0, 500.0).toDouble();
  }

  double _getHorizontalPadding(double screenWidth) {
    if (screenWidth >= 900) {
      return 24;
    }

    return 12;
  }

  Widget _buildTopControls(double contentWidth) {
    final isDesktop = contentWidth >= 900;
    final buttonScale = isDesktop ? 0.92 : 1.0;

    final progressText = Text(
      progresoKanji,
      style: TextStyle(
        fontSize: 14,
        color: Colors.grey.shade600,
        fontWeight: FontWeight.w500,
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );

    final buttons = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconTextButton(
          icon: mostrarFurigana ? Icons.visibility_off : Icons.visibility,
          label: mostrarFurigana ? "Ocultar \nfurigana" : "Mostrar \nfurigana",
          scale: buttonScale,
          onTap: _toggleFurigana,
        ),
        const SizedBox(width: 6),
        IconTextButton(
          icon: mostrarTraduccion ? Icons.translate : Icons.translate_outlined,
          label: mostrarTraduccion
              ? "Ocultar \ntraducción"
              : "Mostrar \ntraducción",
          scale: buttonScale,
          onTap: _toggleTraduccion,
        ),
        const SizedBox(width: 6),
        IconTextButton(
          icon: Icons.visibility,
          label: "Mostrar \nsolución",
          scale: buttonScale,
          onTap: _mostrarSolucionActual,
        ),
      ],
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(child: progressText),
        if (isDesktop)
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: buttons,
          )
        else
          buttons,
      ],
    );
  }

  Widget _buildPhraseSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Column(
        children: [
          _buildFrase(),
          const SizedBox(height: 8),
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
    );
  }

  Widget _buildCanvasStack() {
    return Stack(
      children: [
        DrawingCanvas(key: canvasKey, onDraw: _onUserDraw),

        if (kanjiMostrado.isNotEmpty)
          Positioned(
            top: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.25),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Text(
                kanjiMostrado,
                style: const TextStyle(
                  fontSize: 48,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),

        if (mostrarSolucion)
          IgnorePointer(
            child: Center(
              child: KanjiSvg(
                kanji: obtenerKanjiActual(),
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
                    color: feedback == "Bien" ? Colors.green : Colors.red,
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

        if (hayTrazos)
          Positioned(
            bottom: 16,
            right: 16,
            child: IconTextButton(
              icon: Icons.cleaning_services,
              label: "Borrar",
              scale: 1.0,
              onTap: _borrarCanvas,
            ),
          ),

        if (_isValidating)
          Container(
            color: Colors.black.withValues(alpha: 0.2),
            child: const Center(child: CircularProgressIndicator()),
          ),
      ],
    );
  }

  Widget _buildCanvasArea(double canvasHeight) {
    return SizedBox(
      height: canvasHeight,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
            borderRadius: BorderRadius.circular(18),
          ),
          child: _buildCanvasStack(),
        ),
      ),
    );
  }

  Widget _buildFeedbackFooter() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      child: Column(
        children: [
          Text(
            resultado,
            style: const TextStyle(fontSize: 18),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            feedback,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildMobileBody() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: _buildTopControls(0),
        ),

        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Column(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [Expanded(child: Center(child: _buildFrase()))],
              ),
              const SizedBox(height: 6),
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

        Expanded(child: _buildCanvasStack()),

        Container(
          width: double.infinity,
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
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ],
    );
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
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final screenWidth = constraints.maxWidth;
            final screenHeight = constraints.maxHeight;

            final isDesktop = screenWidth >= 900;

            if (!isDesktop) {
              return _buildMobileBody();
            }

            final contentMaxWidth = _getContentMaxWidth(screenWidth);
            final horizontalPadding = _getHorizontalPadding(screenWidth);
            final canvasHeight = _getCanvasHeight(screenHeight, screenWidth);

            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                8,
                horizontalPadding,
                16,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: contentMaxWidth),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildTopControls(contentMaxWidth),
                      const SizedBox(height: 12),
                      _buildPhraseSection(),
                      const SizedBox(height: 12),
                      _buildCanvasArea(canvasHeight),
                      const SizedBox(height: 8),
                      _buildFeedbackFooter(),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
