import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kanji_app/screens/training_kanji_list_screen.dart';
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
  Map<String, dynamic> createCountsResponse() {
    return {
      'ok': true,
      'requestedCount': 4,
      'withSamplesCount': 2,
      'withoutSamplesCount': 2,
      'counts': {'力': 12, '木': 69, '刀': 0, '川': 0},
    };
  }

  Widget createTestApp({
    required SampleReviewService service,
    required ReviewDevicePairingService pairingService,
    Widget Function(
      BuildContext context,
      List<String> kanjis,
      int initialIndex,
    )?
    testScreenBuilder,
  }) {
    return MaterialApp(
      home: TrainingKanjiListScreen(
        title: 'Categoría test',
        kanjis: const ['力', '木', '刀', '川'],
        sampleReviewService: service,
        pairingService: pairingService,
        testScreenBuilder: testScreenBuilder,
      ),
    );
  }

  SampleReviewService createService({
    void Function(http.Request request)? onRequest,
  }) {
    return SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        onRequest?.call(request);

        return http.Response(
          jsonEncode(createCountsResponse()),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
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

  testWidgets('muestra los conteos de muestras por kanji', (
    WidgetTester tester,
  ) async {
    late http.Request request;

    final service = createService(
      onRequest: (capturedRequest) {
        request = capturedRequest;
      },
    );

    final pairingService = createPairingService();

    await tester.pumpWidget(
      createTestApp(service: service, pairingService: pairingService),
    );

    await tester.pumpAndSettle();

    expect(request.url.path, '/api/review/sample-counts');

    expect(request.headers['authorization'], 'Bearer krd_tokenid_tokensecret');

    expect(find.text('2 con muestras · 2 sin muestras'), findsOneWidget);

    expect(find.text('12'), findsOneWidget);

    expect(find.text('69'), findsOneWidget);

    expect(find.text('0'), findsNWidgets(2));

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('filtra los kanjis con muestras', (WidgetTester tester) async {
    final service = createService();
    final pairingService = createPairingService();

    await tester.pumpWidget(
      createTestApp(service: service, pairingService: pairingService),
    );

    await tester.pumpAndSettle();

    await tester.tap(find.text('Con muestras'));

    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('training-kanji-力')), findsOneWidget);

    expect(find.byKey(const ValueKey('training-kanji-木')), findsOneWidget);

    expect(find.byKey(const ValueKey('training-kanji-刀')), findsNothing);

    expect(find.byKey(const ValueKey('training-kanji-川')), findsNothing);

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('filtra los kanjis sin muestras', (WidgetTester tester) async {
    final service = createService();
    final pairingService = createPairingService();

    await tester.pumpWidget(
      createTestApp(service: service, pairingService: pairingService),
    );

    await tester.pumpAndSettle();

    await tester.tap(find.text('Sin muestras'));

    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('training-kanji-力')), findsNothing);

    expect(find.byKey(const ValueKey('training-kanji-木')), findsNothing);

    expect(find.byKey(const ValueKey('training-kanji-刀')), findsOneWidget);

    expect(find.byKey(const ValueKey('training-kanji-川')), findsOneWidget);

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('abre TestScreen con la lista filtrada', (
    WidgetTester tester,
  ) async {
    late List<String> openedKanjis;
    late int openedIndex;

    final service = createService();
    final pairingService = createPairingService();

    await tester.pumpWidget(
      createTestApp(
        service: service,
        pairingService: pairingService,
        testScreenBuilder: (context, kanjis, initialIndex) {
          openedKanjis = List<String>.of(kanjis);

          openedIndex = initialIndex;

          return const Scaffold(
            body: Center(child: Text('TestScreen simulada')),
          );
        },
      ),
    );

    await tester.pumpAndSettle();

    await tester.tap(find.text('Sin muestras'));

    await tester.pumpAndSettle();

    final riverCard = find.byKey(const ValueKey('training-kanji-川'));

    await tester.tap(riverCard);

    await tester.pumpAndSettle();

    expect(find.text('TestScreen simulada'), findsOneWidget);

    expect(openedKanjis, ['刀', '川']);

    expect(openedIndex, 1);

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('mantiene los kanjis accesibles si fallan los conteos', (
    WidgetTester tester,
  ) async {
    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        throw Exception('Network unavailable');
      }),
    );

    final pairingService = createPairingService();

    await tester.pumpWidget(
      createTestApp(service: service, pairingService: pairingService),
    );

    await tester.pumpAndSettle();

    expect(find.text('No se pudo conectar con el backend.'), findsOneWidget);

    expect(find.byKey(const ValueKey('training-kanji-力')), findsOneWidget);

    expect(find.byKey(const ValueKey('training-kanji-刀')), findsOneWidget);

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('muestra error si no existe token', (WidgetTester tester) async {
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

    await tester.pumpAndSettle();

    expect(find.text('Este dispositivo no está vinculado.'), findsOneWidget);

    expect(requestCount, 0);

    service.dispose();
    pairingService.dispose();
  });
}
