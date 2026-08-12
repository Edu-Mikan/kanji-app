import 'package:flutter_test/flutter_test.dart';
import 'package:kanji_app/models/review_sample.dart';

void main() {
  Map<String, dynamic> createValidJson() {
    return {
      'id': 'mongo-id-1',
      'recognitionId': '8b525f65-2d92-4927-8b51-d9520ab01d3f',
      'kanji': '力',
      'expectedKanji': '力',
      'isCorrect': false,
      'datasetReviewStatus': 'pending',
      'datasetReviewedAt': null,
      'exclusionReason': null,
      'strokeCount': 2,
      'strokesNormalized': [
        {
          'x': [0, 0.5, 1],
          'y': [0, 0.5, 1],
        },
        {
          'x': [1, 0],
          'y': [0, 1],
        },
      ],
      'createdAt': '2026-08-03T20:44:28.401Z',
      'updatedAt': null,
      'source': 'test_screen',
      'feedbackType': 'manual_debug',
      'algorithmVersion': 'heuristic-v2',
      'schemaVersion': 1,
    };
  }

  test('ReviewStroke parses numeric coordinates', () {
    final stroke = ReviewStroke.fromJson({
      'x': [0, 0.5, 1],
      'y': [0, 0.25, 1],
    });

    expect(stroke.x, [0.0, 0.5, 1.0]);

    expect(stroke.y, [0.0, 0.25, 1.0]);

    expect(stroke.pointCount, 3);

    expect(stroke.isValid, isTrue);
  });

  test('ReviewStroke trims coordinates to equal length', () {
    final stroke = ReviewStroke.fromJson({
      'x': [0, 0.5, 1],
      'y': [0, 1],
    });

    expect(stroke.x, [0.0, 0.5]);

    expect(stroke.y, [0.0, 1.0]);

    expect(stroke.pointCount, 2);
  });

  test('ReviewStroke rejects a stroke with fewer than two points', () {
    final stroke = ReviewStroke.fromJson({
      'x': [0],
      'y': [0],
    });

    expect(stroke.isValid, isFalse);
  });

  test('ReviewSample parses a valid API item', () {
    final sample = ReviewSample.fromJson(createValidJson());

    expect(sample.id, 'mongo-id-1');

    expect(sample.recognitionId, '8b525f65-2d92-4927-8b51-d9520ab01d3f');

    expect(sample.expectedKanji, '力');

    expect(sample.isCorrect, isFalse);

    expect(sample.datasetReviewStatus, 'pending');

    expect(sample.isPending, isTrue);

    expect(sample.strokeCount, 2);

    expect(sample.strokesNormalized.length, 2);

    expect(sample.hasPreview, isTrue);

    expect(sample.strokeCountIsConsistent, isTrue);

    expect(sample.source, 'test_screen');

    expect(sample.feedbackType, 'manual_debug');

    expect(sample.createdAt, DateTime.parse('2026-08-03T20:44:28.401Z'));
  });

  test('ReviewSample defaults missing review status to pending', () {
    final json = createValidJson();

    json.remove('datasetReviewStatus');

    final sample = ReviewSample.fromJson(json);

    expect(sample.datasetReviewStatus, 'pending');

    expect(sample.isPending, isTrue);
  });

  test('ReviewSample defaults unknown review status to pending', () {
    final json = createValidJson();

    json['datasetReviewStatus'] = 'unexpected_status';

    final sample = ReviewSample.fromJson(json);

    expect(sample.datasetReviewStatus, 'pending');
  });

  test('ReviewSample accepts an incorrect sample with three strokes', () {
    final json = createValidJson();

    json['strokeCount'] = 3;

    json['strokesNormalized'] = [
      ...(json['strokesNormalized'] as List),
      {
        'x': [0.25, 0.75],
        'y': [0.25, 0.75],
      },
    ];

    final sample = ReviewSample.fromJson(json);

    expect(sample.isCorrect, isFalse);

    expect(sample.strokeCount, 3);

    expect(sample.strokesNormalized.length, 3);

    expect(sample.strokeCountIsConsistent, isTrue);
  });

  test('ReviewSample removes invalid strokes from the preview', () {
    final json = createValidJson();

    json['strokesNormalized'] = [
      {
        'x': [0, 1],
        'y': [0, 1],
      },
      {
        'x': [0],
        'y': [0],
      },
      null,
    ];

    json['strokeCount'] = 1;

    final sample = ReviewSample.fromJson(json);

    expect(sample.strokesNormalized.length, 1);

    expect(sample.hasPreview, isTrue);

    expect(sample.strokeCountIsConsistent, isTrue);
  });

  test('ReviewSample falls back to parsed stroke count', () {
    final json = createValidJson();

    json['strokeCount'] = -1;

    final sample = ReviewSample.fromJson(json);

    expect(sample.strokeCount, 2);
  });

  test('ReviewSample falls back from kanji to expectedKanji', () {
    final json = createValidJson();

    json.remove('expectedKanji');

    final sample = ReviewSample.fromJson(json);

    expect(sample.expectedKanji, '力');
  });

  test('ReviewSample rejects a missing recognitionId', () {
    final json = createValidJson();

    json.remove('recognitionId');

    expect(() => ReviewSample.fromJson(json), throwsA(isA<FormatException>()));
  });

  test('ReviewSample rejects a non-boolean label', () {
    final json = createValidJson();

    json['isCorrect'] = 'false';

    expect(() => ReviewSample.fromJson(json), throwsA(isA<FormatException>()));
  });
}
