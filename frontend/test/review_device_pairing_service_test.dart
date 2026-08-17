import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kanji_app/services/review_device_pairing_service.dart';

class InMemoryReviewDeviceTokenStore implements ReviewDeviceTokenStore {
  String? token;

  @override
  Future<String?> readDeviceToken() async {
    return token;
  }

  @override
  Future<void> saveDeviceToken(String token) async {
    this.token = token;
  }

  @override
  Future<void> deleteDeviceToken() async {
    token = null;
  }

  @override
  Future<bool> hasDeviceToken() async {
    return token != null && token!.trim().isNotEmpty;
  }
}

void main() {
  Map<String, dynamic> createPairingResponse() {
    return {
      'ok': true,
      'deviceId': 'device-1',
      'tokenId': 'abc123',
      'deviceToken': 'krd_abc123_secret456',
      'permissions': ['review:read', 'samples:create'],
      'expiresAt': null,
    };
  }

  test(
    'pairDevice sends the review key and stores the returned token',
    () async {
      late Uri requestedUri;
      late Map<String, String> requestedHeaders;
      late Map<String, dynamic> requestedBody;

      final tokenStore = InMemoryReviewDeviceTokenStore();

      final client = MockClient((request) async {
        requestedUri = request.url;
        requestedHeaders = request.headers;
        requestedBody = jsonDecode(request.body) as Map<String, dynamic>;

        return http.Response(
          jsonEncode(createPairingResponse()),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final service = ReviewDevicePairingService(
        baseUrl: 'https://example.test/',
        client: client,
        tokenStore: tokenStore,
      );

      final result = await service.pairDevice(
        reviewKey: 'review-secret',
        deviceName: 'Móvil Eduardo',
      );

      expect(requestedUri.path, '/api/review/devices/pair');

      expect(requestedHeaders['x-review-key'], 'review-secret');

      expect(requestedHeaders['content-type'], 'application/json');

      expect(requestedBody, {'deviceName': 'Móvil Eduardo'});

      expect(result.deviceId, 'device-1');

      expect(result.tokenId, 'abc123');

      expect(result.deviceToken, 'krd_abc123_secret456');

      expect(result.permissions, ['review:read', 'samples:create']);

      expect(await tokenStore.readDeviceToken(), 'krd_abc123_secret456');

      service.dispose();
    },
  );

  test('isDevicePaired returns true when a token is stored', () async {
    final tokenStore = InMemoryReviewDeviceTokenStore()
      ..token = 'krd_abc_secret';

    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
      tokenStore: tokenStore,
    );

    expect(await service.isDevicePaired(), isTrue);

    service.dispose();
  });

  test('forgetDevice removes the stored token', () async {
    final tokenStore = InMemoryReviewDeviceTokenStore()
      ..token = 'krd_abc_secret';

    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
      tokenStore: tokenStore,
    );

    await service.forgetDevice();

    expect(await tokenStore.readDeviceToken(), isNull);

    service.dispose();
  });

  test('pairDevice rejects an empty review key before HTTP', () async {
    var requestCount = 0;

    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        requestCount++;

        return http.Response('{}', 200);
      }),
      tokenStore: InMemoryReviewDeviceTokenStore(),
    );

    await expectLater(
      service.pairDevice(reviewKey: '   ', deviceName: 'Móvil Eduardo'),
      throwsA(
        isA<ReviewDevicePairingException>().having(
          (error) => error.code,
          'code',
          'review_key_required',
        ),
      ),
    );

    expect(requestCount, 0);

    service.dispose();
  });

  test('pairDevice maps an invalid review key response', () async {
    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        return http.Response(
          jsonEncode({
            'ok': false,
            'error': 'review_admin_key_invalid',
            'message': 'The review administration key is invalid.',
          }),
          403,
        );
      }),
      tokenStore: InMemoryReviewDeviceTokenStore(),
    );

    await expectLater(
      service.pairDevice(reviewKey: 'wrong-key', deviceName: 'Móvil Eduardo'),
      throwsA(
        isA<ReviewDevicePairingException>()
            .having((error) => error.code, 'code', 'review_admin_key_invalid')
            .having((error) => error.statusCode, 'statusCode', 403),
      ),
    );

    service.dispose();
  });

  test('pairDevice maps a network failure', () async {
    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        throw Exception('Network unavailable');
      }),
      tokenStore: InMemoryReviewDeviceTokenStore(),
    );

    await expectLater(
      service.pairDevice(
        reviewKey: 'review-secret',
        deviceName: 'Móvil Eduardo',
      ),
      throwsA(
        isA<ReviewDevicePairingException>().having(
          (error) => error.code,
          'code',
          'network_error',
        ),
      ),
    );

    service.dispose();
  });

  test('pairDevice rejects invalid JSON', () async {
    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        return http.Response('not-json', 201);
      }),
      tokenStore: InMemoryReviewDeviceTokenStore(),
    );

    await expectLater(
      service.pairDevice(
        reviewKey: 'review-secret',
        deviceName: 'Móvil Eduardo',
      ),
      throwsA(
        isA<ReviewDevicePairingException>().having(
          (error) => error.code,
          'code',
          'invalid_json',
        ),
      ),
    );

    service.dispose();
  });

  test('pairDevice rejects an invalid successful response', () async {
    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        return http.Response(
          jsonEncode({'ok': true, 'deviceId': 'device-1'}),
          201,
        );
      }),
      tokenStore: InMemoryReviewDeviceTokenStore(),
    );

    await expectLater(
      service.pairDevice(
        reviewKey: 'review-secret',
        deviceName: 'Móvil Eduardo',
      ),
      throwsA(
        isA<ReviewDevicePairingException>().having(
          (error) => error.code,
          'code',
          'invalid_response',
        ),
      ),
    );

    service.dispose();
  });

  test('ReviewDevicePairingResult parses expiresAt when present', () {
    final result = ReviewDevicePairingResult.fromJson({
      ...createPairingResponse(),
      'expiresAt': '2026-08-17T12:00:00.000Z',
    });

    expect(result.expiresAt, DateTime.parse('2026-08-17T12:00:00.000Z'));
  });
}
