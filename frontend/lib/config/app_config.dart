import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'package:flutter/services.dart';

class AppConfig {
  static bool testModeEnabled = false;

  static Future<void> load() async {
    final data = await rootBundle.loadString('assets/config.json');
    final jsonData = jsonDecode(data);

    testModeEnabled = jsonData['testModeEnabled'] ?? false;
  }

  static String get baseUrl {
    if (kReleaseMode) {
      return 'https://kanji-app-mjns.onrender.com';
    } else {
      return 'http://localhost:3000';
    }
  }
}
