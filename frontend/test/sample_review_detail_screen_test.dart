import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kanji_app/models/review_sample.dart';
import 'package:kanji_app/screens/sample_review_detail_screen.dart';
import 'package:kanji_app/widgets/stroke_preview.dart';

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
  }) {
    return MaterialApp(
      home: SampleReviewDetailScreen(
        samples: samples,
        initialIndex: initialIndex,
      ),
    );
  }

  testWidgets('muestra el detalle de la muestra inicial', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(samples: createSamples()));

    await tester.pump();

    expect(find.text('Muestra 1 de 2'), findsOneWidget);

    expect(find.text('Incorrecta'), findsOneWidget);

    expect(find.text('2 trazos'), findsNothing);

    expect(find.text('Trazos'), findsOneWidget);

    expect(find.text('2'), findsWidgets);

    expect(find.text('sample-incorrect'), findsOneWidget);

    expect(find.byType(StrokePreview), findsOneWidget);

    expect(find.textContaining('Vista de sólo lectura'), findsOneWidget);
  });

  testWidgets('permite navegar a la siguiente y anterior muestra', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(samples: createSamples()));

    await tester.pump();

    expect(find.text('Muestra 1 de 2'), findsOneWidget);

    expect(find.text('Incorrecta'), findsOneWidget);

    await tester.tap(find.text('Siguiente'));

    await tester.pumpAndSettle();

    expect(find.text('Muestra 2 de 2'), findsOneWidget);

    expect(find.text('Correcta'), findsOneWidget);

    expect(find.text('sample-correct'), findsOneWidget);

    await tester.tap(find.text('Anterior'));

    await tester.pumpAndSettle();

    expect(find.text('Muestra 1 de 2'), findsOneWidget);

    expect(find.text('Incorrecta'), findsOneWidget);
  });

  testWidgets('ajusta el índice inicial a un rango válido', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      createTestApp(samples: createSamples(), initialIndex: 99),
    );

    await tester.pump();

    expect(find.text('Muestra 2 de 2'), findsOneWidget);

    expect(find.text('Correcta'), findsOneWidget);
  });

  testWidgets('muestra estado vacío si no hay muestras', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(samples: const []));

    await tester.pump();

    expect(find.text('Detalle de muestra'), findsOneWidget);

    expect(find.text('No hay muestras para mostrar.'), findsOneWidget);
  });
}
