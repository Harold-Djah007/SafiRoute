import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

const forest = Color(0xFF0F5C2E);
const forestDark = Color(0xFF062A18);
const gold = Color(0xFFC9A227);
const cream = Color(0xFFF4EFE2);
const paper = Color(0xFFEAF4F1);

const defaultApi = String.fromEnvironment(
  'SAFIROUTE_API',
  defaultValue: 'http://10.0.2.2:8000/api',
);
const allowInsecureApi = bool.fromEnvironment(
  'SAFIROUTE_ALLOW_INSECURE_API',
  defaultValue: false,
);

ThemeData safiTheme() => ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: cream,
      colorScheme: ColorScheme.fromSeed(
        seedColor: forest,
        primary: forest,
        secondary: gold,
        surface: cream,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: UnderlineInputBorder(),
        enabledBorder: UnderlineInputBorder(
          borderSide: BorderSide(color: Color(0xFF7A9187)),
        ),
        focusedBorder: UnderlineInputBorder(
          borderSide: BorderSide(color: forest, width: 1.6),
        ),
        contentPadding: EdgeInsets.symmetric(vertical: 8),
        labelStyle: TextStyle(color: Color(0xFF52665D), fontSize: 13),
      ),
    );

class MobileCrypto {
  static const _secure = FlutterSecureStorage();
  static const _keyName = 'safiroute_waybill_key_v1';
  static const _prefix = 'enc1:';
  static final _cipher = AesGcm.with256bits();

  static Future<List<int>> _keyBytes() async {
    final existing = await _secure.read(key: _keyName);
    if (existing != null && existing.isNotEmpty) {
      final decoded = base64Url.decode(existing);
      if (decoded.length == 32) return decoded;
    }

    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    await _secure.write(key: _keyName, value: base64UrlEncode(bytes));
    return bytes;
  }

  static Future<String> encrypt(String plaintext) async {
    return encryptWithKey(plaintext, await _keyBytes());
  }

  static Future<String> decrypt(String payload) async {
    if (!payload.startsWith(_prefix)) return payload;
    return decryptWithKey(payload, await _keyBytes());
  }

  @visibleForTesting
  static Future<String> encryptWithKey(
    String plaintext,
    List<int> keyBytes,
  ) async {
    if (keyBytes.length != 32) {
      throw ArgumentError('SafiRoute local encryption requires a 256-bit key.');
    }
    final random = Random.secure();
    final nonce = List<int>.generate(12, (_) => random.nextInt(256));
    final box = await _cipher.encrypt(
      utf8.encode(plaintext),
      secretKey: SecretKey(keyBytes),
      nonce: nonce,
    );
    final packed = <int>[
      ...box.nonce,
      ...box.mac.bytes,
      ...box.cipherText,
    ];
    return '$_prefix${base64UrlEncode(packed)}';
  }

  @visibleForTesting
  static Future<String> decryptWithKey(
    String payload,
    List<int> keyBytes,
  ) async {
    if (!payload.startsWith(_prefix)) return payload;
    if (keyBytes.length != 32) {
      throw ArgumentError('SafiRoute local encryption requires a 256-bit key.');
    }
    final packed = base64Url.decode(payload.substring(_prefix.length));
    if (packed.length < 29) {
      throw StateError('Encrypted SafiRoute record is incomplete.');
    }
    final nonce = packed.sublist(0, 12);
    final mac = Mac(packed.sublist(12, 28));
    final cipherText = packed.sublist(28);
    final clear = await _cipher.decrypt(
      SecretBox(cipherText, nonce: nonce, mac: mac),
      secretKey: SecretKey(keyBytes),
    );
    return utf8.decode(clear);
  }
}

