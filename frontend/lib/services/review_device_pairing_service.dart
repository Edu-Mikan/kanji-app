import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:kanji_app/config/app_config.dart';

class ReviewDevicePairingException implements Exception {
  final String code;
  final String message;
  final int? statusCode;
  final dynamic details;

  const ReviewDevicePairingException({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
  });

  @override
  String toString() {
    return 'ReviewDevicePairingException('
        'code: $code, '
        'statusCode: $statusCode, '
        'message: $message'
        ')';
  }
}

class ReviewDevicePairingResult {
  final String deviceId;
  final String tokenId;
  final String deviceToken;
  final List<String> permissions;
  final DateTime? expiresAt;

  const ReviewDevicePairingResult({
    required this.deviceId,
    required this.tokenId,
    required this.deviceToken,
    required this.permissions,
    required this.expiresAt,
  });

  factory ReviewDevicePairingResult.fromJson(Map<String, dynamic> json) {
    if (json['ok'] != true) {
      throw const FormatException('The pairing response is not successful.');
    }

    final permissionsValue = json['permissions'];

    if (permissionsValue is! List) {
      throw const FormatException('permissions must be a list.');
    }

    return ReviewDevicePairingResult(
      deviceId: _requiredString(json['deviceId'], 'deviceId'),
      tokenId: _requiredString(json['tokenId'], 'tokenId'),
      deviceToken: _requiredString(json['deviceToken'], 'deviceToken'),
      permissions: List<String>.unmodifiable(
        permissionsValue
            .whereType<String>()
            .map((value) => value.trim())
            .where((value) => value.isNotEmpty),
      ),
      expiresAt: _parseDateTime(json['expiresAt']),
    );
  }

  static String _requiredString(dynamic value, String fieldName) {
    if (value is! String || value.trim().isEmpty) {
      throw FormatException('$fieldName must be a non-empty string.');
    }

    return value.trim();
  }

  static DateTime? _parseDateTime(dynamic value) {
    if (value is! String || value.trim().isEmpty) {
      return null;
    }

    return DateTime.tryParse(value.trim());
  }
}

abstract class ReviewDeviceTokenStore {
  Future<String?> readDeviceToken();

  Future<void> saveDeviceToken(String token);

  Future<void> deleteDeviceToken();

  Future<bool> hasDeviceToken() async {
    final token = await readDeviceToken();

    return token != null && token.trim().isNotEmpty;
  }
}

class SecureReviewDeviceTokenStore implements ReviewDeviceTokenStore {
  static const String _deviceTokenKey = 'kanji_app.review_device_token';

  final FlutterSecureStorage _storage;

  const SecureReviewDeviceTokenStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  @override
  Future<String?> readDeviceToken() async {
    final token = await _storage.read(key: _deviceTokenKey);

    if (token == null || token.trim().isEmpty) {
      return null;
    }

    return token.trim();
  }

  @override
  Future<bool> hasDeviceToken() async {
    final token = await readDeviceToken();

    return token != null && token.trim().isNotEmpty;
  }

  @override
  Future<void> saveDeviceToken(String token) async {
    final normalized = token.trim();

    if (normalized.isEmpty) {
      throw const ReviewDevicePairingException(
        code: 'empty_device_token',
        message: 'El token de dispositivo está vacío.',
      );
    }

    await _storage.write(key: _deviceTokenKey, value: normalized);
  }

  @override
  Future<void> deleteDeviceToken() async {
    await _storage.delete(key: _deviceTokenKey);
  }
}

class ReviewDevicePairingService {
  final String baseUrl;
  final http.Client _client;
  final ReviewDeviceTokenStore tokenStore;
  final bool _ownsClient;

  ReviewDevicePairingService({
    String? baseUrl,
    http.Client? client,
    ReviewDeviceTokenStore? tokenStore,
  }) : baseUrl = _normalizeBaseUrl(baseUrl ?? AppConfig.baseUrl),
       _client = client ?? http.Client(),
       tokenStore = tokenStore ?? const SecureReviewDeviceTokenStore(),
       _ownsClient = client == null;

