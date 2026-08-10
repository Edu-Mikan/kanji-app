import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kanji_app/screens/test_screen.dart';

void main() {
  Widget createTestApp({
    List<String> kanjiList = const ['力', '木'],
    int initialIndex = 0,
  }) {
    return MaterialApp(
      home: TestScreen(kanjiList: kanjiList, initialIndex: initialIndex),
    );
  }

  testWidgets(
    'TestScreen muestra el kanji y las acciones de etiquetado manual',
    (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp());

      await tester.pump();

      expect(find.text('Entrenamiento IA'), findsOneWidget);

      expect(find.text('力'), findsOneWidget);

      expect(find.text('1 / 2'), findsOneWidget);

      expect(find.text('Correcto'), findsOneWidget);

      expect(find.text('Incorrecto'), findsOneWidget);

      expect(find.text('Borrar'), findsOneWidget);

      expect(find.text('Anterior'), findsOneWidget);

      expect(find.text('Siguiente'), findsOneWidget);
    },
  );

  testWidgets(
    'TestScreen permite navegar al siguiente kanji sin guardar feedback',
    (WidgetTester tester) async {
      await tester.pumpWidget(createTestApp());

      await tester.pump();

      expect(find.text('力'), findsOneWidget);

      expect(find.text('1 / 2'), findsOneWidget);

      await tester.tap(find.text('Siguiente'));

      await tester.pump();

      expect(find.text('木'), findsOneWidget);

      expect(find.text('2 / 2'), findsOneWidget);
    },
  );

  testWidgets('TestScreen comienza en el índice indicado', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      createTestApp(kanjiList: const ['力', '木', '本'], initialIndex: 1),
    );

    await tester.pump();

    expect(find.text('木'), findsOneWidget);

    expect(find.text('2 / 3'), findsOneWidget);
  });
}
