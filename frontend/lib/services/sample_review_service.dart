import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kanji_app/config/app_config.dart';
import 'package:kanji_app/models/review_sample.dart';

const reviewStatuses = <String>[
  'pending',
  'approved',
  'excluded',
  'needs_review',
  'all',
];

const reviewLabels = <String>['all', 'correct', 'incorrect'];

class SampleReviewException implements Exception {
  final String code;
  final String message;
  final int? statusCode;
  final dynamic details;

  const SampleReviewException({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
  });

  @override
  String toString() {
    return 'SampleReviewException('
        'code: $code, '
        'statusCode: $statusCode, '
        'message: $message'
        ')';
  }
}

class ReviewSamplePage {
  final String kanji;
  final String status;
  final String label;
  final String source;
  final String feedbackType;
  final int page;
  final int pageSize;
  final int total;
  final int totalPages;
  final bool hasPreviousPage;
  final bool hasNextPage;
  final List<ReviewSample> items;

  const ReviewSamplePage({
    required this.kanji,
    required this.status,
    required this.label,
    required this.source,
    required this.feedbackType,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.totalPages,
    required this.hasPreviousPage,
    required this.hasNextPage,
    required this.items,
  });

  bool get isEmpty {
    return items.isEmpty;
  }

  bool get isNotEmpty {
    return items.isNotEmpty;
  }

  int get correctCountInPage {
    return items.where((sample) => sample.isCorrect).length;
  }

  int get incorrectCountInPage {
    return items.where((sample) => !sample.isCorrect).length;
  }

  factory ReviewSamplePage.fromJson(Map<String, dynamic> json) {
    if (json['ok'] != true) {
      throw const FormatException('The review response is not successful.');
    }

    final filters = json['filters'];

    if (filters is! Map) {
      throw const FormatException('The review response has no filters.');
    }

    final itemsValue = json['items'];

    if (itemsValue is! List) {
      throw const FormatException('The review response items must be a list.');
    }

    final items = <ReviewSample>[];

    for (final item in itemsValue) {
      if (item is! Map) {
        throw const FormatException('A review response item is invalid.');
      }

      items.add(ReviewSample.fromJson(Map<String, dynamic>.from(item)));
    }

    return ReviewSamplePage(
      kanji: _requiredString(filters['kanji'], 'filters.kanji'),
      status: _requiredString(filters['status'], 'filters.status'),
      label: _requiredString(filters['label'], 'filters.label'),
      source: _requiredString(filters['source'], 'filters.source'),
      feedbackType: _requiredString(
        filters['feedbackType'],
        'filters.feedbackType',
      ),
      page: _requiredNonNegativeInteger(json['page'], 'page'),
      pageSize: _requiredNonNegativeInteger(json['pageSize'], 'pageSize'),
      total: _requiredNonNegativeInteger(json['total'], 'total'),
      totalPages: _requiredNonNegativeInteger(json['totalPages'], 'totalPages'),
      hasPreviousPage: _requiredBoolean(
        json['hasPreviousPage'],
        'hasPreviousPage',
      ),
      hasNextPage: _requiredBoolean(json['hasNextPage'], 'hasNextPage'),
      items: List<ReviewSample>.unmodifiable(items),
    );
  }

  static String _requiredString(dynamic value, String fieldName) {
    if (value is! String || value.trim().isEmpty) {
      throw FormatException('$fieldName must be a non-empty string.');
    }

    return value.trim();
  }

  static int _requiredNonNegativeInteger(dynamic value, String fieldName) {
    if (value is int && value >= 0) {
      return value;
    }

    if (value is num &&
        value.isFinite &&
        value >= 0 &&
        value == value.roundToDouble()) {
      return value.toInt();
    }

    throw FormatException('$fieldName must be a non-negative integer.');
  }

  static bool _requiredBoolean(dynamic value, String fieldName) {
    if (value is! bool) {
      throw FormatException('$fieldName must be a boolean.');
    }

    return value;
  }
}

class SampleReviewService {
  final String baseUrl;
  final http.Client _client;
  final bool _ownsClient;

  SampleReviewService({String? baseUrl, http.Client? client})
    : baseUrl = _normalizeBaseUrl(baseUrl ?? AppConfig.baseUrl),
      _client = client ?? http.Client(),
      _ownsClient = client == null;

