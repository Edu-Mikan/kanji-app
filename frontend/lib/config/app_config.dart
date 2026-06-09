import 'package:flutter/foundation.dart';

class AppConfig {
  static String get baseUrl {
    if (kReleaseMode) {
      return 'https://kanji-app-mjns.onrender.com';
    } else {
      return 'http://localhost:3000';
    }
  }
}
