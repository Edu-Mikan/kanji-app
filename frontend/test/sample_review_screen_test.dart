import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kanji_app/screens/sample_review_screen.dart';
import 'package:kanji_app/services/review_device_pairing_service.dart';
import 'package:kanji_app/services/sample_review_service.dart';

class InMemoryReviewDeviceTokenStore implements ReviewDeviceTokenStore {
  String? token;

  InMemoryReviewDeviceTokenStore({this.token});

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
  Map<String, dynamic> createSampleJson({
    String recognitionId = 'sample-1',
    bool isCorrect = false,
  }) {
    return {
      'id': 'mongo-$recognitionId',
      'recognitionId': recognitionId,
      'kanji': '力',
      'expectedKanji': '力',
      'isCorrect': isCorrect,
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

  Map<String, dynamic> createPageResponse({
    required List<Map<String, dynamic>> items,
    String label = 'all',
    int page = 1,
  }) {
    return {
      'ok': true,
      'filters': {
        'kanji': '力',
        'status': 'pending',
        'label': label,
        'source': 'test_screen',
        'feedbackType': 'manual_debug',
      },
      'page': page,
      'pageSize': 20,
      'total': items.length,
      'totalPages': items.isEmpty ? 0 : 1,
      'hasPreviousPage': false,
      'hasNextPage': false,
      'items': items,
    };
  }

  ReviewDevicePairingService createPairingService({
    String? token = 'krd_tokenid_tokensecret',
  }) {
    return ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        return http.Response('{}', 200);
      }),
      tokenStore: InMemoryReviewDeviceTokenStore(token: token),
    );
  }

  Widget createTestApp({
    required SampleReviewService service,
    required ReviewDevicePairingService pairingService,
  }) {
    return MaterialApp(
      home: SampleReviewScreen(
        kanji: '力',
        service: service,
        pairingService: pairingService,
      ),
    );
  }

  testWidgets('muestra el estado inicial antes de consultar', (
    WidgetTester tester,
  ) async {
    var requestCount = 0;

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        requestCount++;

        return http.Response('{}', 200);
      }),
    );

    final pairingService = createPairingService();

    await tester.pumpWidget(
      createTestApp(service: service, pairingService: pairingService),
    );

    await tester.pump();

    expect(
      find.text('Pulsa Consultar para cargar las muestras'),
      findsOneWidget,
    );

    expect(find.text('Consultar'), findsOneWidget);

    expect(requestCount, 0);

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('consulta muestras usando el token vinculado', (
    WidgetTester tester,
  ) async {
    late http.Request capturedRequest;

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        capturedRequest = request;

        return http.Response(
          jsonEncode(createPageResponse(items: [createSampleJson()])),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final pairingService = createPairingService();

    await tester.pumpWidget(
      createTestApp(service: service, pairingService: pairingService),
    );

    await tester.pump();

    await tester.tap(find.widgetWithText(FilledButton, 'Consultar'));

    await tester.pumpAndSettle();

    expect(capturedRequest.method, 'GET');

    expect(capturedRequest.url.path, '/api/review/samples');

    expect(
      capturedRequest.headers['authorization'],
      'Bearer krd_tokenid_tokensecret',
    );

    expect(capturedRequest.url.queryParameters['kanji'], '力');

    expect(find.text('sample-1'), findsOneWidget);

    expect(find.text('Incorrecta'), findsOneWidget);

    expect(find.textContaining('1 muestras'), findsOneWidget);

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('recarga la galería al volver del detalle', (
    WidgetTester tester,
  ) async {
    var getRequestCount = 0;

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        if (request.method != 'GET') {
          return http.Response(
            jsonEncode({'ok': false, 'error': 'unexpected_request'}),
            500,
          );
        }

        getRequestCount++;

        if (getRequestCount == 1) {
          return http.Response(
            jsonEncode(createPageResponse(items: [createSampleJson()])),
            200,
            headers: {'content-type': 'application/json'},
          );
        }

        return http.Response(
          jsonEncode(createPageResponse(items: const [])),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final pairingService = createPairingService();

    await tester.pumpWidget(
      createTestApp(service: service, pairingService: pairingService),
    );

    await tester.pump();

    await tester.tap(find.widgetWithText(FilledButton, 'Consultar'));

    await tester.pumpAndSettle();

    expect(getRequestCount, 1);

    expect(find.text('sample-1'), findsOneWidget);

    final sampleCard = find.byKey(const ValueKey('review-sample-sample-1'));

    expect(sampleCard, findsOneWidget);

    await tester.ensureVisible(sampleCard);

    await tester.pumpAndSettle();

    await tester.tap(sampleCard);

    await tester.pumpAndSettle();

    expect(find.text('Muestra 1 de 1'), findsOneWidget);

    expect(find.text('Valoración'), findsOneWidget);

    await tester.pageBack();

    await tester.pumpAndSettle();

    expect(getRequestCount, 2);

    expect(find.text('sample-1'), findsNothing);

    expect(
      find.text('No hay muestras de 力 con estos filtros.'),
      findsOneWidget,
    );

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('muestra un error si el dispositivo no está vinculado', (
    WidgetTester tester,
  ) async {
    var requestCount = 0;

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        requestCount++;

        return http.Response('{}', 200);
      }),
    );

    final pairingService = createPairingService(token: null);

    await tester.pumpWidget(
      createTestApp(service: service, pairingService: pairingService),
    );

    await tester.pump();

    await tester.tap(find.widgetWithText(FilledButton, 'Consultar'));

    await tester.pumpAndSettle();

    expect(
      find.textContaining('Este dispositivo no está vinculado'),
      findsOneWidget,
    );

    expect(requestCount, 0);

    service.dispose();
    pairingService.dispose();
  });
}
