import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:signature/signature.dart';

import 'core.dart';

class Editor extends StatefulWidget {
  const Editor({required this.waybill, super.key});

  final Map<String, dynamic> waybill;

  @override
  State<Editor> createState() => _EditorState();
}

class _EditorState extends State<Editor> {
  late Map<String, dynamic> waybill;
  late final TextEditingController deliverTo;
  late final TextEditingController contactName;
  late final TextEditingController contactPhone;
  late final TextEditingController address;
  late final TextEditingController authorisedBy;
  late final TextEditingController authorisedRemarks;
  late final TextEditingController dispatchedBy;
  late final TextEditingController receivedBy;
  late List<TextEditingController> descriptions;
  late List<TextEditingController> remarks;
  late final SignatureController authorisedPad;
  late final SignatureController dispatchedPad;
  late final SignatureController receivedPad;

  Timer? autosave;
  bool busy = false;
  bool gpsBusy = false;
  String? error;

  bool get locked => waybill['status'] == 'completed';

  @override
  void initState() {
    super.initState();
    waybill = Map<String, dynamic>.from(widget.waybill);
    deliverTo = TextEditingController(
      text: waybill['deliverTo']?.toString() ?? '',
    );
    contactName = TextEditingController(
      text: waybill['contactName']?.toString() ?? '',
    );
    contactPhone = TextEditingController(
      text: waybill['contactPhone']?.toString() ?? '',
    );
    address = TextEditingController(
      text: waybill['address']?.toString() ?? '',
    );
    authorisedBy = TextEditingController(
      text: waybill['authorisedBy']?.toString() ?? '',
    );
    authorisedRemarks = TextEditingController(
      text: waybill['authorisedRemarks']?.toString() ?? '',
    );
    dispatchedBy = TextEditingController(
      text: waybill['dispatchedBy']?.toString() ?? '',
    );
    receivedBy = TextEditingController(
      text: waybill['receivedBy']?.toString() ?? '',
    );

    final lines = ((waybill['items'] as List?) ?? const [])
        .map((line) => Map<String, dynamic>.from(line as Map))
        .toList();
    if (lines.isEmpty) {
      lines.addAll(
        List.generate(
          4,
          (_) => {'description': '', 'remarks': ''},
        ),
      );
    }
    descriptions = lines
        .map(
          (line) => TextEditingController(
            text: line['description']?.toString() ?? '',
          ),
        )
        .toList();
    remarks = lines
        .map(
          (line) => TextEditingController(
            text: line['remarks']?.toString() ?? '',
          ),
        )
        .toList();

    authorisedPad = SignatureController(
      penStrokeWidth: 2.4,
      penColor: forestDark,
    );
    dispatchedPad = SignatureController(
      penStrokeWidth: 2.4,
      penColor: forestDark,
    );
    receivedPad = SignatureController(
      penStrokeWidth: 2.4,
      penColor: forestDark,
    );
  }

  @override
  void dispose() {
    autosave?.cancel();
    for (final controller in [
      deliverTo,
      contactName,
      contactPhone,
      address,
      authorisedBy,
      authorisedRemarks,
      dispatchedBy,
      receivedBy,
      ...descriptions,
      ...remarks,
    ]) {
      controller.dispose();
    }
    authorisedPad.dispose();
    dispatchedPad.dispose();
    receivedPad.dispose();
    super.dispose();
  }

  void changed([String? _]) {
    if (locked) return;
    autosave?.cancel();
    autosave = Timer(
      const Duration(milliseconds: 700),
      () => saveDraft(silent: true),
    );
  }

  bool meaningful() =>
      deliverTo.text.trim().isNotEmpty ||
      address.text.trim().isNotEmpty ||
      descriptions.any((controller) => controller.text.trim().isNotEmpty);

  Future<String?> signatureData(
    SignatureController controller,
    dynamic existing,
  ) async {
    if (controller.isEmpty) {
      return existing is String ? existing : null;
    }
    final bytes = await controller.toPngBytes();
    if (bytes == null) return null;
    return 'data:image/png;base64,' + base64Encode(bytes);
  }

