import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kanji_app/services/sample_review_service.dart';

void main() {
  Map<String, dynamic> createSuccessfulResponse() {
    return {
      'ok': true,
      'filters': {
        'kanji': '力',
        'status': 'pending',
        'label': 'all',
        'source': 'test_screen',
        'feedbackType': 'manual_debug',
      },
      'page': 1,
      'pageSize': 20,
      'total': 43,
      'totalPages': 3,
      'hasPreviousPage': false,
      'hasNextPage': true,
      'items': [
        {
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
        },
      ],
    };
  }

  test('getSamples sends the protected paginated request', () async {
    late Uri requestedUri;
    late Map<String, String> requestedHeaders;

    final client = MockClient((request) async {
      requestedUri = request.url;
      requestedHeaders = request.headers;

      return http.Response(
        jsonEncode(createSuccessfulResponse()),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test/',
      client: client,
    );

    final result = await service.getSamples(
      reviewKey: 'review-secret',
      kanji: '力',
      status: 'pending',
      label: 'all',
      page: 1,
      pageSize: 20,
    );

    expect(requestedUri.path, '/api/review/samples');

    expect(requestedUri.queryParameters, {
      'kanji': '力',
      'status': 'pending',
      'label': 'all',
      'page': '1',
      'pageSize': '20',
    });

    expect(requestedHeaders['x-review-key'], 'review-secret');

    expect(result.total, 43);

    expect(result.items.length, 1);

    expect(result.items.single.expectedKanji, '力');

    expect(result.items.single.hasPreview, isTrue);

    service.dispose();
  });

  test('ReviewSamplePage exposes page label counts', () {
    final json = createSuccessfulResponse();

    json['items'] = [
      ...(json['items'] as List),
      {
        ...(json['items'] as List).first as Map<String, dynamic>,
        'recognitionId': 'correct-sample',
        'isCorrect': true,
      },
    ];

    final page = ReviewSamplePage.fromJson(json);

    expect(page.correctCountInPage, 1);

    expect(page.incorrectCountInPage, 1);

    expect(page.isNotEmpty, isTrue);
  });

  test('getSamples rejects an empty review key before HTTP', () async {
    var requestCount = 0;

    final client = MockClient((request) async {
      requestCount++;

      return http.Response('{}', 200);
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: client,
    );

    await expectLater(
      service.getSamples(reviewKey: '   ', kanji: '力'),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'review_key_required',
        ),
      ),
    );

    expect(requestCount, 0);

    service.dispose();
  });

  test('getSamples rejects an empty kanji before HTTP', () async {
    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
    );

    await expectLater(
      service.getSamples(reviewKey: 'review-secret', kanji: ' '),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'kanji_required',
        ),
      ),
    );

    service.dispose();
  });

  test('getSamples rejects an invalid status', () async {
    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
    );

    await expectLater(
      service.getSamples(
        reviewKey: 'review-secret',
        kanji: '力',
        status: 'deleted',
      ),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'invalid_status',
        ),
      ),
    );

    service.dispose();
  });

  test('getSamples rejects a page size greater than 100', () async {
    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
    );

    await expectLater(
      service.getSamples(reviewKey: 'review-secret', kanji: '力', pageSize: 101),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'invalid_page_size',
        ),
      ),
    );

    service.dispose();
  });

  test('getSamples maps an invalid review key response', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'ok': false,
          'error': 'review_admin_key_invalid',
          'message': 'The review administration key is invalid.',
        }),
        403,
      );
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: client,
    );

    await expectLater(
      service.getSamples(reviewKey: 'incorrect-secret', kanji: '力'),
      throwsA(
        isA<SampleReviewException>()
            .having((error) => error.code, 'code', 'review_admin_key_invalid')
            .having((error) => error.statusCode, 'statusCode', 403),
      ),
    );

    service.dispose();
  });

  test('getSamples maps a network failure', () async {
    final client = MockClient((request) async {
      throw Exception('Network unavailable');
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: client,
    );

    await expectLater(
      service.getSamples(reviewKey: 'review-secret', kanji: '力'),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'network_error',
        ),
      ),
    );

    service.dispose();
  });

  test('getSamples rejects an empty response', () async {
    final client = MockClient((request) async {
      return http.Response('', 200);
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: client,
    );

    await expectLater(
      service.getSamples(reviewKey: 'review-secret', kanji: '力'),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'empty_response',
        ),
      ),
    );

    service.dispose();
  });

  test('getSamples rejects malformed JSON', () async {
    final client = MockClient((request) async {
      return http.Response('not-json', 200);
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: client,
    );

    await expectLater(
      service.getSamples(reviewKey: 'review-secret', kanji: '力'),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'invalid_json',
        ),
      ),
    );

    service.dispose();
  });

  test('getSamples rejects an invalid successful response', () async {
    final client = MockClient((request) async {
      return http.Response(jsonEncode({'ok': true, 'items': 'invalid'}), 200);
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: client,
    );

    await expectLater(
      service.getSamples(reviewKey: 'review-secret', kanji: '力'),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'invalid_response',
        ),
      ),
    );

    service.dispose();
  });
}
