import 'dart:convert';
import 'package:http/http.dart' as http;

class ValidationResult {
  final double score;
  final bool isCorrect;

  ValidationResult({required this.score, required this.isCorrect});
}

class ValidationService {
  final String baseUrl;

  ValidationService({required this.baseUrl});

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

      if (score == null) return null;

      return ValidationResult(score: score, isCorrect: score <= 1.5);
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