  Future<Map<String, dynamic>> snapshot() async {
    waybill['deliverTo'] = deliverTo.text.trim();
    waybill['contactName'] = contactName.text.trim();
    waybill['contactPhone'] = contactPhone.text.trim();
    waybill['address'] = address.text.trim();
    waybill['authorisedBy'] = authorisedBy.text.trim();
    waybill['authorisedRemarks'] = authorisedRemarks.text.trim();
    waybill['dispatchedBy'] = dispatchedBy.text.trim();
    waybill['receivedBy'] = receivedBy.text.trim();
    waybill['items'] = List.generate(
      descriptions.length,
      (index) => {
        'description': descriptions[index].text.trim(),
        'remarks': remarks[index].text.trim(),
      },
    );
    waybill['authorisedSignature'] = await signatureData(
      authorisedPad,
      waybill['authorisedSignature'],
    );
    waybill['dispatchedSignature'] = await signatureData(
      dispatchedPad,
      waybill['dispatchedSignature'],
    );
    waybill['receivedSignature'] = await signatureData(
      receivedPad,
      waybill['receivedSignature'],
    );
    waybill['updatedAt'] = DateTime.now().toUtc().toIso8601String();
    return waybill;
  }

  Future<void> saveDraft({bool silent = false}) async {
    if (locked || !meaningful()) return;
    final next = await snapshot();
    next['status'] = 'draft';
    next['syncStatus'] = 'device_only';
    await Store.save(next);
    if (!silent && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Draft saved on this phone.'),
        ),
      );
    }
  }

  List<String> missing() {
    final values = <String>[];
    if (deliverTo.text.trim().isEmpty) values.add('Deliver to');
    if (address.text.trim().isEmpty) values.add('Address');
    if (!descriptions.any(
      (controller) => controller.text.trim().isNotEmpty,
    )) {
      values.add('Description');
    }
    if (authorisedBy.text.trim().isEmpty) {
      values.add('Authorised by');
    }
    if (authorisedPad.isEmpty &&
        waybill['authorisedSignature'] == null) {
      values.add('Authorised signature');
    }
    if (dispatchedBy.text.trim().isEmpty) {
      values.add('Dispatched by');
    }
    if (dispatchedPad.isEmpty &&
        waybill['dispatchedSignature'] == null) {
      values.add('Dispatch signature');
    }
    if (receivedBy.text.trim().isEmpty) {
      values.add('Received by');
    }
    if (receivedPad.isEmpty &&
        waybill['receivedSignature'] == null) {
      values.add('Received signature');
    }
    return values;
  }

  Future<void> complete() async {
    final missingValues = missing();
    if (missingValues.isNotEmpty) {
      setState(
        () => error = 'Please add: ' + missingValues.join(', ') + '.',
      );
      return;
    }

    setState(() {
      busy = true;
      error = null;
    });

    try {
      final next = await snapshot();
      next['status'] = 'completed';
      next['syncStatus'] = 'pending';
      next['completedAt'] =
          DateTime.now().toUtc().toIso8601String();
      await Store.save(next);

      try {
        final result = await Api.sync(next);
        next['syncStatus'] = 'synced';
        next['syncError'] = '';
        next['serverNumber'] = result['waybill_number'];
        next['verificationToken'] =
            result['verification_token'];
      } catch (e) {
        next['syncStatus'] = 'failed';
        next['syncError'] = e.toString();
      }

      next['updatedAt'] =
          DateTime.now().toUtc().toIso8601String();
      await Store.save(next);

      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(
        () => error = e.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> pickDate(String key) async {
    if (locked) return;
    final selected = await showDatePicker(
      context: context,
      initialDate:
          DateTime.tryParse(waybill[key]?.toString() ?? '') ??
              DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (selected == null) return;
    setState(
      () => waybill[key] =
          DateFormat('yyyy-MM-dd').format(selected),
    );
    changed();
  }

  Future<void> captureGps() async {
    setState(() => gpsBusy = true);
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('Location permission unavailable.');
      }
      final position = await Geolocator.getCurrentPosition();
      setState(() {
        waybill['lat'] = position.latitude;
        waybill['lng'] = position.longitude;
        waybill['gpsAccuracy'] = position.accuracy;
        waybill['gpsCapturedAt'] =
            DateTime.now().toUtc().toIso8601String();
        waybill['gpsUnavailableReason'] = '';
      });
      changed();
    } catch (e) {
      setState(
        () => waybill['gpsUnavailableReason'] =
            e.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) setState(() => gpsBusy = false);
    }
  }

  Future<void> capturePhoto() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 75,
      maxWidth: 1600,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(
      () => waybill['photo'] =
          'data:image/jpeg;base64,' + base64Encode(bytes),
    );
    changed();
  }

  Future<void> removeDraft() async {
    await Store.delete(waybill['id'].toString());
    if (mounted) Navigator.pop(context, true);
  }

  Widget dateLine(String label, String key) => InkWell(
        onTap: locked ? null : () => pickDate(key),
        child: InputDecorator(
          decoration: InputDecoration(labelText: label),
          child: Text(
            waybill[key]?.toString() ?? dateNow(),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final displayedNumber =
        waybill['serverNumber'] ?? waybill['localNumber'];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: forestDark,
        foregroundColor: Colors.white,
        title: Text(locked ? 'Waybill' : 'New waybill'),
        actions: [
          if (!locked && meaningful())
            IconButton(
              tooltip: 'Delete draft',
              onPressed: removeDraft,
              icon: const Icon(Icons.delete_outline),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 16, 14, 110),
        children: [
          Container(
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              color: paper,
              border: Border.all(
                color: const Color(0xFF8BA59B),
              ),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Image.asset(
                      'assets/safiroute-icon.png',
                      width: 40,
                    ),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Safisana Ghana Limited',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: forest,
                            ),
                          ),
                          Text(
                            'WAYBILL',
                            style: TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.w900,
                              color: forestDark,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      displayedNumber.toString(),
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: deliverTo,
                  enabled: !locked,
                  onChanged: changed,
                  decoration:
                      const InputDecoration(labelText: 'Deliver to *'),
                ),
                dateLine('Date', 'documentDate'),
                TextField(
                  controller: contactName,
                  enabled: !locked,
                  onChanged: changed,
                  decoration: const InputDecoration(
                    labelText: 'Delivery Contact Name',
                  ),
                ),
                TextField(
                  controller: contactPhone,
                  enabled: !locked,
                  onChanged: changed,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Contact Phone',
                  ),
                ),
                TextField(
                  controller: address,
                  enabled: !locked,
                  onChanged: changed,
                  maxLines: 2,
                  decoration:
                      const InputDecoration(labelText: 'Address *'),
                ),
                const SizedBox(height: 20),
                const Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: Text(
                        'Description',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Remarks',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                ...List.generate(
                  descriptions.length,
                  (index) => Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: TextField(
                          controller: descriptions[index],
                          enabled: !locked,
                          onChanged: changed,
                          decoration: InputDecoration(
                            labelText:
                                'Line ' + (index + 1).toString(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: remarks[index],
                          enabled: !locked,
                          onChanged: changed,
                        ),
                      ),
                    ],
                  ),
                ),
                if (!locked)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () {
                        setState(() {
                          descriptions.add(
                            TextEditingController(),
                          );
                          remarks.add(
                            TextEditingController(),
                          );
                        });
                        changed();
                      },
                      icon: const Icon(Icons.add),
                      label: const Text('Add line'),
                    ),
                  ),
                const SizedBox(height: 18),
                TextField(
                  controller: authorisedBy,
                  enabled: !locked,
                  onChanged: changed,
                  decoration: const InputDecoration(
                    labelText: 'Authorised by *',
                  ),
                ),
                SignLine(
                  label: 'Signature *',
                  controller: authorisedPad,
                  locked: locked,
                  existing: waybill['authorisedSignature'],
                ),
                dateLine('Date', 'authorisedDate'),
                TextField(
                  controller: authorisedRemarks,
                  enabled: !locked,
                  onChanged: changed,
                  decoration:
                      const InputDecoration(labelText: 'Remarks'),
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: dispatchedBy,
                  enabled: !locked,
                  onChanged: changed,
                  decoration: const InputDecoration(
                    labelText: 'Dispatched by *',
                  ),
                ),
                SignLine(
                  label: 'Signature *',
                  controller: dispatchedPad,
                  locked: locked,
                  existing: waybill['dispatchedSignature'],
                ),
                dateLine('Date', 'dispatchedDate'),
                const SizedBox(height: 18),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'I certify that I have received the above items.',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                TextField(
                  controller: receivedBy,
                  enabled: !locked,
                  onChanged: changed,
                  decoration: const InputDecoration(
                    labelText: 'Received by *',
                  ),
                ),
                SignLine(
                  label: 'Signature *',
                  controller: receivedPad,
                  locked: locked,
                  existing: waybill['receivedSignature'],
                ),
                dateLine('Date', 'receivedDate'),
              ],
            ),
          ),
          const SizedBox(height: 8),
          ExpansionTile(
            title: const Text(
              'Digital proof (optional)',
              style: TextStyle(
                color: forest,
                fontWeight: FontWeight.w700,
              ),
            ),
            subtitle: const Text(
              'GPS and photo stay out of the paper form.',
            ),
            children: [
              ListTile(
                leading: const Icon(
                  Icons.my_location,
                  color: forest,
                ),
                title: const Text('GPS location'),
                subtitle: Text(
                  waybill['lat'] == null
                      ? 'Not captured'
                      : (waybill['lat'] as num)
                              .toStringAsFixed(5) +
                          ', ' +
                          (waybill['lng'] as num)
                              .toStringAsFixed(5),
                ),
                trailing: locked
                    ? null
                    : TextButton(
                        onPressed:
                            gpsBusy ? null : captureGps,
                        child: Text(
                          gpsBusy ? 'Locating…' : 'Capture',
                        ),
                      ),
              ),
              ListTile(
                leading: const Icon(
                  Icons.camera_alt_outlined,
                  color: forest,
                ),
                title: const Text('Delivery photo'),
                subtitle: Text(
                  waybill['photo'] == null
                      ? 'Not captured'
                      : 'Saved on this phone',
                ),
                trailing: locked
                    ? null
                    : TextButton(
                        onPressed: capturePhoto,
                        child: Text(
                          waybill['photo'] == null
                              ? 'Camera'
                              : 'Retake',
                        ),
                      ),
              ),
            ],
          ),
          if (locked)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: waybill['syncStatus'] == 'synced'
                      ? const Color(0xFFE0F4E1)
                      : const Color(0xFFFFF0B8),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  waybill['syncStatus'] == 'synced'
                      ? 'Verified on HQ as ' +
                          (waybill['serverNumber'] ?? 'accepted')
                              .toString()
                      : 'Completed on this phone. Waiting to send to HQ.',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(
                error!,
                style: const TextStyle(
                  color: Colors.red,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: locked
          ? SafeArea(
              minimum: const EdgeInsets.all(12),
              child: FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Back'),
              ),
            )
          : SafeArea(
              minimum: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed:
                          busy ? null : () => saveDraft(),
                      child: const Text('Save draft'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: busy ? null : complete,
                      style: FilledButton.styleFrom(
                        backgroundColor: forest,
                      ),
                      child: Text(
                        busy
                            ? 'Saving…'
                            : 'Complete waybill',
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class SignLine extends StatelessWidget {
  const SignLine({
    required this.label,
    required this.controller,
    required this.locked,
    required this.existing,
    super.key,
  });

  final String label;
  final SignatureController controller;
  final bool locked;
  final dynamic existing;

  Uint8List? get bytes {
    if (existing is! String ||
        !(existing as String).contains(',')) {
      return null;
    }
    try {
      return base64Decode(
        (existing as String).split(',').last,
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Color(0xFF52665D),
              ),
            ),
            SizedBox(
              height: 72,
              child: Stack(
                children: [
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 14,
                    child: Container(
                      height: 1,
                      color: const Color(0xFF5E746A),
                    ),
                  ),
                  if (locked && bytes != null)
                    Positioned.fill(
                      child: Image.memory(
                        bytes!,
                        fit: BoxFit.contain,
                      ),
                    )
                  else
                    Signature(
                      controller: controller,
                      backgroundColor: Colors.transparent,
                      height: 72,
                    ),
                  if (!locked)
                    const Positioned(
                      right: 0,
                      bottom: 0,
                      child: Text(
                        'SIGN HERE',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF87958E),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
}