Map<String, dynamic> mobilePayload(Map<String, dynamic> waybill) {
  final items = ((waybill['items'] as List?) ?? const [])
      .whereType<Map>()
      .map(
        (line) => {
          'product_name': line['description']?.toString() ?? '',
          'notes': line['remarks']?.toString() ?? '',
        },
      )
      .where((line) => line['product_name'].toString().trim().isNotEmpty)
      .toList();

  return {
    'client_uuid': waybill['id'],
    'phone_number': waybill['localNumber'],
    'deliver_to': waybill['deliverTo'],
    'delivery_contact_name': waybill['contactName'],
    'contact_phone': waybill['contactPhone'],
    'delivery_address_text': waybill['address'],
    'document_date': waybill['documentDate'],
    'authorised_by_name': waybill['authorisedBy'],
    'authorised_remarks': waybill['authorisedRemarks'],
    'dispatched_by_name': waybill['dispatchedBy'],
    'received_by': waybill['receivedBy'],
    'items': items,
    'authorised_signature': waybill['authorisedSignature'],
    'dispatched_signature': waybill['dispatchedSignature'],
    'customer_signature': waybill['receivedSignature'],
    'lat': waybill['lat'],
    'lng': waybill['lng'],
    'gps_accuracy': waybill['gpsAccuracy'],
    'gps_captured_at': waybill['gpsCapturedAt'],
    'gps_unavailable_reason': waybill['gpsUnavailableReason'],
    'photo': waybill['photo'],
    'delivery_notes':
        "Authorised ${waybill['authorisedDate'] ?? ''}; "
        "Dispatched ${waybill['dispatchedDate'] ?? ''}; "
        "Received ${waybill['receivedDate'] ?? ''}",
    'device_timestamp': waybill['completedAt'] ?? waybill['updatedAt'],
  };
}

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  bool get isAuthenticationFailure => statusCode == 401 || statusCode == 403;

  @override
  String toString() => message;
}
class Api {
  static const _secure = FlutterSecureStorage();
  static const _apiKey = 'safiroute_api_base';

  static String normalise(String value) {
    var next = value.trim();
    while (next.endsWith('/')) {
      next = next.substring(0, next.length - 1);
    }
    return next.endsWith('/api') ? next : '$next/api';
  }

