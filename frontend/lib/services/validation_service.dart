import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:kanji_app/config/app_config.dart';

class ValidationResult {
  final double score;
  final bool isCorrect;
  final Map<String, dynamic> features;

  final String? validationStrategy;
  final bool? validationResult;
  final Map<String, dynamic>? simpleValidation;

  ValidationResult({
    required this.score,
    required this.isCorrect,
    required this.features,
    this.validationStrategy,
    this.validationResult,
    this.simpleValidation,
  });
}

class ValidationService {
  final String baseUrl;

  ValidationService({String? baseUrl}) : baseUrl = baseUrl ?? AppConfig.baseUrl;

  Future<void> sendFeedback({
    required String kanji,
    required double score,
    required bool isCorrect,
    Map<String, dynamic>? features,
    List<Map<String, dynamic>>? strokes,
    String source = "unknown",
    String? validationStrategy,
    bool? validationResult,
    Map<String, dynamic>? simpleValidation,
  }) async {
    try {
      await http.post(
        Uri.parse('$baseUrl/feedback'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "kanji": kanji,
          "score": score,
          "isCorrect": isCorrect,
          "features": features,
          "strokes": strokes,
          "source": source,
          "validationStrategy": validationStrategy,
          "validationResult": validationResult,
          "simpleValidation": simpleValidation,
        }),
      );
    } catch (e) {
      // no bloqueamos la app si falla
    }
  }

  double _getThresholdFromStrokes(int strokes) {
    if (strokes <= 3) return 0.7;
    if (strokes <= 6) return 0.9;
    if (strokes <= 10) return 1.2;
    return 1.0;
  }

  Future<ValidationResult?> validarKanji({
    required String kanji,
    required List<Map<String, dynamic>> strokes,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/recognize'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "kanji": kanji,
          "ink": {"strokes": strokes},
        }),
      );

      if (response.statusCode != 200) {
        throw Exception('Error HTTP: ${response.statusCode}');
      }

      final data = jsonDecode(response.body);

      final score = data['score']?.toDouble();
      final features = data['features'];
      final strokesCount = data['strokes'];

      if (score == null || features == null) return null;

      final validationStrategy = data['validationStrategy'] as String?;
      final validationResult = data['validationResult'] as bool?;
      final simpleValidationRaw = data['simpleValidation'];

      final threshold = _getThresholdFromStrokes(strokesCount);

      // Si backend trae una validación simple, usamos esa.
      // Si no, seguimos usando score <= threshold.
      final bool finalIsCorrect = validationResult ?? (score <= threshold);

      return ValidationResult(
        score: score,
        isCorrect: finalIsCorrect,
        features: Map<String, dynamic>.from(features),
        validationStrategy: validationStrategy,
        validationResult: validationResult,
        simpleValidation: simpleValidationRaw == null
            ? null
            : Map<String, dynamic>.from(simpleValidationRaw),
      );
    } catch (e) {
      return null;
    }
  }

  Future<void> ping() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/ping'));

      if (response.statusCode != 200) {
        throw Exception('Ping failed');
      }
    } catch (e) {
      // ignoramos errores voluntariamente
    }
  }
}
