import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kanji_app/models/review_sample.dart';
import 'package:kanji_app/widgets/stroke_preview.dart';

void main() {
  List<ReviewStroke> createValidStrokes() {
    return const [
      ReviewStroke(x: [0.2, 0.4, 0.6, 0.8], y: [0, 0.3, 0.7, 1]),
      ReviewStroke(x: [0.5, 0.3, 0], y: [0.5, 0.7, 1]),
    ];
  }

  Widget createTestApp({
    List<ReviewStroke>? strokes,
    double size = 180,
    bool showGuides = true,
    bool showStrokeOrder = false,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: StrokePreview(
            strokes: strokes ?? createValidStrokes(),
            size: size,
            showGuides: showGuides,
            showStrokeOrder: showStrokeOrder,
          ),
        ),
      ),
    );
  }

  Finder findStrokePreviewCustomPaint() {
    return find.byWidgetPredicate(
      (widget) =>
          widget is CustomPaint && widget.painter is StrokePreviewPainter,
      description: 'CustomPaint con StrokePreviewPainter',
    );
  }

  StrokePreviewPainter getStrokePreviewPainter(WidgetTester tester) {
    final customPaint = tester.widget<CustomPaint>(
      findStrokePreviewCustomPaint(),
    );

    return customPaint.painter! as StrokePreviewPainter;
  }

  testWidgets('StrokePreview muestra un CustomPaint con trazos válidos', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp());

    expect(find.byType(StrokePreview), findsOneWidget);

    expect(findStrokePreviewCustomPaint(), findsOneWidget);

    expect(find.text('Sin trazos'), findsNothing);

    final painter = getStrokePreviewPainter(tester);

    expect(painter.strokes.length, 2);

    expect(painter.showGuides, isTrue);
  });

  testWidgets('StrokePreview utiliza el tamaño indicado', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(size: 220));

    final sizeFinder = find.byWidgetPredicate(
      (widget) =>
          widget is SizedBox && widget.width == 220 && widget.height == 220,
      description: 'SizedBox cuadrado de 220 píxeles',
    );

    expect(sizeFinder, findsOneWidget);

    final sizedBox = tester.widget<SizedBox>(sizeFinder);

    expect(sizedBox.width, 220);

    expect(sizedBox.height, 220);
  });

  testWidgets('StrokePreview muestra un estado vacío sin trazos', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(strokes: const []));

    expect(find.text('Sin trazos'), findsOneWidget);

    expect(find.byIcon(Icons.gesture_outlined), findsOneWidget);

    final painter = getStrokePreviewPainter(tester);

    expect(painter.strokes, isEmpty);
  });

  testWidgets('StrokePreview descarta trazos inválidos', (
    WidgetTester tester,
  ) async {
    const invalidStroke = ReviewStroke(x: [0], y: [0]);

    await tester.pumpWidget(
      createTestApp(strokes: [...createValidStrokes(), invalidStroke]),
    );

    final preview = tester.widget<StrokePreview>(find.byType(StrokePreview));

    expect(preview.strokes.length, 3);

    expect(preview.validStrokes.length, 2);

    final painter = getStrokePreviewPainter(tester);

    expect(painter.strokes.length, 2);
  });

  testWidgets('StrokePreview permite ocultar las guías', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(showGuides: false));

    final painter = getStrokePreviewPainter(tester);

    expect(painter.showGuides, isFalse);
  });

  test('StrokePreviewPainter puede pintar los trazos sin errores', () {
    final recorder = ui.PictureRecorder();

    final canvas = Canvas(recorder);

    final painter = StrokePreviewPainter(
      strokes: createValidStrokes(),
      strokeColor: Colors.black,
      backgroundColor: Colors.white,
      guideColor: Colors.grey,
      strokeWidth: 5,
      showGuides: true,
      showStrokeOrder: false,
    );

    expect(() => painter.paint(canvas, const Size(180, 180)), returnsNormally);

    recorder.endRecording();
  });

  test('StrokePreviewPainter repinta cuando cambia la configuración', () {
    final strokes = createValidStrokes();

    final original = StrokePreviewPainter(
      strokes: strokes,
      strokeColor: Colors.black,
      backgroundColor: Colors.white,
      guideColor: Colors.grey,
      strokeWidth: 5,
      showGuides: true,
      showStrokeOrder: false,
    );

    final unchanged = StrokePreviewPainter(
      strokes: strokes,
      strokeColor: Colors.black,
      backgroundColor: Colors.white,
      guideColor: Colors.grey,
      strokeWidth: 5,
      showGuides: true,
      showStrokeOrder: false,
    );

    final changed = StrokePreviewPainter(
      strokes: strokes,
      strokeColor: Colors.red,
      backgroundColor: Colors.white,
      guideColor: Colors.grey,
      strokeWidth: 5,
      showGuides: true,
      showStrokeOrder: false,
    );

    final changedOrder = StrokePreviewPainter(
      strokes: strokes,
      strokeColor: Colors.black,
      backgroundColor: Colors.white,
      guideColor: Colors.grey,
      strokeWidth: 5,
      showGuides: true,
      showStrokeOrder: true,
    );

    expect(unchanged.shouldRepaint(original), isFalse);

    expect(changed.shouldRepaint(original), isTrue);

    expect(changedOrder.shouldRepaint(original), isTrue);
  });

  testWidgets('StrokePreview puede mostrar el orden de los trazos', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(createTestApp(showStrokeOrder: true));

    final painter = getStrokePreviewPainter(tester);

    expect(painter.showStrokeOrder, isTrue);
  });
}