  Future<bool> isDevicePaired() {
    return tokenStore.hasDeviceToken();
  }

  Future<String?> readDeviceToken() {
    return tokenStore.readDeviceToken();
  }

  Future<void> forgetDevice() {
    return tokenStore.deleteDeviceToken();
  }

  Future<ReviewDevicePairingResult> pairDevice({
    required String reviewKey,
    required String deviceName,
  }) async {
    final normalizedReviewKey = reviewKey.trim();
    final normalizedDeviceName = deviceName.trim().isEmpty
        ? 'Unnamed device'
        : deviceName.trim();

    if (normalizedReviewKey.isEmpty) {
      throw const ReviewDevicePairingException(
        code: 'review_key_required',
        message: 'La clave de emparejamiento es obligatoria.',
      );
    }

    final uri = Uri.parse('$baseUrl/api/review/devices/pair');

    late final http.Response response;

    try {
      response = await _client.post(
        uri,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Review-Key': normalizedReviewKey,
        },
        body: jsonEncode({'deviceName': normalizedDeviceName}),
      );
    } catch (_) {
      throw const ReviewDevicePairingException(
        code: 'network_error',
        message: 'No se pudo conectar con el servicio de emparejamiento.',
      );
    }

    final responseJson = _decodeResponseBody(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ReviewDevicePairingException(
        code: _optionalString(responseJson['error']) ?? 'device_pairing_failed',
        message:
            _optionalString(responseJson['message']) ??
            'No se pudo emparejar el dispositivo.',
        statusCode: response.statusCode,
        details: responseJson['details'],
      );
    }

    late final ReviewDevicePairingResult result;

    try {
      result = ReviewDevicePairingResult.fromJson(responseJson);
    } on FormatException catch (error) {
      throw ReviewDevicePairingException(
        code: 'invalid_response',
        message: 'La respuesta de emparejamiento no es válida.',
        statusCode: response.statusCode,
        details: error.message,
      );
    }

    try {
      await tokenStore.saveDeviceToken(result.deviceToken);
    } catch (error) {
      throw ReviewDevicePairingException(
        code: 'device_token_storage_failed',
        message:
            'El dispositivo se vinculó, pero no se pudo guardar el token de forma segura.',
        statusCode: response.statusCode,
        details: error.toString(),
      );
    }

    return result;
  }

  void dispose() {
    if (_ownsClient) {
      _client.close();
    }
  }

  static Map<String, dynamic> _decodeResponseBody(http.Response response) {
    if (response.body.trim().isEmpty) {
      throw ReviewDevicePairingException(
        code: 'empty_response',
        message: 'El servicio de emparejamiento devolvió una respuesta vacía.',
        statusCode: response.statusCode,
      );
    }

    try {
      final value = jsonDecode(response.body);

      if (value is! Map) {
        throw const FormatException('The response body must be a JSON object.');
      }

      return Map<String, dynamic>.from(value);
    } catch (error) {
      if (error is ReviewDevicePairingException) {
        rethrow;
      }

      throw ReviewDevicePairingException(
        code: 'invalid_json',
        message: 'El servicio de emparejamiento devolvió un JSON no válido.',
        statusCode: response.statusCode,
      );
    }
  }

  static String? _optionalString(dynamic value) {
    if (value is! String || value.trim().isEmpty) {
      return null;
    }

    return value.trim();
  }

  static String _normalizeBaseUrl(String value) {
    final normalized = value.trim();

    if (normalized.isEmpty) {
      throw ArgumentError.value(
        value,
        'baseUrl',
        'La URL base no puede estar vacía.',
      );
    }

    return normalized.endsWith('/')
        ? normalized.substring(0, normalized.length - 1)
        : normalized;
  }
}