  Future<ReviewSamplePage> getSamples({
    required String reviewKey,
    required String kanji,
    String status = 'pending',
    String label = 'all',
    int page = 1,
    int pageSize = 20,
  }) async {
    final normalizedReviewKey = reviewKey.trim();
    final normalizedKanji = kanji.trim();
    final normalizedStatus = status.trim().toLowerCase();
    final normalizedLabel = label.trim().toLowerCase();

    if (normalizedReviewKey.isEmpty) {
      throw const SampleReviewException(
        code: 'review_key_required',
        message: 'La clave de revisión es obligatoria.',
      );
    }

    if (normalizedKanji.isEmpty) {
      throw const SampleReviewException(
        code: 'kanji_required',
        message: 'El kanji es obligatorio.',
      );
    }

    if (!reviewStatuses.contains(normalizedStatus)) {
      throw SampleReviewException(
        code: 'invalid_status',
        message: 'Estado de revisión no válido: $status.',
      );
    }

    if (!reviewLabels.contains(normalizedLabel)) {
      throw SampleReviewException(
        code: 'invalid_label',
        message: 'Filtro de etiqueta no válido: $label.',
      );
    }

    if (page < 1) {
      throw const SampleReviewException(
        code: 'invalid_page',
        message: 'La página debe ser mayor o igual que 1.',
      );
    }

    if (pageSize < 1 || pageSize > 100) {
      throw const SampleReviewException(
        code: 'invalid_page_size',
        message: 'El tamaño de página debe estar entre 1 y 100.',
      );
    }

    final uri = Uri.parse('$baseUrl/api/review/samples').replace(
      queryParameters: {
        'kanji': normalizedKanji,
        'status': normalizedStatus,
        'label': normalizedLabel,
        'page': page.toString(),
        'pageSize': pageSize.toString(),
      },
    );

    late final http.Response response;

    try {
      response = await _client.get(
        uri,
        headers: {
          'Accept': 'application/json',
          'X-Review-Key': normalizedReviewKey,
        },
      );
    } catch (_) {
      throw const SampleReviewException(
        code: 'network_error',
        message: 'No se pudo conectar con el servicio de revisión.',
      );
    }

    final responseJson = _decodeResponseBody(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw SampleReviewException(
        code: _optionalString(responseJson['error']) ?? 'review_request_failed',
        message:
            _optionalString(responseJson['message']) ??
            'No se pudieron recuperar las muestras.',
        statusCode: response.statusCode,
        details: responseJson['details'],
      );
    }

    try {
      return ReviewSamplePage.fromJson(responseJson);
    } on FormatException catch (error) {
      throw SampleReviewException(
        code: 'invalid_response',
        message: 'La respuesta del servicio de revisión no es válida.',
        statusCode: response.statusCode,
        details: error.message,
      );
    }
  }

  void dispose() {
    if (_ownsClient) {
      _client.close();
    }
  }

  static Map<String, dynamic> _decodeResponseBody(http.Response response) {
    if (response.body.trim().isEmpty) {
      throw SampleReviewException(
        code: 'empty_response',
        message: 'El servicio de revisión devolvió una respuesta vacía.',
        statusCode: response.statusCode,
      );
    }

    try {
      final value = jsonDecode(response.body);

      if (value is! Map) {
        throw const FormatException('The response body must be a JSON object.');
      }

      return Map<String, dynamic>.from(value);
    } catch (error) {
      if (error is SampleReviewException) {
        rethrow;
      }

      throw SampleReviewException(
        code: 'invalid_json',
        message: 'El servicio de revisión devolvió un JSON no válido.',
        statusCode: response.statusCode,
      );
    }
  }

  static String? _optionalString(dynamic value) {
    if (value is! String || value.trim().isEmpty) {
      return null;
    }

    return value.trim();
  }

  static String _normalizeBaseUrl(String value) {
    final normalized = value.trim();

    if (normalized.isEmpty) {
      throw ArgumentError.value(
        value,
        'baseUrl',
        'La URL base no puede estar vacía.',
      );
    }

    return normalized.endsWith('/')
        ? normalized.substring(0, normalized.length - 1)
        : normalized;
  }
}
