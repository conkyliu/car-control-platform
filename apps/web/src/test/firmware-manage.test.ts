import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  FirmwareType,
  FirmwareStatus,
  type FirmwarePackageDto,
  type FirmwareQueryParams,
  type CreateFirmwareInput,
  FIRMWARE_TYPE_METADATA,
  FIRMWARE_STATUS_METADATA,
  validateSemver,
  isValidSemver,
  validateSha256,
  formatFileSize,
  isValidFirmwareStatusTransition,
  isTerminalFirmwareStatus,
  calculateFirmwareStats,
  filterFirmwarePackages,
  SEED_FIRMWARE_PACKAGES,
  isApiError,
} from '../views/ota/firmware-core.ts';
import {
  fetchFirmwarePackagesApi,
  fetchFirmwareDetailApi,
  createFirmwarePackageApi,
  publishFirmwarePackageApi,
  deprecateFirmwarePackageApi,
  deleteFirmwarePackageApi,
  resetInMemoryFirmwarePackages,
  getInMemoryFirmwarePackages,
} from '../api/firmware.ts';
import { ApiError } from '../api/client.ts';

describe('OTA Firmware Manage Center Core Domain, State Machine & API Test Suite', () => {
  beforeEach(() => {
    resetInMemoryFirmwarePackages();
  });

  describe('1. FirmwareType & FirmwareStatus Domain Models & Metadata', () => {
    const ALL_TYPES = [
      FirmwareType.TBOX,
      FirmwareType.MCU,
      FirmwareType.BCM,
      FirmwareType.BMS,
    ];

    it('contains all 4 core firmware types: TBOX, MCU, BCM, BMS', () => {
      assert.equal(ALL_TYPES.length, 4);
      for (const t of ALL_TYPES) {
        assert.ok(t, `FirmwareType [${t}] must be defined`);
      }
    });

    it('provides comprehensive visual and semantic metadata for all 4 types', () => {
      for (const t of ALL_TYPES) {
        const meta = FIRMWARE_TYPE_METADATA[t];
        assert.ok(meta, `Metadata for type [${t}] must exist`);
        assert.ok(meta.label && meta.label.length > 0, `Type [${t}] must have a non-empty label`);
        assert.ok(meta.color && meta.color.length > 0, `Type [${t}] must have a color`);
        assert.ok(meta.icon && meta.icon.length > 0, `Type [${t}] must have an icon`);
        assert.ok(meta.description && meta.description.length > 0, `Type [${t}] must have a description`);
      }
    });

    it('contains 3 firmware lifecycle statuses: DRAFT, PUBLISHED, DEPRECATED with metadata', () => {
      const statuses = [
        FirmwareStatus.DRAFT,
        FirmwareStatus.PUBLISHED,
        FirmwareStatus.DEPRECATED,
      ];
      assert.equal(statuses.length, 3);
      for (const s of statuses) {
        const meta = FIRMWARE_STATUS_METADATA[s];
        assert.ok(meta, `Metadata for status [${s}] must exist`);
        assert.ok(meta.label && meta.label.length > 0, `Status [${s}] must have label`);
        assert.ok(meta.badgeStatus && meta.badgeStatus.length > 0, `Status [${s}] must have badgeStatus`);
        assert.ok(meta.color && meta.color.length > 0, `Status [${s}] must have color`);
      }
    });
  });

  describe('2. SemVer Semantic Version Validation & Parsing (validateSemver)', () => {
    it('accepts and parses standard 3-segment versions: 1.0.0, v1.2.3, 2.10.4', () => {
      const r1 = validateSemver('1.0.0');
      assert.equal(r1.valid, true);
      assert.equal(r1.major, 1);
      assert.equal(r1.minor, 0);
      assert.equal(r1.patch, 0);
      assert.equal(r1.prerelease, undefined);

      const r2 = validateSemver('v2.14.7');
      assert.equal(r2.valid, true);
      assert.equal(r2.major, 2);
      assert.equal(r2.minor, 14);
      assert.equal(r2.patch, 7);
      assert.equal(r2.prerelease, undefined);

      assert.equal(isValidSemver('3.0.1'), true);
      assert.equal(isValidSemver('v0.0.1'), true);
    });

    it('accepts and parses versions with prerelease identifiers (rc, beta, alpha)', () => {
      const r1 = validateSemver('2.0.1-rc.1');
      assert.equal(r1.valid, true);
      assert.equal(r1.major, 2);
      assert.equal(r1.minor, 0);
      assert.equal(r1.patch, 1);
      assert.equal(r1.prerelease, 'rc.1');

      const r2 = validateSemver('v3.0.0-beta.2');
      assert.equal(r2.valid, true);
      assert.equal(r2.major, 3);
      assert.equal(r2.minor, 0);
      assert.equal(r2.patch, 0);
      assert.equal(r2.prerelease, 'beta.2');
    });

    it('rejects invalid versions and returns human-readable error messages', () => {
      const invalids = [
        '',
        '   ',
        '1.2',
        'v1',
        '1.2.3.4',
        'v1.a.0',
        'version-2',
        'v01.2.3',
        null as any,
        undefined as any,
      ];
      for (const inv of invalids) {
        const res = validateSemver(inv);
        assert.equal(res.valid, false);
        assert.ok(res.error && res.error.length > 0, `Error message must be present for [${inv}]`);
        assert.equal(isValidSemver(inv), false);
      }
    });

    it('handles whitespace trimming before evaluation', () => {
      const res = validateSemver('   v1.2.5   ');
      assert.equal(res.valid, true);
      assert.equal(res.major, 1);
      assert.equal(res.minor, 2);
      assert.equal(res.patch, 5);
    });
  });

  describe('3. SHA-256 Hash Integrity Validation (validateSha256)', () => {
    const VALID_HASH_LOWER = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';
    const VALID_HASH_UPPER = 'A1B2C3D4E5F67890123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0';
    const VALID_HASH_MIXED = '7b9f3e4a2d1c5e6f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1F';

    it('accepts strictly valid 64-character hexadecimal SHA-256 hashes', () => {
      assert.equal(validateSha256(VALID_HASH_LOWER), true);
      assert.equal(validateSha256(VALID_HASH_UPPER), true);
      assert.equal(validateSha256(VALID_HASH_MIXED), true);
    });

    it('rejects hashes with incorrect length', () => {
      assert.equal(validateSha256(VALID_HASH_LOWER.slice(0, 63)), false);
      assert.equal(validateSha256(VALID_HASH_LOWER + 'a'), false);
    });

    it('rejects hashes containing non-hexadecimal characters', () => {
      const invalidChars = VALID_HASH_LOWER.slice(0, 63) + 'g';
      assert.equal(validateSha256(invalidChars), false);
      const invalidSymbols = VALID_HASH_LOWER.slice(0, 63) + '_';
      assert.equal(validateSha256(invalidSymbols), false);
    });

    it('rejects empty, null, or undefined hash inputs', () => {
      assert.equal(validateSha256(''), false);
      assert.equal(validateSha256('   '), false);
      assert.equal(validateSha256(null as any), false);
      assert.equal(validateSha256(undefined as any), false);
    });

    it('handles leading and trailing whitespace gracefully', () => {
      assert.equal(validateSha256(`  ${VALID_HASH_LOWER}  `), true);
    });
  });

  describe('4. Human-Readable File Size Formatter (formatFileSize)', () => {
    it('formats bytes accurately for 0 and small byte values', () => {
      assert.equal(formatFileSize(0), '0 B');
      assert.equal(formatFileSize(512), '512 B');
      assert.equal(formatFileSize(1023), '1023 B');
    });

    it('formats KB values properly', () => {
      assert.equal(formatFileSize(1024), '1 KB');
      assert.equal(formatFileSize(1536), '1.5 KB');
      assert.equal(formatFileSize(500 * 1024), '500 KB');
    });

    it('formats MB and GB values properly', () => {
      assert.equal(formatFileSize(1024 * 1024), '1 MB');
      assert.equal(formatFileSize(10 * 1024 * 1024), '10 MB');
      assert.equal(formatFileSize(12.4 * 1024 * 1024), '12.4 MB');
      assert.equal(formatFileSize(1024 * 1024 * 1024), '1 GB');
    });

    it('handles negative or NaN values safely', () => {
      assert.equal(formatFileSize(-100), '0 B');
      assert.equal(formatFileSize(NaN), '0 B');
      assert.equal(formatFileSize(null as any), '0 B');
    });
  });

  describe('5. Firmware Lifecycle State Transition Guards (isValidFirmwareStatusTransition)', () => {
    it('permits valid transitions from DRAFT to PUBLISHED or DEPRECATED', () => {
      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.DRAFT, FirmwareStatus.PUBLISHED),
        true
      );
      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.DRAFT, FirmwareStatus.DEPRECATED),
        true
      );
    });

    it('permits valid transition from PUBLISHED to DEPRECATED', () => {
      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.PUBLISHED, FirmwareStatus.DEPRECATED),
        true
      );
    });

    it('rejects rollbacks from PUBLISHED to DRAFT', () => {
      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.PUBLISHED, FirmwareStatus.DRAFT),
        false
      );
    });

    it('strictly guards DEPRECATED as irreversible terminal state', () => {
      assert.equal(isTerminalFirmwareStatus(FirmwareStatus.DEPRECATED), true);
      assert.equal(isTerminalFirmwareStatus(FirmwareStatus.DRAFT), false);
      assert.equal(isTerminalFirmwareStatus(FirmwareStatus.PUBLISHED), false);

      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.DEPRECATED, FirmwareStatus.DRAFT),
        false
      );
      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.DEPRECATED, FirmwareStatus.PUBLISHED),
        false
      );
      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.DEPRECATED, FirmwareStatus.DEPRECATED),
        false
      );
    });

    it('rejects identical from-to transitions', () => {
      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.DRAFT, FirmwareStatus.DRAFT),
        false
      );
      assert.equal(
        isValidFirmwareStatusTransition(FirmwareStatus.PUBLISHED, FirmwareStatus.PUBLISHED),
        false
      );
    });
  });

  describe('6. Firmware Statistics Calculation (calculateFirmwareStats)', () => {
    it('calculates metrics accurately for seed packages', () => {
      const stats = calculateFirmwareStats(SEED_FIRMWARE_PACKAGES);

      assert.ok(stats.total >= 8, 'Must have at least 8 packages');
      assert.equal(stats.total, stats.published + stats.draft + stats.deprecated);

      assert.ok(stats.typeDistribution[FirmwareType.TBOX] > 0);
      assert.ok(stats.typeDistribution[FirmwareType.MCU] > 0);
      assert.ok(stats.typeDistribution[FirmwareType.BCM] > 0);
      assert.ok(stats.typeDistribution[FirmwareType.BMS] > 0);

      assert.ok(stats.coveredModelsCount > 0);
      assert.ok(stats.coveredModelNames.length > 0);
      assert.ok(stats.totalSizeBytes > 0);
      assert.ok(stats.totalSizeFormatted.length > 0);
    });

    it('handles empty package list safely', () => {
      const emptyStats = calculateFirmwareStats([]);
      assert.equal(emptyStats.total, 0);
      assert.equal(emptyStats.published, 0);
      assert.equal(emptyStats.draft, 0);
      assert.equal(emptyStats.deprecated, 0);
      assert.equal(emptyStats.coveredModelsCount, 0);
      assert.equal(emptyStats.coveredModelNames.length, 0);
      assert.equal(emptyStats.totalSizeBytes, 0);
      assert.equal(emptyStats.totalSizeFormatted, '0 B');
    });
  });

  describe('7. Multi-Dimensional Firmware Package Filtering (filterFirmwarePackages)', () => {
    it('filters by keyword matching name, version, or SHA-256', () => {
      const byName = filterFirmwarePackages(SEED_FIRMWARE_PACKAGES, { keyword: 'T-Box' });
      assert.ok(byName.length > 0);
      for (const p of byName) {
        assert.ok(
          p.name.includes('T-Box') ||
          p.version.includes('T-Box') ||
          p.sha256.includes('t-box') ||
          p.releaseNotes.includes('T-Box')
        );
      }

      const first = SEED_FIRMWARE_PACKAGES[0]!;
      const byShaPrefix = filterFirmwarePackages(SEED_FIRMWARE_PACKAGES, {
        keyword: first.sha256.slice(0, 10),
      });
      assert.ok(byShaPrefix.some((p) => p.id === first.id));
    });

    it('filters by firmwareType', () => {
      const mcuOnly = filterFirmwarePackages(SEED_FIRMWARE_PACKAGES, {
        firmwareType: FirmwareType.MCU,
      });
      assert.ok(mcuOnly.length > 0);
      for (const p of mcuOnly) {
        assert.equal(p.firmwareType, FirmwareType.MCU);
      }
    });

    it('filters by status', () => {
      const pubOnly = filterFirmwarePackages(SEED_FIRMWARE_PACKAGES, {
        status: FirmwareStatus.PUBLISHED,
      });
      assert.ok(pubOnly.length > 0);
      for (const p of pubOnly) {
        assert.equal(p.status, FirmwareStatus.PUBLISHED);
      }
    });

    it('filters by applicable model ID or name', () => {
      const firstModelId = SEED_FIRMWARE_PACKAGES[0]?.applicableModelIds[0];
      if (firstModelId) {
        const byModel = filterFirmwarePackages(SEED_FIRMWARE_PACKAGES, {
          modelId: firstModelId,
        });
        assert.ok(byModel.length > 0);
        for (const p of byModel) {
          assert.ok(p.applicableModelIds.includes(firstModelId));
        }
      }
    });

    it('supports combined multi-condition query', () => {
      const res = filterFirmwarePackages(SEED_FIRMWARE_PACKAGES, {
        firmwareType: FirmwareType.TBOX,
        status: FirmwareStatus.PUBLISHED,
      });
      for (const p of res) {
        assert.equal(p.firmwareType, FirmwareType.TBOX);
        assert.equal(p.status, FirmwareStatus.PUBLISHED);
      }
    });
  });

  describe('8. Production Seed Firmware Packages Integrity', () => {
    it('contains at least 8 packages covering all 4 core firmware types', () => {
      assert.ok(SEED_FIRMWARE_PACKAGES.length >= 8);
      const types = new Set(SEED_FIRMWARE_PACKAGES.map((p) => p.firmwareType));
      assert.equal(types.size, 4);
      assert.ok(types.has(FirmwareType.TBOX));
      assert.ok(types.has(FirmwareType.MCU));
      assert.ok(types.has(FirmwareType.BCM));
      assert.ok(types.has(FirmwareType.BMS));
    });

    it('validates every seed package has valid SemVer, valid SHA-256, and models', () => {
      for (const p of SEED_FIRMWARE_PACKAGES) {
        assert.ok(p.id, 'id is required');
        assert.ok(p.name, 'name is required');
        assert.equal(isValidSemver(p.version), true, `Package [${p.id}] version [${p.version}] must be valid SemVer`);
        assert.equal(validateSha256(p.sha256), true, `Package [${p.id}] sha256 must be 64-hex`);
        assert.ok(p.applicableModelIds.length > 0, `Package [${p.id}] must have applicableModelIds`);
        assert.ok(p.applicableModelNames.length > 0, `Package [${p.id}] must have applicableModelNames`);
        assert.ok(p.fileSize > 0, `Package [${p.id}] fileSize must be > 0`);
        assert.ok(p.fileSizeFormatted, `Package [${p.id}] fileSizeFormatted must exist`);
        assert.ok(p.releaseNotes, `Package [${p.id}] releaseNotes must exist`);
        assert.ok(p.uploadedBy, `Package [${p.id}] uploadedBy must exist`);
      }
    });
  });

  describe('9. API Client Methods & Offline Fallback State Operations', () => {
    it('fetchFirmwarePackagesApi retrieves all packages and applies query filters', async () => {
      const all = await fetchFirmwarePackagesApi();
      assert.ok(all.length >= 8);

      const mcuList = await fetchFirmwarePackagesApi({ firmwareType: FirmwareType.MCU });
      for (const p of mcuList) {
        assert.equal(p.firmwareType, FirmwareType.MCU);
      }
    });

    it('fetchFirmwareDetailApi retrieves single package or throws 404 for unknown ID', async () => {
      const first = (await fetchFirmwarePackagesApi())[0]!;
      const detail = await fetchFirmwareDetailApi(first.id);
      assert.equal(detail.id, first.id);
      assert.equal(detail.name, first.name);

      await assert.rejects(
        async () => {
          await fetchFirmwareDetailApi('non-existent-firmware-id');
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 404);
          return true;
        }
      );
    });

    it('createFirmwarePackageApi validates input, creates draft package, and stores in pool', async () => {
      const newPackageInput: CreateFirmwareInput = {
        name: 'BCM 舒适域控制系统测试固件',
        firmwareType: FirmwareType.BCM,
        version: 'v1.5.0-rc.1',
        fileSize: 4 * 1024 * 1024,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        applicableModelIds: ['model-et7', 'model-es8'],
        applicableModelNames: ['蔚来 ET7 2024款', '蔚来 ES8 旗舰版'],
        releaseNotes: '支持智能氛围灯自适应呼吸律动与电动尾门防夹算法优化',
        uploadedBy: 'OTA工程师_张工',
      };

      const created = await createFirmwarePackageApi(newPackageInput);
      assert.ok(created.id);
      assert.equal(created.name, newPackageInput.name);
      assert.equal(created.version, 'v1.5.0-rc.1');
      assert.equal(created.status, FirmwareStatus.DRAFT);
      assert.equal(created.fileSizeFormatted, '4 MB');

      const all = await fetchFirmwarePackagesApi();
      assert.ok(all.some((p) => p.id === created.id));
    });

    it('createFirmwarePackageApi rejects invalid SemVer with 400 ApiError', async () => {
      await assert.rejects(
        async () => {
          await createFirmwarePackageApi({
            name: '非法版本固件',
            firmwareType: FirmwareType.TBOX,
            version: 'invalid-semver',
            fileSize: 1024,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            applicableModelIds: ['model-et7'],
            releaseNotes: 'test',
          });
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    it('createFirmwarePackageApi rejects invalid SHA-256 with 400 ApiError', async () => {
      await assert.rejects(
        async () => {
          await createFirmwarePackageApi({
            name: '非法哈希固件',
            firmwareType: FirmwareType.TBOX,
            version: 'v1.0.0',
            fileSize: 1024,
            sha256: 'not-a-valid-sha256-hash',
            applicableModelIds: ['model-et7'],
            releaseNotes: 'test',
          });
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    it('createFirmwarePackageApi rejects duplicate package version for same name with 409 ApiError', async () => {
      const existing = (await fetchFirmwarePackagesApi())[0]!;
      await assert.rejects(
        async () => {
          await createFirmwarePackageApi({
            name: existing.name,
            firmwareType: existing.firmwareType,
            version: existing.version,
            fileSize: 2048,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            applicableModelIds: ['model-et7'],
            releaseNotes: 'duplicate check',
          });
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 409);
          return true;
        }
      );
    });

    it('publishFirmwarePackageApi publishes DRAFT firmware and records publishedAt', async () => {
      // Find or create draft
      const packages = await fetchFirmwarePackagesApi();
      const draft = packages.find((p) => p.status === FirmwareStatus.DRAFT);
      assert.ok(draft, 'Must have at least one DRAFT package in seeds');

      const published = await publishFirmwarePackageApi(draft.id);
      assert.equal(published.id, draft.id);
      assert.equal(published.status, FirmwareStatus.PUBLISHED);
      assert.ok(published.publishedAt);

      // Verify in pool
      const updated = await fetchFirmwareDetailApi(draft.id);
      assert.equal(updated.status, FirmwareStatus.PUBLISHED);
    });

    it('publishFirmwarePackageApi rejects publishing DEPRECATED firmware with 400 ApiError', async () => {
      const packages = await fetchFirmwarePackagesApi();
      const deprecated = packages.find((p) => p.status === FirmwareStatus.DEPRECATED);
      assert.ok(deprecated, 'Must have at least one DEPRECATED package in seeds');

      await assert.rejects(
        async () => {
          await publishFirmwarePackageApi(deprecated.id);
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    it('deprecateFirmwarePackageApi deprecates active or draft package with terminal protection', async () => {
      const packages = await fetchFirmwarePackagesApi();
      const pub = packages.find((p) => p.status === FirmwareStatus.PUBLISHED);
      assert.ok(pub, 'Must have at least one PUBLISHED package');

      const deprecated = await deprecateFirmwarePackageApi(pub.id);
      assert.equal(deprecated.id, pub.id);
      assert.equal(deprecated.status, FirmwareStatus.DEPRECATED);

      // Reject subsequent deprecation attempts on already deprecated firmware
      await assert.rejects(
        async () => {
          await deprecateFirmwarePackageApi(deprecated.id);
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    it('deleteFirmwarePackageApi removes DRAFT package from pool', async () => {
      const packages = await fetchFirmwarePackagesApi();
      const draft = packages.find((p) => p.status === FirmwareStatus.DRAFT);
      assert.ok(draft, 'Must have draft package');

      const res = await deleteFirmwarePackageApi(draft.id);
      assert.equal(res.success, true);

      // Confirm removed
      await assert.rejects(
        async () => {
          await fetchFirmwareDetailApi(draft.id);
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 404);
          return true;
        }
      );
    });

    it('deleteFirmwarePackageApi refuses to delete PUBLISHED or DEPRECATED firmware with 400 ApiError', async () => {
      const packages = await fetchFirmwarePackagesApi();
      const pub = packages.find((p) => p.status === FirmwareStatus.PUBLISHED);
      assert.ok(pub);

      await assert.rejects(
        async () => {
          await deleteFirmwarePackageApi(pub.id);
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 400);
          return true;
        }
      );

      const dep = packages.find((p) => p.status === FirmwareStatus.DEPRECATED);
      assert.ok(dep);
      await assert.rejects(
        async () => {
          await deleteFirmwarePackageApi(dep.id);
        },
        (err: any) => {
          assert.ok(isApiError(err));
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    it('resetInMemoryFirmwarePackages restores seed state cleanly', async () => {
      const initialCount = (await fetchFirmwarePackagesApi()).length;
      const draft = (await fetchFirmwarePackagesApi()).find((p) => p.status === FirmwareStatus.DRAFT)!;
      await deleteFirmwarePackageApi(draft.id);
      assert.equal((await fetchFirmwarePackagesApi()).length, initialCount - 1);

      resetInMemoryFirmwarePackages();
      assert.equal((await fetchFirmwarePackagesApi()).length, initialCount);
    });
  });
});
