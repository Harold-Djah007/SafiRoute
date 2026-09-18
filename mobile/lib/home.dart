import 'package:flutter/material.dart';

import 'core.dart';
import 'editor.dart';
import 'login.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage>
    with WidgetsBindingObserver {
  List<Map<String, dynamic>> rows = [];
  String salesName = 'Sales';
  bool syncing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    load();
    loadUser();
    syncPending();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) syncPending();
  }

  Future<void> load() async {
    final data = await Store.all();
    if (mounted) setState(() => rows = data);
  }

  Future<void> loadUser() async {
    try {
      final me = await Api.me();
      if (!mounted) return;
      final fullName = me['full_name']?.toString() ?? '';
      setState(() {
        salesName = fullName.trim().isNotEmpty
            ? fullName
            : me['username']?.toString() ?? 'Sales';
      });
    } catch (_) {}
  }

  Future<void> syncPending() async {
    if (syncing) return;
    setState(() => syncing = true);
    final local = await Store.all();
    for (final wb in local.where(
      (item) =>
          item['status'] == 'completed' &&
          item['syncStatus'] != 'synced',
    )) {
      try {
        final result = await Api.sync(wb);
        wb['syncStatus'] = 'synced';
        wb['syncError'] = '';
        wb['serverNumber'] = result['waybill_number'];
        wb['verificationToken'] = result['verification_token'];
      } catch (e) {
        wb['syncStatus'] = 'failed';
        wb['syncError'] = e.toString();
      }
      wb['updatedAt'] = DateTime.now().toUtc().toIso8601String();
      await Store.save(wb);
    }
    if (mounted) setState(() => syncing = false);
    await load();
  }

  Future<void> openEditor(Map<String, dynamic> waybill) async {
    final changed = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => Editor(waybill: waybill),
      ),
    );
    if (changed == true) {
      await load();
      await syncPending();
    }
  }

  Future<void> logout() async {
    await Api.clearToken();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final firstName = salesName.split(' ').first;
    final drafts =
        rows.where((item) => item['status'] == 'draft').length;
    final pending = rows
        .where(
          (item) =>
              item['status'] == 'completed' &&
              item['syncStatus'] != 'synced',
        )
        .length;
    final synced =
        rows.where((item) => item['syncStatus'] == 'synced').length;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: forestDark,
        foregroundColor: Colors.white,
        title: Row(
          children: [
            Image.asset('assets/safiroute-icon.png', width: 34),
            const SizedBox(width: 8),
            const Text('SafiRoute'),
          ],
        ),
        actions: [
          IconButton(
            onPressed: syncing ? null : syncPending,
            tooltip: 'Send pending waybills',
            icon: syncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.sync),
          ),
          IconButton(
            onPressed: logout,
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: gold,
        foregroundColor: forestDark,
        onPressed: () => openEditor(blankWaybill(salesName)),
        icon: const Icon(Icons.add),
        label: const Text(
          'New waybill',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await load();
          await syncPending();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 22, 18, 100),
          children: [
            Text(
              'Good day, ' + firstName,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: forest,
              ),
            ),
            const Text(
              'Sales waybills saved on this phone.',
              style: TextStyle(color: Color(0xFF607067)),
            ),
            const SizedBox(height: 16),
            const JourneyCard(),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(child: Stat(label: 'Drafts', value: drafts)),
                const SizedBox(width: 8),
                Expanded(
                  child: Stat(label: 'Waiting HQ', value: pending),
                ),
                const SizedBox(width: 8),
                Expanded(child: Stat(label: 'On HQ', value: synced)),
              ],
            ),
            const SizedBox(height: 22),
            const Text(
              'Saved waybills',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: forestDark,
              ),
            ),
            const SizedBox(height: 10),
            if (rows.isEmpty)
              const Padding(
                padding: EdgeInsets.all(26),
                child: Center(
                  child: Text('No waybills on this phone yet.'),
                ),
              ),
            ...rows.map(
              (waybill) => Card(
                child: ListTile(
                  onTap: () => openEditor(waybill),
                  title: Text(
                    (waybill['deliverTo'] ?? '')
                            .toString()
                            .trim()
                            .isEmpty
                        ? 'Untitled draft'
                        : waybill['deliverTo'].toString(),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  subtitle: Text(
                    (waybill['serverNumber'] ??
                            waybill['localNumber'] ??
                            '')
                        .toString(),
                  ),
                  trailing: Text(
                    waybill['syncStatus'] == 'synced'
                        ? 'On HQ'
                        : waybill['status'] == 'completed'
                            ? 'Waiting HQ'
                            : 'Draft',
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class JourneyCard extends StatefulWidget {
  const JourneyCard({super.key});

  @override
  State<JourneyCard> createState() => _JourneyCardState();
}

class _JourneyCardState extends State<JourneyCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController controller;

  @override
  void initState() {
    super.initState();
    controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: forestDark,
          borderRadius: BorderRadius.circular(22),
        ),
        child: AnimatedBuilder(
          animation: controller,
          builder: (_, __) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'SALE → SIGNED → VERIFIED',
                style: TextStyle(
                  color: Color(0xFFF0C83F),
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'A waybill that travels with the sale.',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              LayoutBuilder(
                builder: (_, box) => SizedBox(
                  height: 42,
                  child: Stack(
                    children: [
                      Positioned(
                        left: 10,
                        right: 10,
                        top: 20,
                        child: Container(
                          height: 2,
                          color: Colors.white24,
                        ),
                      ),
                      Positioned(
                        left: (box.maxWidth - 42) * controller.value,
                        top: 0,
                        child: Container(
                          width: 34,
                          height: 40,
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFFAF0),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: const Icon(
                            Icons.description,
                            color: forest,
                            size: 20,
                          ),
                        ),
                      ),
                      const Positioned(
                        right: 0,
                        top: 3,
                        child: Icon(
                          Icons.verified,
                          color: Color(0xFF88CC2A),
                          size: 30,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

class Stat extends StatelessWidget {
  const Stat({
    required this.label,
    required this.value,
    super.key,
  });

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBF1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2D8BC)),
        ),
        child: Column(
          children: [
            Text(
              value.toString(),
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: forest,
              ),
            ),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 10),
            ),
          ],
        ),
      );
}
