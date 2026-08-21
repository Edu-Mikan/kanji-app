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

  Map<String, dynamic> createSuccessfulLabelUpdateResponse({
    bool changed = true,
    bool isCorrect = true,
  }) {
    final sample = Map<String, dynamic>.from(
      (createSuccessfulResponse()['items'] as List).first
          as Map<String, dynamic>,
    );

    sample['isCorrect'] = isCorrect;
    sample['updatedAt'] = '2026-08-21T10:00:00.000Z';

    return {'ok': true, 'changed': changed, 'sample': sample};
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
      deviceToken: 'krd_tokenid_tokensecret',
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

    expect(requestedHeaders['authorization'], 'Bearer krd_tokenid_tokensecret');

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

  test('getSamples rejects an empty device token before HTTP', () async {
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
      service.getSamples(deviceToken: '   ', kanji: '力'),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'device_token_required',
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
      service.getSamples(deviceToken: 'krd_tokenid_tokensecret', kanji: ' '),
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
        deviceToken: 'krd_tokenid_tokensecret',
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

  test('getSamples maps an invalid device token response', () async {
    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
    );

    await expectLater(
      service.getSamples(
        deviceToken: 'krd_tokenid_tokensecret',
        kanji: '力',
        pageSize: 101,
      ),
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

  test('getSamples maps an invalid device token response', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'ok': false,
          'error': 'review_device_token_invalid',
          'message': 'The review device token is invalid.',
        }),
        403,
      );
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: client,
    );

    await expectLater(
      service.getSamples(deviceToken: 'krd_tokenid_wrongsecret', kanji: '力'),
      throwsA(
        isA<SampleReviewException>()
            .having(
              (error) => error.code,
              'code',
              'review_device_token_invalid',
            )
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
      service.getSamples(deviceToken: 'krd_tokenid_tokensecret', kanji: '力'),
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
      service.getSamples(deviceToken: 'krd_tokenid_tokensecret', kanji: '力'),
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
      service.getSamples(deviceToken: 'krd_tokenid_tokensecret', kanji: '力'),
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
      service.getSamples(deviceToken: 'krd_tokenid_tokensecret', kanji: '力'),
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

  test('updateSampleLabel sends the protected PATCH request', () async {
    late http.Request capturedRequest;

    final client = MockClient((request) async {
      capturedRequest = request;

      return http.Response(
        jsonEncode(
          createSuccessfulLabelUpdateResponse(changed: true, isCorrect: true),
        ),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test/',
      client: client,
    );

    final result = await service.updateSampleLabel(
      deviceToken: 'krd_tokenid_tokensecret',
      recognitionId: '8b525f65-2d92-4927-8b51-d9520ab01d3f',
      isCorrect: true,
    );

    expect(capturedRequest.method, 'PATCH');

    expect(
      capturedRequest.url.path,
      '/api/review/samples/'
      '8b525f65-2d92-4927-8b51-d9520ab01d3f/label',
    );

    expect(
      capturedRequest.headers['authorization'],
      'Bearer krd_tokenid_tokensecret',
    );

    expect(capturedRequest.headers['content-type'], 'application/json');

    expect(jsonDecode(capturedRequest.body), {'isCorrect': true});

    expect(result.changed, isTrue);

    expect(result.sample.isCorrect, isTrue);

    expect(result.sample.recognitionId, '8b525f65-2d92-4927-8b51-d9520ab01d3f');

    expect(result.sample.updatedAt, DateTime.parse('2026-08-21T10:00:00.000Z'));

    service.dispose();
  });

  test('updateSampleLabel parses an unchanged response', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode(
          createSuccessfulLabelUpdateResponse(changed: false, isCorrect: false),
        ),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: client,
    );

    final result = await service.updateSampleLabel(
      deviceToken: 'krd_tokenid_tokensecret',
      recognitionId: 'sample-id',
      isCorrect: false,
    );

    expect(result.changed, isFalse);

    expect(result.sample.isCorrect, isFalse);

    service.dispose();
  });

  test('updateSampleLabel rejects an empty device token before HTTP', () async {
    var requestCount = 0;

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        requestCount++;

        return http.Response('{}', 200);
      }),
    );

    await expectLater(
      service.updateSampleLabel(
        deviceToken: '   ',
        recognitionId: 'sample-id',
        isCorrect: true,
      ),
      throwsA(
        isA<SampleReviewException>().having(
          (error) => error.code,
          'code',
          'device_token_required',
        ),
      ),
    );

    expect(requestCount, 0);

    service.dispose();
  });

  test(
    'updateSampleLabel rejects an empty recognitionId before HTTP',
    () async {
      var requestCount = 0;

      final service = SampleReviewService(
        baseUrl: 'https://example.test',
        client: MockClient((request) async {
          requestCount++;

          return http.Response('{}', 200);
        }),
      );

      await expectLater(
        service.updateSampleLabel(
          deviceToken: 'krd_tokenid_tokensecret',
          recognitionId: '   ',
          isCorrect: true,
        ),
        throwsA(
          isA<SampleReviewException>().having(
            (error) => error.code,
            'code',
            'recognition_id_required',
          ),
        ),
      );

      expect(requestCount, 0);

      service.dispose();
    },
  );

  test('updateSampleLabel maps a permission denied response', () async {
    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        return http.Response(
          jsonEncode({
            'ok': false,
            'error': 'review_device_permission_denied',
            'message':
                'The review device token does not have '
                'the required permission.',
          }),
          403,
        );
      }),
    );

    await expectLater(
      service.updateSampleLabel(
        deviceToken: 'krd_old_token_secret',
        recognitionId: 'sample-id',
        isCorrect: true,
      ),
      throwsA(
        isA<SampleReviewException>()
            .having(
              (error) => error.code,
              'code',
              'review_device_permission_denied',
            )
            .having((error) => error.statusCode, 'statusCode', 403),
      ),
    );

    service.dispose();
  });

  test('updateSampleLabel maps a missing sample response', () async {
    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        return http.Response(
          jsonEncode({
            'ok': false,
            'error': 'review_sample_not_found',
            'message': 'The review sample was not found.',
          }),
          404,
        );
      }),
    );

    await expectLater(
      service.updateSampleLabel(
        deviceToken: 'krd_tokenid_tokensecret',
        recognitionId: 'missing-id',
        isCorrect: false,
      ),
      throwsA(
        isA<SampleReviewException>()
            .having((error) => error.code, 'code', 'review_sample_not_found')
            .having((error) => error.statusCode, 'statusCode', 404),
      ),
    );

    service.dispose();
  });

  test('updateSampleLabel rejects an invalid successful response', () async {
    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        return http.Response(jsonEncode({'ok': true, 'changed': true}), 200);
      }),
    );

    await expectLater(
      service.updateSampleLabel(
        deviceToken: 'krd_tokenid_tokensecret',
        recognitionId: 'sample-id',
        isCorrect: true,
      ),
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
