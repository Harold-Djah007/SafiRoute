import 'package:flutter/material.dart';

import 'core.dart';
import 'login.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SafiRouteApp());
}

class SafiRouteApp extends StatelessWidget {
  const SafiRouteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SafiRoute',
      debugShowCheckedModeBanner: false,
      theme: safiTheme(),
      home: const Gate(),
    );
  }
}
