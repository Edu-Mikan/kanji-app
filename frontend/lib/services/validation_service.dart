import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:kanji_app/config/app_config.dart';

class ValidationResult {
  final double score;
  final bool isCorrect;
  final Map<String, dynamic> features; // ✅ NUEVO

  ValidationResult({
    required this.score,
    required this.isCorrect,
    required this.features,
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
  }) async {
    try {
      await http.post(
        Uri.parse('$baseUrl/feedback'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "kanji": kanji,
          "score": score,
          "isCorrect": isCorrect,
          "features": features, // ✅ CLAVE
        }),
      );
    } catch (e) {}
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
      final strokesCount = data['strokes'];
      final features = data['features'];

      if (score == null) return null;

      //return ValidationResult(score: score, isCorrect: score <= 1.5);

      final threshold = _getThresholdFromStrokes(strokesCount);

      return ValidationResult(
        score: score,
        isCorrect: score <= threshold,
        features: Map<String, dynamic>.from(features),
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
