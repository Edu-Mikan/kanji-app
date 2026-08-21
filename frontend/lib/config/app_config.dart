class AppConfig {
  static const String _defaultBaseUrl = 'https://kanji-app-mjns.onrender.com';

  static String get baseUrl {
    const configuredBaseUrl = String.fromEnvironment('API_BASE_URL');

    if (configuredBaseUrl.trim().isNotEmpty) {
      return _normalizeBaseUrl(configuredBaseUrl);
    }

    return _defaultBaseUrl;
  }

  static String _normalizeBaseUrl(String value) {
    final normalized = value.trim();

    if (normalized.endsWith('/')) {
      return normalized.substring(0, normalized.length - 1);
    }

    return normalized;
  }
}
