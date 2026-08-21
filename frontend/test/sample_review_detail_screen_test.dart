import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kanji_app/models/review_sample.dart';
import 'package:kanji_app/screens/sample_review_detail_screen.dart';
import 'package:kanji_app/widgets/stroke_preview.dart';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
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
  ReviewSample createSample({
    required String recognitionId,
    required bool isCorrect,
    required DateTime createdAt,
    int strokeCount = 2,
  }) {
    final strokes = List<ReviewStroke>.generate(
      strokeCount,
      (index) =>
          ReviewStroke(x: const [0, 0.5, 1], y: [0, 0.3 + index * 0.1, 1]),
    );

    return ReviewSample(
      id: 'mongo-$recognitionId',
      recognitionId: recognitionId,
      kanji: '力',
      expectedKanji: '力',
      isCorrect: isCorrect,
      datasetReviewStatus: 'pending',
      datasetReviewedAt: null,
      exclusionReason: null,
      strokeCount: strokeCount,
      strokesNormalized: strokes,
      createdAt: createdAt,
      updatedAt: null,
      source: 'test_screen',
      feedbackType: 'manual_debug',
      algorithmVersion: 'heuristic-v2',
      schemaVersion: 1,
    );
  }

  List<ReviewSample> createSamples() {
    return [
      createSample(
        recognitionId: 'sample-incorrect',
        isCorrect: false,
        createdAt: DateTime.parse('2026-08-03T20:44:28.401Z'),
      ),
      createSample(
        recognitionId: 'sample-correct',
        isCorrect: true,
        createdAt: DateTime.parse('2026-08-03T20:43:28.401Z'),
      ),
    ];
  }

  Widget createTestApp({
    required List<ReviewSample> samples,
    int initialIndex = 0,
    SampleReviewService? service,
    ReviewDevicePairingService? pairingService,
  }) {
    return MaterialApp(
      home: SampleReviewDetailScreen(
        samples: samples,
        initialIndex: initialIndex,
        service: service,
        pairingService: pairingService,
      ),
    );
  }

  Finder findLabelOption(String label) {
    return find.descendant(
      of: find.byType(SegmentedButton<bool>),
      matching: find.text(label),
    );
  }

  testWidgets('muestra el detalle de la muestra inicial', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(samples: createSamples()));

    await tester.pump();

    expect(find.text('Muestra 1 de 2'), findsOneWidget);

    expect(find.text('Incorrecta'), findsWidgets);

    expect(find.text('2 trazos'), findsNothing);

    expect(find.text('Trazos'), findsOneWidget);

    expect(find.text('2'), findsWidgets);

    expect(find.text('sample-incorrect'), findsOneWidget);

    expect(find.byType(StrokePreview), findsOneWidget);

    final preview = tester.widget<StrokePreview>(find.byType(StrokePreview));

    expect(preview.showStrokeOrder, isTrue);

    expect(find.text('Valoración'), findsOneWidget);

    expect(find.byType(SegmentedButton<bool>), findsOneWidget);
  });

  testWidgets('permite navegar a la siguiente y anterior muestra', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(samples: createSamples()));

    await tester.pump();

    expect(find.text('Muestra 1 de 2'), findsOneWidget);

    expect(find.text('Incorrecta'), findsWidgets);

    await tester.tap(find.text('Siguiente'));

    await tester.pumpAndSettle();

    expect(find.text('Muestra 2 de 2'), findsOneWidget);

    expect(find.text('Correcta'), findsWidgets);

    expect(find.text('sample-correct'), findsOneWidget);

    await tester.tap(find.text('Anterior'));

    await tester.pumpAndSettle();

    expect(find.text('Muestra 1 de 2'), findsOneWidget);

    expect(find.text('Incorrecta'), findsWidgets);
  });

  testWidgets('ajusta el índice inicial a un rango válido', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      createTestApp(samples: createSamples(), initialIndex: 99),
    );

    await tester.pump();

    expect(find.text('Muestra 2 de 2'), findsOneWidget);

    expect(find.text('Correcta'), findsWidgets);
  });

  testWidgets('muestra estado vacío si no hay muestras', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(samples: const []));

    await tester.pump();

    expect(find.text('Detalle de muestra'), findsOneWidget);

    expect(find.text('No hay muestras para mostrar.'), findsOneWidget);
  });

  Map<String, dynamic> sampleToJson(
    ReviewSample sample, {
    required bool isCorrect,
  }) {
    return {
      'id': sample.id,
      'recognitionId': sample.recognitionId,
      'kanji': sample.kanji,
      'expectedKanji': sample.expectedKanji,
      'isCorrect': isCorrect,
      'datasetReviewStatus': sample.datasetReviewStatus,
      'datasetReviewedAt': null,
      'exclusionReason': sample.exclusionReason,
      'strokeCount': sample.strokeCount,
      'strokesNormalized': sample.strokesNormalized
          .map((stroke) => stroke.toJson())
          .toList(),
      'createdAt': sample.createdAt?.toIso8601String(),
      'updatedAt': '2026-08-21T10:00:00.000Z',
      'source': sample.source,
      'feedbackType': sample.feedbackType,
      'algorithmVersion': sample.algorithmVersion,
      'schemaVersion': sample.schemaVersion,
    };
  }

  testWidgets('permite cambiar una muestra incorrecta a correcta', (
    WidgetTester tester,
  ) async {
    late http.Request request;

    final samples = createSamples();

    final service = SampleReviewService(
      baseUrl: 'https://example.test',
      client: MockClient((capturedRequest) async {
        request = capturedRequest;

        return http.Response(
          jsonEncode({
            'ok': true,
            'changed': true,
            'sample': sampleToJson(samples.first, isCorrect: true),
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final pairingService = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
      tokenStore: InMemoryReviewDeviceTokenStore(
        token: 'krd_tokenid_tokensecret',
      ),
    );

    await tester.pumpWidget(
      createTestApp(
        samples: samples,
        service: service,
        pairingService: pairingService,
      ),
    );

    await tester.pump();

    expect(find.text('Incorrecta'), findsWidgets);

    final correctOption = findLabelOption('Correcta');

    await tester.ensureVisible(correctOption);
    await tester.pumpAndSettle();

    await tester.tap(correctOption);
    await tester.pumpAndSettle();

    expect(find.text('Cambiar valoración'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));

    await tester.pumpAndSettle();

    expect(request.method, 'PATCH');

    expect(request.headers['authorization'], 'Bearer krd_tokenid_tokensecret');

    expect(jsonDecode(request.body), {'isCorrect': true});

    expect(find.text('Correcta'), findsWidgets);

    expect(find.text('Valoración actualizada.'), findsOneWidget);

    service.dispose();
    pairingService.dispose();
  });

  testWidgets('permite cancelar el cambio de valoración', (
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

    final pairingService = ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
      tokenStore: InMemoryReviewDeviceTokenStore(
        token: 'krd_tokenid_tokensecret',
      ),
    );

    await tester.pumpWidget(
      createTestApp(
        samples: createSamples(),
        service: service,
        pairingService: pairingService,
      ),
    );

    await tester.pump();

    final correctOption = findLabelOption('Correcta');

    await tester.ensureVisible(correctOption);
    await tester.pumpAndSettle();

    await tester.tap(correctOption);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Cancelar'));

    await tester.pumpAndSettle();

    expect(requestCount, 0);

    expect(find.text('Incorrecta'), findsWidgets);

    service.dispose();
    pairingService.dispose();
  });
}
