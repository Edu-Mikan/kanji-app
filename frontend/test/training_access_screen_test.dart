import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kanji_app/screens/training_access_screen.dart';
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
  ReviewDevicePairingService createService({String? token}) {
    final tokenStore = InMemoryReviewDeviceTokenStore()..token = token;

    return ReviewDevicePairingService(
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response('{}', 200)),
      tokenStore: tokenStore,
    );
  }

  Widget createTrainingScreen() {
    return const Scaffold(
      body: Center(child: Text('Pantalla de categorías IA')),
    );
  }

  Widget createPairingScreen({bool autoPair = false}) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pantalla de vinculación')),
      body: Center(
        child: FilledButton(
          onPressed: autoPair ? null : null,
          child: const Text('Vincular dispositivo'),
        ),
      ),
    );
  }

  testWidgets('abre las categorías si el dispositivo ya está vinculado', (
    WidgetTester tester,
  ) async {
    final service = createService(token: 'krd_abc_secret');

    await tester.pumpWidget(
      MaterialApp(
        home: TrainingAccessScreen(
          pairingService: service,
          trainingScreenBuilder: (_) => createTrainingScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Pantalla de categorías IA'), findsOneWidget);

    service.dispose();
  });

  testWidgets('abre la pantalla de vinculación si no hay token', (
    WidgetTester tester,
  ) async {
    final service = createService();

    await tester.pumpWidget(
      MaterialApp(
        home: TrainingAccessScreen(
          pairingService: service,
          trainingScreenBuilder: (_) => createTrainingScreen(),
          pairingScreenBuilder: (_) => createPairingScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Pantalla de vinculación'), findsOneWidget);

    service.dispose();
  });

  testWidgets('continúa a categorías cuando la vinculación devuelve true', (
    WidgetTester tester,
  ) async {
    final service = createService();

    await tester.pumpWidget(
      MaterialApp(
        home: TrainingAccessScreen(
          pairingService: service,
          trainingScreenBuilder: (_) => createTrainingScreen(),
          pairingScreenBuilder: (context) {
            return Scaffold(
              appBar: AppBar(title: const Text('Pantalla de vinculación')),
              body: Center(
                child: FilledButton(
                  onPressed: () {
                    Navigator.pop(context, true);
                  },
                  child: const Text('Vincular ahora'),
                ),
              ),
            );
          },
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Pantalla de vinculación'), findsOneWidget);

    await tester.tap(find.text('Vincular ahora'));

    await tester.pumpAndSettle();

    expect(find.text('Pantalla de categorías IA'), findsOneWidget);

    service.dispose();
  });

  testWidgets('permite reintentar la vinculación si se cancela', (
    WidgetTester tester,
  ) async {
    final service = createService();

    await tester.pumpWidget(
      MaterialApp(
        home: TrainingAccessScreen(
          pairingService: service,
          trainingScreenBuilder: (_) => createTrainingScreen(),
          pairingScreenBuilder: (context) {
            return Scaffold(
              appBar: AppBar(title: const Text('Pantalla de vinculación')),
              body: Center(
                child: FilledButton(
                  onPressed: () {
                    Navigator.pop(context, false);
                  },
                  child: const Text('Cancelar vinculación'),
                ),
              ),
            );
          },
        ),
      ),
    );

    await tester.pumpAndSettle();

    await tester.tap(find.text('Cancelar vinculación'));

    await tester.pumpAndSettle();

    expect(find.text('Vinculación cancelada.'), findsOneWidget);

    expect(find.text('Vincular dispositivo'), findsOneWidget);

    service.dispose();
  });
}
