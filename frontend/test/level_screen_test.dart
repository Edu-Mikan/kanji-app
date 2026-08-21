import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kanji_app/screens/level_screen.dart';
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

ReviewDevicePairingService createService({String? token}) {
  final tokenStore = InMemoryReviewDeviceTokenStore()..token = token;

  return ReviewDevicePairingService(
    baseUrl: 'https://example.test',
    client: MockClient((request) async => http.Response('{}', 200)),
    tokenStore: tokenStore,
  );
}

Widget createTestApp({
  required ReviewDevicePairingService service,
  WidgetBuilder? pairingScreenBuilder,
}) {
  return MaterialApp(
    home: LevelScreen(
      pairingService: service,
      pairingScreenBuilder: pairingScreenBuilder,
    ),
  );
}

void main() {
  testWidgets('oculta Entrenamiento IA si el dispositivo no está vinculado', (
    WidgetTester tester,
  ) async {
    final service = createService();

    await tester.pumpWidget(createTestApp(service: service));

    await tester.pumpAndSettle();

    expect(find.text('Entrenamiento IA'), findsNothing);

    await tester.tap(find.byIcon(Icons.settings));

    await tester.pumpAndSettle();

    expect(find.text('Vincular dispositivo'), findsOneWidget);

    expect(find.text('Acerca de'), findsOneWidget);

    service.dispose();
  });

  testWidgets('muestra Entrenamiento IA si el dispositivo está vinculado', (
    WidgetTester tester,
  ) async {
    final service = createService(token: 'krd_tokenid_tokensecret');

    await tester.pumpWidget(createTestApp(service: service));

    await tester.pumpAndSettle();

    expect(find.text('Entrenamiento IA'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.settings));

    await tester.pumpAndSettle();

    expect(find.text('Desvincular dispositivo'), findsOneWidget);

    expect(find.text('Acerca de'), findsOneWidget);

    service.dispose();
  });

  testWidgets('vincular dispositivo desde Settings muestra Entrenamiento IA', (
    WidgetTester tester,
  ) async {
    final service = createService();

    await tester.pumpWidget(
      createTestApp(
        service: service,
        pairingScreenBuilder: (context) {
          return Scaffold(
            appBar: AppBar(title: const Text('Pantalla de vinculación')),
            body: Center(
              child: FilledButton(
                onPressed: () {
                  service.tokenStore.saveDeviceToken('krd_tokenid_tokensecret');

                  Navigator.pop(context, true);
                },
                child: const Text('Vincular ahora'),
              ),
            ),
          );
        },
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Entrenamiento IA'), findsNothing);

    await tester.tap(find.byIcon(Icons.settings));

    await tester.pumpAndSettle();

    await tester.tap(find.text('Vincular dispositivo'));

    await tester.pumpAndSettle();

    await tester.tap(find.text('Vincular ahora'));

    await tester.pumpAndSettle();

    expect(find.text('Entrenamiento IA'), findsOneWidget);

    service.dispose();
  });

  testWidgets('desvincular dispositivo oculta Entrenamiento IA', (
    WidgetTester tester,
  ) async {
    final service = createService(token: 'krd_tokenid_tokensecret');

    await tester.pumpWidget(createTestApp(service: service));

    await tester.pumpAndSettle();

    expect(find.text('Entrenamiento IA'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.settings));

    await tester.pumpAndSettle();

    await tester.tap(find.text('Desvincular dispositivo'));

    await tester.pumpAndSettle();

    expect(find.text('Desvincular dispositivo'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Desvincular'));

    await tester.pumpAndSettle();

    expect(find.text('Entrenamiento IA'), findsNothing);

    expect(await service.isDevicePaired(), isFalse);

    service.dispose();
  });

  testWidgets('muestra el diálogo Acerca de', (WidgetTester tester) async {
    final service = createService();

    await tester.pumpWidget(createTestApp(service: service));

    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.settings));

    await tester.pumpAndSettle();

    await tester.tap(find.text('Acerca de'));

    await tester.pumpAndSettle();

    expect(find.text('Kanji App'), findsOneWidget);

    expect(find.textContaining('Backend configurado:'), findsOneWidget);

    service.dispose();
  });
}
