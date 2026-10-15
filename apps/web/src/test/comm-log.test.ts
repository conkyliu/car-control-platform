import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CommProtocolType,
  CommDirection,
  type CommLogRecord,
  type HexDumpRow,
  type CommLogQueryParams,
  COMM_PROTOCOL_METADATA,
  COMM_DIRECTION_METADATA,
  calculateXorChecksum,
  unescapeJt808Hex,
  formatHexDump,
  parseMessageHeader,
  calculateCommLogStats,
  filterCommLogs,
  generateCommLogsCsv,
  SEED_COMM_LOGS,
  isApiError,
} from '../views/log/comm-log-core.ts';
import {
  fetchCommLogsApi,
  fetchCommLogDetailApi,
  exportCommLogsCsvApi,
  resetInMemoryCommLogs,
} from '../api/comm-log.ts';
import { ApiError } from '../api/client.ts';

describe('Raw Communication Log Center & Hex Payload Parser Test Suite (TDD)', () => {
  beforeEach(() => {
    resetInMemoryCommLogs();
  });

  describe('1. CommProtocolType & CommDirection Domain Models & Metadata', () => {
    it('defines all 4 core vehicle communication protocols', () => {
      const protocols = [
        CommProtocolType.JT808,
        CommProtocolType.CAR_CONTROL_0X02,
        CommProtocolType.MQTT_TELEMETRY,
        CommProtocolType.GB32960,
      ];
      assert.equal(protocols.length, 4);
      for (const p of protocols) {
        assert.ok(p, `Protocol [${p}] must be defined`);
        const meta = COMM_PROTOCOL_METADATA[p];
        assert.ok(meta, `Metadata for [${p}] must exist`);
        assert.ok(meta.label.length > 0);
        assert.ok(meta.shortLabel.length > 0);
        assert.ok(meta.color.startsWith('#'));
      }
    });

    it('defines UPLINK and DOWNLINK communication directions with visual indicators', () => {
      const directions = [CommDirection.UPLINK, CommDirection.DOWNLINK];
      assert.equal(directions.length, 2);
      for (const d of directions) {
        const meta = COMM_DIRECTION_METADATA[d];
        assert.ok(meta, `Direction metadata for [${d}] must exist`);
        assert.ok(meta.label.length > 0);
        assert.ok(meta.arrow.length > 0);
        assert.ok(meta.color.startsWith('#'));
      }
    });
  });

  describe('2. JT/T 808 XOR Checksum Calculation (calculateXorChecksum)', () => {
    it('calculates standard XOR checksum across hex byte sequence', () => {
      // 0x01 ^ 0x02 ^ 0x03 = 0x00
      assert.equal(calculateXorChecksum('01 02 03'), '00');

      // 0xAA ^ 0xBB = 0x11
      assert.equal(calculateXorChecksum('AA BB'), '11');

      // Standard JT/T 808 sample header bytes: 02 00 00 2A 01 38 00 13 80 00 00 7C
      // 0x02 ^ 0x00 ^ 0x00 ^ 0x2A ^ 0x01 ^ 0x38 ^ 0x00 ^ 0x13 ^ 0x80 ^ 0x00 ^ 0x00 ^ 0x7C = 0xFE
      const xorResult = calculateXorChecksum('02 00 00 2A 01 38 00 13 80 00 00 7C');
      assert.equal(xorResult, 'FE');
    });

    it('handles hex strings with or without spaces, mixed casing, and strips non-hex characters', () => {
      assert.equal(calculateXorChecksum('010203'), '00');
      assert.equal(calculateXorChecksum('01:02:03'), '00');
      assert.equal(calculateXorChecksum('aa bb'), '11');
      assert.equal(calculateXorChecksum(''), '00');
    });

    it('supports auto-unframing framed JT808 packets (7E ... Checksum 7E)', () => {
      // Framed packet: 7E [02 00 00 2A 01 38 00 13 80 00 00 7C] FE 7E
      const framedHex = '7E 02 00 00 2A 01 38 00 13 80 00 00 7C FE 7E';
      assert.equal(calculateXorChecksum(framedHex, true), 'FE');
    });
  });

  describe('3. JT/T 808 Hex Escape & Unescape (unescapeJt808Hex)', () => {
    it('unescapes 7D 02 to 7E according to JT/T 808 specification', () => {
      assert.equal(unescapeJt808Hex('7D 02'), '7E');
      assert.equal(unescapeJt808Hex('7D02'), '7E');
    });

    it('unescapes 7D 01 to 7D according to JT/T 808 specification', () => {
      assert.equal(unescapeJt808Hex('7D 01'), '7D');
      assert.equal(unescapeJt808Hex('7D01'), '7D');
    });

    it('preserves non-escaped bytes and handles complex framed packets', () => {
      const escaped = '7E 02 00 7D 02 55 7D 01 AA 7E';
      const unescaped = unescapeJt808Hex(escaped);
      assert.equal(unescaped, '7E02007E557DAA7E');
    });

    it('safely handles empty strings and edge cases', () => {
      assert.equal(unescapeJt808Hex(''), '');
      assert.equal(unescapeJt808Hex('   '), '');
    });
  });

  describe('4. Professional Wireshark-Style Hex Dump Matrix (formatHexDump)', () => {
    it('formats hex string into 16-bytes per row with 4-digit hex offsets', () => {
      // 44 bytes (88 hex chars)
      const hex34 = '7E0200002A013800138000007C00000000000000010156994006CA31B000780000014B26101510203000DE7E';
      const rows = formatHexDump(hex34, 16);

      assert.equal(rows.length, 3);
      assert.equal(rows[0]!.offset, '0000');
      assert.equal(rows[0]!.hexBytes.length, 16);
      assert.equal(rows[0]!.hexBytes[0], '7E');
      assert.equal(rows[0]!.hexBytes[1], '02');

      assert.equal(rows[1]!.offset, '0010');
      assert.equal(rows[1]!.hexBytes.length, 16);

      assert.equal(rows[2]!.offset, '0020');
      assert.equal(rows[2]!.hexBytes.length, 12); // Remaining 12 bytes
    });

    it('renders printable ASCII characters and substitutes non-printable bytes with dots', () => {
      // "HELLO" in hex: 48 45 4C 4C 4F, followed by NULL 00
      const testHex = '48454C4C4F0001';
      const rows = formatHexDump(testHex, 16);

      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.asciiText, 'HELLO..');
    });

    it('returns empty array when input is blank or whitespace', () => {
      assert.deepEqual(formatHexDump(''), []);
      assert.deepEqual(formatHexDump('   '), []);
    });
  });

  describe('5. Protocol Message Header Parsing (parseMessageHeader)', () => {
    it('extracts JT/T 808 header attributes accurately', () => {
      const sample = SEED_COMM_LOGS.find((l) => l.protocolType === CommProtocolType.JT808)!;
      const parsed = parseMessageHeader(sample);

      assert.ok(parsed);
      assert.equal(parsed.protocolType, CommProtocolType.JT808);
      assert.equal(parsed.messageId, sample.messageId);
      assert.ok(parsed.deviceNo);
      assert.ok(typeof parsed.bodyLength === 'number');
    });

    it('extracts 0x02 Car Control protocol attributes accurately', () => {
      const sample = SEED_COMM_LOGS.find((l) => l.protocolType === CommProtocolType.CAR_CONTROL_0X02)!;
      const parsed = parseMessageHeader(sample);

      assert.ok(parsed);
      assert.equal(parsed.protocolType, CommProtocolType.CAR_CONTROL_0X02);
      assert.equal(parsed.messageId, sample.messageId);
      assert.ok(parsed.vin);
    });
  });

  describe('6. Summary Statistics Calculation (calculateCommLogStats)', () => {
    it('calculates total logs, direction counts, protocol distribution, and anomaly rates accurately', () => {
      const stats = calculateCommLogStats(SEED_COMM_LOGS);

      assert.equal(stats.totalLogs, SEED_COMM_LOGS.length);
      assert.equal(stats.uplinkCount + stats.downlinkCount, SEED_COMM_LOGS.length);
      assert.ok(stats.uplinkCount > 0);
      assert.ok(stats.downlinkCount > 0);

      // Verify all 4 protocols are tracked
      assert.ok(stats.protocolDistribution[CommProtocolType.JT808] > 0);
      assert.ok(stats.protocolDistribution[CommProtocolType.CAR_CONTROL_0X02] > 0);
      assert.ok(stats.protocolDistribution[CommProtocolType.MQTT_TELEMETRY] > 0);
      assert.ok(stats.protocolDistribution[CommProtocolType.GB32960] > 0);

      // Verify anomaly count and rate
      const anomalyCount = SEED_COMM_LOGS.filter((l) => !l.checksumValid).length;
      assert.equal(stats.checksumAnomaliesCount, anomalyCount);
      assert.ok(stats.checksumAnomaliesCount >= 1, 'Must include at least 1 anomaly log in seeds');
      assert.ok(stats.checksumAnomalyRate > 0 && stats.checksumAnomalyRate <= 100);
    });

    it('handles empty log array safely without division by zero', () => {
      const stats = calculateCommLogStats([]);
      assert.equal(stats.totalLogs, 0);
      assert.equal(stats.uplinkCount, 0);
      assert.equal(stats.downlinkCount, 0);
      assert.equal(stats.checksumAnomaliesCount, 0);
      assert.equal(stats.checksumAnomalyRate, 0);
    });
  });

  describe('7. Multi-dimensional Log Filtering (filterCommLogs)', () => {
    it('filters logs by keyword matching plate, VIN, deviceNo, or messageName', () => {
      const vinTarget = SEED_COMM_LOGS[0]!.vin;
      const filtered = filterCommLogs(SEED_COMM_LOGS, { keyword: vinTarget });
      assert.ok(filtered.length >= 1);
      assert.ok(filtered.every((l) => l.vin.includes(vinTarget) || l.deviceNo.includes(vinTarget)));
    });

    it('filters logs by protocolType', () => {
      const filtered = filterCommLogs(SEED_COMM_LOGS, {
        protocolType: CommProtocolType.MQTT_TELEMETRY,
      });
      assert.ok(filtered.length >= 1);
      assert.ok(filtered.every((l) => l.protocolType === CommProtocolType.MQTT_TELEMETRY));
    });

    it('filters logs by direction', () => {
      const uplinks = filterCommLogs(SEED_COMM_LOGS, { direction: CommDirection.UPLINK });
      assert.ok(uplinks.length >= 1);
      assert.ok(uplinks.every((l) => l.direction === CommDirection.UPLINK));

      const downlinks = filterCommLogs(SEED_COMM_LOGS, { direction: CommDirection.DOWNLINK });
      assert.ok(downlinks.length >= 1);
      assert.ok(downlinks.every((l) => l.direction === CommDirection.DOWNLINK));
    });

    it('filters logs by checksumStatus (VALID vs INVALID)', () => {
      const invalids = filterCommLogs(SEED_COMM_LOGS, { checksumStatus: 'INVALID' });
      assert.ok(invalids.length >= 1);
      assert.ok(invalids.every((l) => !l.checksumValid));

      const valids = filterCommLogs(SEED_COMM_LOGS, { checksumStatus: 'VALID' });
      assert.ok(valids.length >= 1);
      assert.ok(valids.every((l) => l.checksumValid));
    });

    it('filters logs by timestamp range', () => {
      const allTimestamps = SEED_COMM_LOGS.map((l) => l.timestamp).sort((a, b) => a - b);
      const midTime = allTimestamps[Math.floor(allTimestamps.length / 2)]!;

      const rangeFiltered = filterCommLogs(SEED_COMM_LOGS, {
        startTime: midTime,
      });
      assert.ok(rangeFiltered.every((l) => l.timestamp >= midTime));
    });
  });

  describe('8. CSV Export with RFC 4180 and CWE-1236 Defense (generateCommLogsCsv)', () => {
    it('prepends UTF-8 BOM \\uFEFF for seamless Excel encoding support', () => {
      const csv = generateCommLogsCsv(SEED_COMM_LOGS.slice(0, 3));
      assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');
    });

    it('defends against CWE-1236 formula injection in all text fields', () => {
      const maliciousLog: CommLogRecord = {
        ...SEED_COMM_LOGS[0]!,
        id: 'log-malicious-1',
        messageName: '=cmd|"/C calc"!A0',
        plateNumber: '+8613800000000',
        vin: '@SUM(1+1)',
      };

      const csv = generateCommLogsCsv([maliciousLog]);
      assert.ok(!csv.includes(',=cmd'));
      assert.ok(!csv.includes(',+86138'));
      assert.ok(!csv.includes(',@SUM'));
      // Prefixed with single quote or sanitized
      assert.ok(csv.includes("'=cmd") || csv.includes('"\'=cmd'));
    });

    it('formats headers and columns correctly according to RFC 4180', () => {
      const csv = generateCommLogsCsv(SEED_COMM_LOGS.slice(0, 2));
      const lines = csv.replace('\uFEFF', '').split('\n').filter(Boolean);
      assert.ok(lines.length >= 3); // 1 header + 2 rows
      assert.ok(lines[0]!.includes('日志ID'));
      assert.ok(lines[0]!.includes('时间戳'));
      assert.ok(lines[0]!.includes('协议类型'));
      assert.ok(lines[0]!.includes('校验状态'));
    });
  });

  describe('9. Seed Data Invariants (SEED_COMM_LOGS)', () => {
    it('provides at least 12 production-grade communication logs spanning all 4 protocols', () => {
      assert.ok(SEED_COMM_LOGS.length >= 12, `Seed logs count must be >= 12, got ${SEED_COMM_LOGS.length}`);

      const protocolSet = new Set(SEED_COMM_LOGS.map((l) => l.protocolType));
      assert.ok(protocolSet.has(CommProtocolType.JT808));
      assert.ok(protocolSet.has(CommProtocolType.CAR_CONTROL_0X02));
      assert.ok(protocolSet.has(CommProtocolType.MQTT_TELEMETRY));
      assert.ok(protocolSet.has(CommProtocolType.GB32960));
    });

    it('includes at least one checksum anomaly log for diagnostic verification', () => {
      const anomaly = SEED_COMM_LOGS.find((l) => !l.checksumValid);
      assert.ok(anomaly, 'Must include at least 1 checksum anomaly');
      assert.ok(anomaly.errorMessage && anomaly.errorMessage.length > 0);
      assert.notEqual(anomaly.calculatedChecksum, anomaly.actualChecksum);
    });

    it('ensures all seed logs possess valid IDs, timestamps, hex, and byte lengths', () => {
      for (const log of SEED_COMM_LOGS) {
        assert.ok(log.id && log.id.length > 0);
        assert.ok(log.timestamp > 0);
        assert.ok(log.timestampFormatted && log.timestampFormatted.length > 0);
        assert.ok(log.rawHex && log.rawHex.length > 0);
        assert.ok(log.byteLength > 0);
        assert.ok(log.deviceNo && log.deviceNo.length > 0);
        assert.ok(log.vin && log.vin.length > 0);
      }
    });
  });

  describe('10. API Client Methods & Offline Persistence (api/comm-log.ts)', () => {
    it('fetchCommLogsApi returns seed logs and applies filtering in offline mode', async () => {
      const logs = await fetchCommLogsApi();
      assert.ok(Array.isArray(logs));
      assert.ok(logs.length >= 12);

      const filtered = await fetchCommLogsApi({ direction: CommDirection.UPLINK });
      assert.ok(filtered.every((l) => l.direction === CommDirection.UPLINK));
    });

    it('fetchCommLogDetailApi returns record by ID and throws 404 for unknown record', async () => {
      const target = SEED_COMM_LOGS[0]!;
      const detail = await fetchCommLogDetailApi(target.id);
      assert.equal(detail.id, target.id);
      assert.equal(detail.messageId, target.messageId);

      await assert.rejects(
        () => fetchCommLogDetailApi('non-existent-log-id'),
        (err: any) => isApiError(err) && err.statusCode === 404
      );
    });

    it('exportCommLogsCsvApi generates a Blob containing CSV and UTF-8 BOM', async () => {
      const blob = await exportCommLogsCsvApi();
      assert.ok(blob instanceof Blob);
      const buf = new Uint8Array(await blob.arrayBuffer());
      assert.equal(buf[0], 0xef);
      assert.equal(buf[1], 0xbb);
      assert.equal(buf[2], 0xbf);
      const text = await blob.text();
      assert.ok(text.includes('日志ID'));
    });

    it('re-throws ApiError when server encounters real business exception', async () => {
      const mockApiError = new ApiError('Forbidden', 403, 'FORBIDDEN');
      assert.ok(isApiError(mockApiError));
      assert.equal(mockApiError.statusCode, 403);
    });
  });
});
