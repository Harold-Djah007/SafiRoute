import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:signature/signature.dart';
import 'package:uuid/uuid.dart';

const apiBase = String.fromEnvironment(
  'SAFIROUTE_API',
  defaultValue: 'http://127.0.0.1:8000/api',
);

const forest = Color(0xFF0F5C2E);
const gold = Color(0xFFC9A227);
const cream = Color(0xFFF4EFE2);

void main() {
  runApp(const SafiRouteApp());
}

class SafiRouteApp extends StatelessWidget {
  const SafiRouteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SafiRoute',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: forest, surface: cream),
        scaffoldBackgroundColor: cream,
        useMaterial3: true,
      ),
      home: const Gate(),
    );
  }
}

class Api {
  static Future<String?> token() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  static Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    bool auth = false,
  }) async {
    final headers = {'Content-Type': 'application/json'};
    if (auth) {
      final t = await token();
      if (t != null) headers['Authorization'] = 'Token $t';
    }
    final res = await http.post(
      Uri.parse('$apiBase$path'),
      headers: headers,
      body: jsonEncode(body ?? {}),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(data['detail'] ?? 'Request failed');
    }
    return data is Map<String, dynamic> ? data : {'data': data};
  }

  static Future<Map<String, dynamic>> get(String path) async {
    final t = await token();
    final res = await http.get(
      Uri.parse('$apiBase$path'),
      headers: {'Authorization': 'Token $t'},
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(data['detail'] ?? 'Request failed');
    }
    return data is Map<String, dynamic> ? data : {'data': data};
  }
}

class Gate extends StatefulWidget {
  const Gate({super.key});
  @override
  State<Gate> createState() => _GateState();
}

class _GateState extends State<Gate> {
  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((prefs) {
      if (!mounted) return;
      if (prefs.getString('token') != null) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const AssignmentsPage()),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) => const LoginPage();
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final user = TextEditingController(text: 'driver');
  final pass = TextEditingController(text: 'safiroute');
  String? error;
  bool busy = false;

  Future<void> login() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final data = await Api.post(
        '/auth/login/',
        body: {'username': user.text, 'password': pass.text},
      );
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', data['token']);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const AssignmentsPage()),
      );
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 48),
            const Text('SafiRoute',
                style: TextStyle(
                    fontSize: 36, fontWeight: FontWeight.w700, color: forest)),
            const Text('Every delivery. Verified.',
                style: TextStyle(color: gold, letterSpacing: 1.2)),
            const SizedBox(height: 32),
            TextField(controller: user, decoration: const InputDecoration(labelText: 'Username')),
            TextField(
              controller: pass,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(error!, style: const TextStyle(color: Colors.red)),
              ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : login,
                style: FilledButton.styleFrom(backgroundColor: forest),
                child: Text(busy ? 'Signing in…' : 'Open assignments'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AssignmentsPage extends StatefulWidget {
  const AssignmentsPage({super.key});
  @override
  State<AssignmentsPage> createState() => _AssignmentsPageState();
}

class _AssignmentsPageState extends State<AssignmentsPage> {
  List results = [];
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final data = await Api.get('/waybills/');
      setState(() {
        results = (data['results'] as List).where((row) {
          return ['loaded', 'dispatched', 'in_transit'].contains(row['status']);
        }).toList();
      });
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: forest,
        foregroundColor: cream,
        title: const Text('Field deliveries'),
      ),
      body: error != null
          ? Center(child: Text(error!))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: results.length,
              itemBuilder: (context, index) {
                final row = results[index];
                return Card(
                  child: ListTile(
                    title: Text(row['waybill_number']),
                    subtitle: Text(row['customer_name'] ?? ''),
                    trailing: Text(row['status_display'] ?? ''),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => DeliveryPage(id: row['id']),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class DeliveryPage extends StatefulWidget {
  const DeliveryPage({required this.id, super.key});
  final int id;
  @override
  State<DeliveryPage> createState() => _DeliveryPageState();
}

class _DeliveryPageState extends State<DeliveryPage> {
  Map<String, dynamic>? wb;
  final rep = TextEditingController();
  final notes = TextEditingController();
  final customerPad = SignatureController(penStrokeWidth: 2, penColor: forest);
  final driverPad = SignatureController(penStrokeWidth: 2, penColor: forest);
  XFile? photo;
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    Api.get('/waybills/${widget.id}/').then((data) => setState(() => wb = data));
  }

  Future<void> complete() async {
    if (wb == null) return;
    setState(() => busy = true);
    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition();
      } catch (_) {}
      final t = await Api.token();
      final req = http.MultipartRequest(
        'POST',
        Uri.parse('$apiBase/waybills/${widget.id}/complete_delivery/'),
      );
      req.headers['Authorization'] = 'Token $t';
      req.fields['outcome'] = 'delivered';
      req.fields['customer_rep_name'] = rep.text;
      req.fields['customer_rep_role'] = 'Receiver';
      req.fields['delivery_notes'] = notes.text;
      req.fields['client_uuid'] = const Uuid().v4();
      req.fields['device_timestamp'] = DateTime.now().toUtc().toIso8601String();
      req.fields['items'] = jsonEncode([
        for (final item in wb!['items'])
          {
            'id': item['id'],
            'delivered_qty': item['loaded_qty'] ?? item['ordered_qty'],
            'rejected_qty': '0',
          }
      ]);
      if (pos != null) {
        req.fields['lat'] = pos.latitude.toString();
        req.fields['lng'] = pos.longitude.toString();
        req.fields['gps_accuracy'] = pos.accuracy.toString();
      } else {
        req.fields['gps_unavailable_reason'] = 'GPS unavailable';
      }
      final cBytes = await customerPad.toPngBytes();
      final dBytes = await driverPad.toPngBytes();
      if (cBytes != null) {
        req.files.add(http.MultipartFile.fromBytes('customer_signature', cBytes, filename: 'c.png'));
      }
      if (dBytes != null) {
        req.files.add(http.MultipartFile.fromBytes('driver_signature', dBytes, filename: 'd.png'));
      }
      if (photo != null) {
        req.files.add(await http.MultipartFile.fromPath('photos', photo!.path));
      }
      final res = await req.send();
      if (res.statusCode >= 400) {
        throw Exception(await res.stream.bytesToString());
      }
      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (wb == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(
        backgroundColor: forest,
        foregroundColor: cream,
        title: Text(wb!['waybill_number']),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(wb!['customer_detail']?['name'] ?? '', style: const TextStyle(fontSize: 18)),
          const SizedBox(height: 12),
          TextField(controller: rep, decoration: const InputDecoration(labelText: 'Received by')),
          TextField(controller: notes, decoration: const InputDecoration(labelText: 'Notes')),
          const SizedBox(height: 12),
          const Text('Customer signature'),
          SizedBox(height: 120, child: Signature(controller: customerPad, backgroundColor: Colors.white)),
          const Text('Driver signature'),
          SizedBox(height: 120, child: Signature(controller: driverPad, backgroundColor: Colors.white)),
          TextButton(
            onPressed: () async {
              photo = await ImagePicker().pickImage(source: ImageSource.camera);
              setState(() {});
            },
            child: Text(photo == null ? 'Capture delivery photo' : 'Photo attached'),
          ),
          if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
          FilledButton(
            onPressed: busy ? null : complete,
            style: FilledButton.styleFrom(backgroundColor: forest),
            child: Text(busy ? 'Syncing…' : 'Complete delivery'),
          ),
        ],
      ),
    );
  }
}
