import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kanji_app/screens/review_device_pairing_screen.dart';
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

  Widget createTestApp({
    required ReviewDevicePairingService service,
    bool closeOnSuccess = false,
  }) {
    return MaterialApp(
      home: ReviewDevicePairingScreen(
        service: service,
        closeOnSuccess: closeOnSuccess,
      ),
    );
  }

  testWidgets('muestra los campos de vinculación', (WidgetTester tester) async {
    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
      tokenStore: InMemoryReviewDeviceTokenStore(),
    );

    await tester.pumpWidget(createTestApp(service: service));

    expect(find.text('Vincular dispositivo'), findsWidgets);

    expect(find.text('Nombre del dispositivo'), findsOneWidget);

    expect(find.text('Clave de emparejamiento'), findsOneWidget);

    service.dispose();
  });

  testWidgets('muestra error si la clave está vacía', (
    WidgetTester tester,
  ) async {
    var requestCount = 0;

    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        requestCount++;

        return http.Response('{}', 200);
      }),
      tokenStore: InMemoryReviewDeviceTokenStore(),
    );

    await tester.pumpWidget(createTestApp(service: service));

    await tester.tap(find.widgetWithText(FilledButton, 'Vincular dispositivo'));

    await tester.pump();

    expect(find.text('Introduce la clave de emparejamiento.'), findsOneWidget);

    expect(requestCount, 0);

    service.dispose();
  });

  testWidgets('vincula el dispositivo y guarda el token', (
    WidgetTester tester,
  ) async {
    late Map<String, String> requestedHeaders;
    late Map<String, dynamic> requestedBody;

    final tokenStore = InMemoryReviewDeviceTokenStore();

    final service = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        requestedHeaders = request.headers;
        requestedBody = jsonDecode(request.body) as Map<String, dynamic>;

        return http.Response(
          jsonEncode(createPairingResponse()),
          201,
          headers: {'content-type': 'application/json'},
        );
      }),
      tokenStore: tokenStore,
    );

    await tester.pumpWidget(createTestApp(service: service));

    await tester.enterText(find.byType(TextField).at(0), 'Móvil test');

    await tester.enterText(find.byType(TextField).at(1), 'review-secret');

    await tester.tap(find.widgetWithText(FilledButton, 'Vincular dispositivo'));

    await tester.pumpAndSettle();

    expect(requestedHeaders['x-review-key'], 'review-secret');

    expect(requestedBody, {'deviceName': 'Móvil test'});

    expect(await tokenStore.readDeviceToken(), 'krd_abc123_secret456');

    expect(
      find.textContaining('Dispositivo vinculado correctamente'),
      findsOneWidget,
    );

    service.dispose();
  });

  testWidgets('muestra error si la clave es inválida', (
    WidgetTester tester,
  ) async {
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

    await tester.pumpWidget(createTestApp(service: service));

    await tester.enterText(find.byType(TextField).at(1), 'wrong-key');

    await tester.tap(find.widgetWithText(FilledButton, 'Vincular dispositivo'));

    await tester.pumpAndSettle();

    expect(
      find.text('La clave de emparejamiento no es válida.'),
      findsOneWidget,
    );

    service.dispose();
  });
}
