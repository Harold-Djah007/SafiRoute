import 'package:flutter_test/flutter_test.dart';
import 'package:safiroute/core.dart';
import 'package:safiroute/main.dart';

void main() {
  test('SafiRoute app can be constructed', () {
    const app = SafiRouteApp();
    expect(app, isA<SafiRouteApp>());
  });

  test('API URLs are normalized to one /api suffix', () {
    expect(Api.normalise('https://waybill.example.com'), 'https://waybill.example.com/api');
    expect(Api.normalise('https://waybill.example.com/'), 'https://waybill.example.com/api');
    expect(Api.normalise('https://waybill.example.com/api/'), 'https://waybill.example.com/api');
  });

  test('new native waybill is Sales-first and starts as an offline draft', () {
    final waybill = blankWaybill('Ama Mensah');
    expect(waybill['status'], 'draft');
    expect(waybill['syncStatus'], 'device_only');
    expect(waybill['authorisedBy'], 'Ama Mensah');
    expect(waybill['items'], isA<List>());
    expect((waybill['items'] as List).length, 4);
    expect(waybill.containsKey('driver'), isFalse);
    expect(waybill.containsKey('assignment'), isFalse);
  });

  test('mobile payload maps the Safisana paper-waybill fields only', () {
    final waybill = blankWaybill('Ama Mensah')
      ..['deliverTo'] = 'Accra Customer'
      ..['address'] = 'Accra'
      ..['contactName'] = 'Kojo'
      ..['contactPhone'] = '0240000000'
      ..['dispatchedBy'] = 'Ama Mensah'
      ..['receivedBy'] = 'Customer'
      ..['items'] = [
        {'description': 'Compost bags', 'remarks': 'Good condition'},
      ];

    final payload = mobilePayload(waybill);
    expect(payload['deliver_to'], 'Accra Customer');
    expect(payload['authorised_by_name'], 'Ama Mensah');
    expect(payload['dispatched_by_name'], 'Ama Mensah');
    expect(payload['received_by'], 'Customer');
    expect((payload['items'] as List).single['product_name'], 'Compost bags');
    expect(payload.containsKey('driver_id'), isFalse);
  });

  test('local waybill encryption round-trips and rejects the wrong key', () async {
    final key = List<int>.generate(32, (index) => index);
    final wrongKey = List<int>.generate(32, (index) => 31 - index);
    const clear = '{"customer":"Safisana","signature":"captured"}';

    final protected = await MobileCrypto.encryptWithKey(clear, key);
    expect(protected, startsWith('enc1:'));
    expect(protected, isNot(contains('Safisana')));
    expect(await MobileCrypto.decryptWithKey(protected, key), clear);

    expect(
      () => MobileCrypto.decryptWithKey(protected, wrongKey),
      throwsA(anything),
    );
  });
}
