import 'package:flutter/material.dart';
import 'package:kanji_app/services/validation_service.dart';
import 'level_screen.dart';

class LoadingScreen extends StatefulWidget {
  const LoadingScreen({super.key});

  @override
  State<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends State<LoadingScreen> {
  late final ValidationService _validationService;
  @override
  void initState() {
    super.initState();
    _validationService = ValidationService(
      baseUrl: 'https://kanji-app-mjns.onrender.com',
    );
    _initApp();
  }

  Future<void> _warmUpBackend() async {
    try {
      await _validationService.ping();
    } catch (_) {}
  }

  Future<void> _fakeMinimumLoad() async {
    await Future.delayed(const Duration(milliseconds: 1500));
  }

  Future<void> _initApp() async {
    // 🔥 lanzamos en paralelo (muy importante)
    await Future.wait([
      _warmUpBackend(),
      _fakeMinimumLoad(), // mejora UX
    ]);

    // ✅ pequeño delay para asegurar render
    //await Future.delayed(const Duration(milliseconds: 1500));

    if (!mounted) return;

    // Navigator.of(
    //   context,
    // ).pushReplacement(MaterialPageRoute(builder: (_) => const CanvasScreen()));

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LevelScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/images/loading_image_kanji_kun.PNG',
              width: 120,
            ),
            Text(
              "漢字くん",
              style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 16),
            Text("Cargando aplicación...", style: TextStyle(fontSize: 18)),
            SizedBox(height: 24),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
