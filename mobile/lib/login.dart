import 'package:flutter/material.dart';

import 'core.dart';
import 'home.dart';

class Gate extends StatefulWidget {
  const Gate({super.key});

  @override
  State<Gate> createState() => _GateState();
}

class _GateState extends State<Gate> {
  bool ready = false;
  bool signedIn = false;

  @override
  void initState() {
    super.initState();
    check();
  }

  Future<void> check() async {
    final token = await Api.token();
    if (token != null) {
      try {
        final me = await Api.me();
        signedIn = me['role'] == 'sales' || me['role'] == 'admin';
      } on ApiException catch (error) {
        if (error.isAuthenticationFailure) {
          await Api.clearToken();
        } else {
          final cached = await Api.cachedUser();
          signedIn = cached != null;
        }
      } catch (_) {
        final cached = await Api.cachedUser();
        signedIn = cached != null;
      }
    }
    if (mounted) setState(() => ready = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: forest)),
      );
    }
    return signedIn ? const HomePage() : const LoginPage();
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final username = TextEditingController(text: 'sales');
  final password = TextEditingController(text: 'safiroute');
  final server = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    Api.base().then((value) {
      if (mounted) server.text = value;
    });
  }

  @override
  void dispose() {
    username.dispose();
    password.dispose();
    server.dispose();
    super.dispose();
  }

  Future<void> login() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await Api.setBase(server.text);
      await Api.login(username.text, password.text);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomePage()),
      );
    } catch (e) {
      setState(
        () => error = e.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(28),
            children: [
              Image.asset(
                'assets/safiroute-icon.png',
                width: 64,
                height: 64,
                alignment: Alignment.centerLeft,
              ),
              const SizedBox(height: 18),
              const Text(
                'SafiRoute',
                style: TextStyle(
                  fontSize: 38,
                  fontWeight: FontWeight.w800,
                  color: forestDark,
                ),
              ),
              const Text(
                'EVERY DELIVERY. VERIFIED.',
                style: TextStyle(
                  color: gold,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.7,
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 30),
              const Text(
                'Sales waybill pad',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: forest,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Create, sign and save waybills even when coverage drops.',
                style: TextStyle(color: Color(0xFF607067)),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: username,
                decoration: const InputDecoration(labelText: 'Username'),
              ),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
              ),
              TextField(
                controller: server,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'SafiRoute server',
                  helperText:
                      'Android emulator: http://10.0.2.2:8000/api',
                ),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    error!,
                    style: const TextStyle(
                      color: Colors.red,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: busy ? null : login,
                style: FilledButton.styleFrom(
                  backgroundColor: forest,
                  minimumSize: const Size.fromHeight(52),
                ),
                child: Text(busy ? 'Signing in…' : 'Open SafiRoute'),
              ),
            ],
          ),
        ),
      );
}