  static void validateBase(String value) {
    final uri = Uri.tryParse(normalise(value));
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw const FormatException('Enter a valid SafiRoute server URL.');
    }
    if (kReleaseMode &&
        !allowInsecureApi &&
        uri.scheme.toLowerCase() != 'https') {
      throw const FormatException(
        'Release builds require an HTTPS SafiRoute server.',
      );
    }
  }

  static Future<String> base() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_apiKey);
    final value =
        normalise(saved == null || saved.trim().isEmpty ? defaultApi : saved);
    validateBase(value);
    return value;
  }

  static Future<void> setBase(String value) async {
    validateBase(value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_apiKey, normalise(value));
  }

  static Future<String?> token() async {
    final value = await _secure.read(key: 'auth_token');
    if (value == null || value.isEmpty) return null;

    final rawExpiry = await _secure.read(key: 'auth_expires_at');
    final expiry = rawExpiry == null ? null : DateTime.tryParse(rawExpiry);
    if (expiry == null || !expiry.isAfter(DateTime.now().toUtc())) {
      await clearToken();
      return null;
    }
    return value;
  }

  static Future<void> clearToken({bool clearProfile = true}) async {
    await _secure.delete(key: 'auth_token');
    await _secure.delete(key: 'auth_expires_at');
    if (clearProfile) await _secure.delete(key: 'cached_sales_user');
  }

  static Future<Map<String, dynamic>?> cachedUser() async {
    final raw = await _secure.read(key: 'cached_sales_user');
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final user = Map<String, dynamic>.from(decoded);
      return user['role'] == 'sales' || user['role'] == 'admin' ? user : null;
    } catch (_) {
      await _secure.delete(key: 'cached_sales_user');
      return null;
    }
  }

  static Future<void> _cacheUser(Map<String, dynamic> user) async {
    await _secure.write(key: 'cached_sales_user', value: jsonEncode(user));
  }

  static Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
  }) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (auth) {
      final value = await token();
      if (value != null) headers['Authorization'] = 'Mobile $value';
    }

    final uri = Uri.parse('${await base()}$path');
    final http.Response response;
    if (method == 'POST') {
      response = await http
          .post(uri, headers: headers, body: jsonEncode(body ?? const {}))
          .timeout(const Duration(seconds: 25));
    } else {
      response = await http
          .get(uri, headers: headers)
          .timeout(const Duration(seconds: 25));
    }

    final decoded =
        response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
    final data = decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : <String, dynamic>{};
    if (response.statusCode >= 400) {
      throw ApiException(
        response.statusCode,
        data['detail']?.toString() ??
            'Request failed (${response.statusCode})',
      );
    }
    return data;
  }

  static Future<Map<String, dynamic>> login(
    String username,
    String password,
  ) async {
    final result = await request(
      'POST',
      '/auth/mobile-token/',
      body: {'username': username.trim(), 'password': password},
      auth: false,
    );
    final tokenValue = result['token']?.toString();
    if (tokenValue == null || tokenValue.isEmpty) {
      throw Exception('No login token returned.');
    }
    final expiresIn = (result['expires_in'] as num?)?.toInt() ?? 0;
    if (expiresIn <= 0) {
      throw Exception('Invalid mobile session lifetime.');
    }
    await _secure.write(key: 'auth_token', value: tokenValue);
    await _secure.write(
      key: 'auth_expires_at',
      value: DateTime.now()
          .toUtc()
          .add(Duration(seconds: expiresIn))
          .toIso8601String(),
    );

    try {
      final me = await request('GET', '/me/');
      if (me['role'] != 'sales' && me['role'] != 'admin') {
        await clearToken();
        throw Exception('The SafiRoute mobile app is for Sales users.');
      }
      await _cacheUser(me);
      return me;
    } catch (_) {
      await clearToken();
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> me() async {
    final user = await request('GET', '/me/');
    if (user['role'] == 'sales' || user['role'] == 'admin') {
      await _cacheUser(user);
    }
    return user;
  }

  static Future<Map<String, dynamic>> sync(Map<String, dynamic> waybill) {
    return request(
      'POST',
      '/mobile-waybills/ingest/',
      body: mobilePayload(waybill),
    );
  }
}

class Store {
  static Database? _db;

  static Future<Database> open() async {
    if (_db != null) return _db!;
    _db = await openDatabase(
      p.join(await getDatabasesPath(), 'safiroute.db'),
      version: 1,
      onCreate: (database, _) async {
        await database.execute(
          'CREATE TABLE waybills (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL)',
        );
      },
    );
    return _db!;
  }

  static Future<void> save(Map<String, dynamic> waybill) async {
    final database = await open();
    final protectedJson = await MobileCrypto.encrypt(jsonEncode(waybill));
    await database.insert(
      'waybills',
      {
        'id': waybill['id'],
        'json': protectedJson,
        'updated_at': waybill['updatedAt'],
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  static Future<List<Map<String, dynamic>>> all() async {
    final database = await open();
    final rows =
        await database.query('waybills', orderBy: 'updated_at DESC');
    final result = <Map<String, dynamic>>[];
    for (final row in rows) {
      try {
        final clear = await MobileCrypto.decrypt(row['json'] as String);
        result.add(
          Map<String, dynamic>.from(jsonDecode(clear) as Map),
        );
      } catch (_) {
        throw StateError(
          'A local SafiRoute waybill could not be decrypted. '
          'Do not clear app storage; contact the SafiRoute administrator.',
        );
      }
    }
    return result;
  }

  static Future<void> delete(String id) async {
    final database = await open();
    await database.delete(
      'waybills',
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}

String dateNow() => DateFormat('yyyy-MM-dd').format(DateTime.now());

Map<String, dynamic> blankWaybill(String salesName) {
  final id = const Uuid().v4();
  final now = DateTime.now().toUtc().toIso8601String();
  final suffix = id.split('-').first.substring(0, 5).toUpperCase();
  final localNumber = "SR-${dateNow().replaceAll('-', '')}-$suffix";

  return {
    'id': id,
    'localNumber': localNumber,
    'serverNumber': null,
    'createdAt': now,
    'updatedAt': now,
    'completedAt': null,
    'status': 'draft',
    'syncStatus': 'device_only',
    'syncError': '',
    'syncAttempts': 0,
    'nextRetryAt': null,
    'deliverTo': '',
    'documentDate': dateNow(),
    'contactName': '',
    'contactPhone': '',
    'address': '',
    'items': List.generate(4, (_) => {'description': '', 'remarks': ''}),
    'authorisedBy': salesName,
    'authorisedRemarks': '',
    'authorisedDate': dateNow(),
    'authorisedSignature': null,
    'dispatchedBy': '',
    'dispatchedDate': dateNow(),
    'dispatchedSignature': null,
    'receivedBy': '',
    'receivedDate': dateNow(),
    'receivedSignature': null,
    'lat': null,
    'lng': null,
    'gpsAccuracy': null,
    'gpsCapturedAt': null,
    'gpsUnavailableReason': '',
    'photo': null,
  };
}
