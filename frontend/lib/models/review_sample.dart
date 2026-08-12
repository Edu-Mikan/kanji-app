class ReviewStroke {
  final List<double> x;
  final List<double> y;

  const ReviewStroke({required this.x, required this.y});

  int get pointCount {
    return x.length < y.length ? x.length : y.length;
  }

  bool get isValid {
    if (pointCount < 2) {
      return false;
    }

    return x.every((value) => value.isFinite) &&
        y.every((value) => value.isFinite);
  }

  factory ReviewStroke.fromJson(Map<String, dynamic> json) {
    final xValues = _parseCoordinateList(json['x']);

    final yValues = _parseCoordinateList(json['y']);

    final pointCount = xValues.length < yValues.length
        ? xValues.length
        : yValues.length;

    return ReviewStroke(
      x: xValues.take(pointCount).toList(growable: false),
      y: yValues.take(pointCount).toList(growable: false),
    );
  }

  Map<String, dynamic> toJson() {
    return {'x': x, 'y': y};
  }

  static List<double> _parseCoordinateList(dynamic value) {
    if (value is! List) {
      return const [];
    }

    final coordinates = <double>[];

    for (final item in value) {
      if (item is! num) {
        continue;
      }

      final coordinate = item.toDouble();

      if (!coordinate.isFinite) {
        continue;
      }

      coordinates.add(coordinate);
    }

    return List<double>.unmodifiable(coordinates);
  }
}

class ReviewSample {
  final String? id;
  final String recognitionId;
  final String kanji;
  final String expectedKanji;
  final bool isCorrect;
  final String datasetReviewStatus;
  final DateTime? datasetReviewedAt;
  final String? exclusionReason;
  final int strokeCount;
  final List<ReviewStroke> strokesNormalized;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? source;
  final String? feedbackType;
  final String? algorithmVersion;
  final int? schemaVersion;

  const ReviewSample({
    required this.id,
    required this.recognitionId,
    required this.kanji,
    required this.expectedKanji,
    required this.isCorrect,
    required this.datasetReviewStatus,
    required this.datasetReviewedAt,
    required this.exclusionReason,
    required this.strokeCount,
    required this.strokesNormalized,
    required this.createdAt,
    required this.updatedAt,
    required this.source,
    required this.feedbackType,
    required this.algorithmVersion,
    required this.schemaVersion,
  });

  bool get isPending {
    return datasetReviewStatus == 'pending';
  }

  bool get isApproved {
    return datasetReviewStatus == 'approved';
  }

  bool get isExcluded {
    return datasetReviewStatus == 'excluded';
  }

  bool get needsReview {
    return datasetReviewStatus == 'needs_review';
  }

  bool get hasPreview {
    return strokesNormalized.isNotEmpty &&
        strokesNormalized.every((stroke) => stroke.isValid);
  }

  bool get strokeCountIsConsistent {
    return strokeCount == strokesNormalized.length;
  }

  factory ReviewSample.fromJson(Map<String, dynamic> json) {
    final strokes = _parseStrokes(json['strokesNormalized']);

    final status = _parseReviewStatus(json['datasetReviewStatus']);

    final expectedKanji = _parseRequiredString(
      json['expectedKanji'] ?? json['kanji'],
      fieldName: 'expectedKanji',
    );

    final kanji = _parseOptionalString(json['kanji']) ?? expectedKanji;

    return ReviewSample(
      id: _parseOptionalString(json['id']),
      recognitionId: _parseRequiredString(
        json['recognitionId'],
        fieldName: 'recognitionId',
      ),
      kanji: kanji,
      expectedKanji: expectedKanji,
      isCorrect: _parseRequiredBoolean(
        json['isCorrect'],
        fieldName: 'isCorrect',
      ),
      datasetReviewStatus: status,
      datasetReviewedAt: _parseDateTime(json['datasetReviewedAt']),
      exclusionReason: _parseOptionalString(json['exclusionReason']),
      strokeCount: _parseNonNegativeInteger(
        json['strokeCount'],
        fallback: strokes.length,
      ),
      strokesNormalized: strokes,
      createdAt: _parseDateTime(json['createdAt']),
      updatedAt: _parseDateTime(json['updatedAt']),
      source: _parseOptionalString(json['source']),
      feedbackType: _parseOptionalString(json['feedbackType']),
      algorithmVersion: _parseOptionalString(json['algorithmVersion']),
      schemaVersion: _parseNullableInteger(json['schemaVersion']),
    );
  }

  static List<ReviewStroke> _parseStrokes(dynamic value) {
    if (value is! List) {
      return const [];
    }

    final strokes = <ReviewStroke>[];

    for (final item in value) {
      if (item is! Map) {
        continue;
      }

      final stroke = ReviewStroke.fromJson(Map<String, dynamic>.from(item));

      if (stroke.isValid) {
        strokes.add(stroke);
      }
    }

    return List<ReviewStroke>.unmodifiable(strokes);
  }

  static String _parseReviewStatus(dynamic value) {
    final status = _parseOptionalString(value);

    switch (status) {
      case 'approved':
      case 'excluded':
      case 'needs_review':
      case 'pending':
        return status!;
      default:
        return 'pending';
    }
  }

  static String _parseRequiredString(
    dynamic value, {
    required String fieldName,
  }) {
    final parsed = _parseOptionalString(value);

    if (parsed == null) {
      throw FormatException('$fieldName must be a non-empty string.');
    }

    return parsed;
  }

  static String? _parseOptionalString(dynamic value) {
    if (value is! String) {
      return null;
    }

    final normalized = value.trim();

    if (normalized.isEmpty) {
      return null;
    }

    return normalized;
  }

  static bool _parseRequiredBoolean(
    dynamic value, {
    required String fieldName,
  }) {
    if (value is! bool) {
      throw FormatException('$fieldName must be a boolean.');
    }

    return value;
  }

  static int _parseNonNegativeInteger(dynamic value, {required int fallback}) {
    final parsed = _parseNullableInteger(value);

    if (parsed == null || parsed < 0) {
      return fallback;
    }

    return parsed;
  }

  static int? _parseNullableInteger(dynamic value) {
    if (value is int) {
      return value;
    }

    if (value is num && value.isFinite && value == value.roundToDouble()) {
      return value.toInt();
    }

    return null;
  }

  static DateTime? _parseDateTime(dynamic value) {
    if (value is! String || value.trim().isEmpty) {
      return null;
    }

    return DateTime.tryParse(value.trim());
  }
}
