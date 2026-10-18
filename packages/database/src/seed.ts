import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 32);
  return `${salt}:${derivedKey.toString('hex')}`;
}

const prisma = new PrismaClient();

export async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  // 1. Tenants
  const tenantDefault = await prisma.tenant.upsert({
    where: { code: 'DEMO_FLEET' },
    update: {
      name: '示范网约车集团',
      quotaDeviceCount: 1000,
      status: 'ACTIVE',
    },
    create: {
      id: 'TENANT_DEFAULT',
      name: '示范网约车集团',
      code: 'DEMO_FLEET',
      quotaDeviceCount: 1000,
      status: 'ACTIVE',
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { code: 'RENTAL_B' },
    update: {
      name: '快捷汽车租赁',
      quotaDeviceCount: 50,
      status: 'ACTIVE',
    },
    create: {
      id: 'TENANT_B',
      name: '快捷汽车租赁',
      code: 'RENTAL_B',
      quotaDeviceCount: 50,
      status: 'ACTIVE',
    },
  });

  console.log(`✓ Tenants seeded: ${tenantDefault.code}, ${tenantB.code}`);

  // 2. Organizations
  const orgRoot = await prisma.organization.upsert({
    where: { id: 'org_root' },
    update: {
      name: '示范网约车集团总部',
      tenantId: tenantDefault.id,
      parentId: null,
    },
    create: {
      id: 'org_root',
      tenantId: tenantDefault.id,
      name: '示范网约车集团总部',
      parentId: null,
    },
  });

  const orgOps = await prisma.organization.upsert({
    where: { id: 'org_ops' },
    update: {
      name: '综合运营中心',
      tenantId: tenantDefault.id,
      parentId: orgRoot.id,
    },
    create: {
      id: 'org_ops',
      tenantId: tenantDefault.id,
      name: '综合运营中心',
      parentId: orgRoot.id,
    },
  });

  const orgTech = await prisma.organization.upsert({
    where: { id: 'org_tech' },
    update: {
      name: '技术运维部',
      tenantId: tenantDefault.id,
      parentId: orgRoot.id,
    },
    create: {
      id: 'org_tech',
      tenantId: tenantDefault.id,
      name: '技术运维部',
      parentId: orgRoot.id,
    },
  });

  console.log(`✓ Organizations seeded: ${orgRoot.name}, ${orgOps.name}, ${orgTech.name}`);

  // 3. Projects
  const projDefault = await prisma.project.upsert({
    where: {
      tenantId_code: {
        tenantId: tenantDefault.id,
        code: 'DEMO_FLEET_01',
      },
    },
    update: {
      name: '示范运营一期工程',
    },
    create: {
      id: 'proj_default_01',
      tenantId: tenantDefault.id,
      name: '示范运营一期工程',
      code: 'DEMO_FLEET_01',
    },
  });

  const projB = await prisma.project.upsert({
    where: {
      tenantId_code: {
        tenantId: tenantB.id,
        code: 'RENTAL_FLEET_01',
      },
    },
    update: {
      name: '快捷租赁车队A组',
    },
    create: {
      id: 'proj_b_01',
      tenantId: tenantB.id,
      name: '快捷租赁车队A组',
      code: 'RENTAL_FLEET_01',
    },
  });

  console.log(`✓ Projects seeded: ${projDefault.code}, ${projB.code}`);

  // 4. Roles & Permissions
  const roleSuperAdmin = await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: tenantDefault.id,
        code: 'SUPER_ADMIN',
      },
    },
    update: {
      name: '超级管理员',
      description: '系统最高权限超级管理员',
    },
    create: {
      id: 'role_super_admin',
      tenantId: tenantDefault.id,
      name: '超级管理员',
      code: 'SUPER_ADMIN',
      description: '系统最高权限超级管理员',
    },
  });

  const roleTenantAdmin = await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: tenantDefault.id,
        code: 'TENANT_ADMIN',
      },
    },
    update: {
      name: '租户管理员',
      description: '企业车队总管',
    },
    create: {
      id: 'role_tenant_admin',
      tenantId: tenantDefault.id,
      name: '租户管理员',
      code: 'TENANT_ADMIN',
      description: '企业车队总管',
    },
  });

  const roleOperator = await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: tenantDefault.id,
        code: 'OPERATOR',
      },
    },
    update: {
      name: '运维监控员',
      description: '车队日常调度与监控人员',
    },
    create: {
      id: 'role_operator',
      tenantId: tenantDefault.id,
      name: '运维监控员',
      code: 'OPERATOR',
      description: '车队日常调度与监控人员',
    },
  });

  const roleCarOwner = await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: tenantDefault.id,
        code: 'CAR_OWNER',
      },
    },
    update: {
      name: '车主用户',
      description: '终端车辆所有者',
    },
    create: {
      id: 'role_car_owner',
      tenantId: tenantDefault.id,
      name: '车主用户',
      code: 'CAR_OWNER',
      description: '终端车辆所有者',
    },
  });

  // Seed permissions for TenantAdmin
  const adminPermissions = [
    'dashboard:read',
    'dashboard:export',
    'tenant:manage',
    'org:manage',
    'user:manage',
    'role:manage',
    'device:read',
    'device:write',
    'vehicle:read',
    'vehicle:write',
    'vehicle:bind',
    'vehicle:control',
    'car:control:lock',
    'car:control:engine',
    'car:control:ac',
    'car:control:trunk',
    'car:control:search',
    'telemetry:read',
    'geofence:read',
    'alarm:read',
    'alarm:ack',
    'ota:manage',
    'audit:read',
  ];

  for (const perm of adminPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permission: {
          roleId: roleTenantAdmin.id,
          permission: perm,
        },
      },
      update: {},
      create: {
        roleId: roleTenantAdmin.id,
        permission: perm,
      },
    });
  }

  console.log(`✓ Roles and permissions seeded`);

  // 5. Users
  const userAdmin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      tenantId: tenantDefault.id,
      organizationId: orgRoot.id,
      realName: '系统管理员',
      phone: '13800000001',
      email: 'admin@fleet.local',
      status: 'ACTIVE',
    },
    create: {
      id: 'user_admin_01',
      tenantId: tenantDefault.id,
      organizationId: orgRoot.id,
      username: 'admin',
      realName: '系统管理员',
      passwordHash: hashPassword('AdminPassword123!'),
      phone: '13800000001',
      email: 'admin@fleet.local',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: userAdmin.id,
        roleId: roleTenantAdmin.id,
      },
    },
    update: {},
    create: {
      userId: userAdmin.id,
      roleId: roleTenantAdmin.id,
    },
  });

  const userOperator = await prisma.user.upsert({
    where: { username: 'operator' },
    update: {
      tenantId: tenantDefault.id,
      organizationId: orgOps.id,
      realName: '张调度员',
      phone: '13800000002',
      email: 'operator@fleet.local',
      status: 'ACTIVE',
    },
    create: {
      id: 'user_operator_01',
      tenantId: tenantDefault.id,
      organizationId: orgOps.id,
      username: 'operator',
      realName: '张调度员',
      passwordHash: hashPassword('OperatorPassword123!'),
      phone: '13800000002',
      email: 'operator@fleet.local',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: userOperator.id,
        roleId: roleOperator.id,
      },
    },
    update: {},
    create: {
      userId: userOperator.id,
      roleId: roleOperator.id,
    },
  });

  console.log(`✓ Users seeded: ${userAdmin.username}, ${userOperator.username}`);

  // 6. Vehicle Brands & Models
  const brandsData = [
    { id: 'brand_tesla', name: 'Tesla 特斯拉', code: 'TESLA', models: [{ id: 'model_y', name: 'Model Y', code: 'MODEL_Y' }, { id: 'model_3', name: 'Model 3', code: 'MODEL_3' }] },
    { id: 'brand_byd', name: 'BYD 比亚迪', code: 'BYD', models: [{ id: 'model_han', name: '汉 EV', code: 'HAN_EV' }, { id: 'model_tang', name: '唐 DM-i', code: 'TANG_DMI' }] },
    { id: 'brand_nio', name: 'NIO 蔚来', code: 'NIO', models: [{ id: 'model_es6', name: 'ES6', code: 'ES6' }, { id: 'model_et5', name: 'ET5', code: 'ET5' }] },
    { id: 'brand_xpeng', name: 'XPENG 小鹏', code: 'XPENG', models: [{ id: 'model_g6', name: 'G6', code: 'G6' }] },
    { id: 'brand_zeekr', name: 'Zeekr 极氪', code: 'ZEEKR', models: [{ id: 'model_001', name: '001', code: '001' }] },
    { id: 'brand_xiaomi', name: 'Xiaomi 小米', code: 'XIAOMI', models: [{ id: 'model_su7', name: 'SU7', code: 'SU7' }] },
  ];

  for (const b of brandsData) {
    const brand = await prisma.vehicleBrand.upsert({
      where: { name: b.name },
      update: {},
      create: {
        id: b.id,
        name: b.name,
      },
    });

    for (const m of b.models) {
      await prisma.vehicleModel.upsert({
        where: {
          brandId_code: {
            brandId: brand.id,
            code: m.code,
          },
        },
        update: {
          name: m.name,
        },
        create: {
          id: m.id,
          brandId: brand.id,
          name: m.name,
          code: m.code,
        },
      });
    }
  }

  console.log(`✓ Vehicle brands & models seeded`);

  // 7. Devices
  const devicesData = [
    { id: 'dev-001', deviceNo: 'DEV_TEST_001', imei: '861234567890001', productKey: 'CAR_IOT_STD', status: 'ACTIVE', onlineStatus: 'ONLINE', firmwareVersion: 'v1.2.0' },
    { id: 'dev-002', deviceNo: 'DEV_TEST_002', imei: '861234567890002', productKey: 'CAR_IOT_STD', status: 'ACTIVE', onlineStatus: 'ONLINE', firmwareVersion: 'v1.2.0' },
    { id: 'dev-003', deviceNo: 'DEV_TEST_003', imei: '861234567890003', productKey: 'CAR_IOT_STD', status: 'ACTIVE', onlineStatus: 'OFFLINE', firmwareVersion: 'v1.1.0' },
    { id: 'dev-004', deviceNo: 'DEV_TEST_004', imei: '861234567890004', productKey: 'CAR_IOT_STD', status: 'ACTIVE', onlineStatus: 'OFFLINE', firmwareVersion: 'v1.1.0' },
  ];

  for (const d of devicesData) {
    await prisma.device.upsert({
      where: { deviceNo: d.deviceNo },
      update: {
        tenantId: tenantDefault.id,
        projectId: projDefault.id,
        imei: d.imei,
        productKey: d.productKey,
        status: d.status,
        onlineStatus: d.onlineStatus,
        firmwareVersion: d.firmwareVersion,
      },
      create: {
        id: d.id,
        tenantId: tenantDefault.id,
        projectId: projDefault.id,
        deviceNo: d.deviceNo,
        imei: d.imei,
        productKey: d.productKey,
        status: d.status,
        onlineStatus: d.onlineStatus,
        firmwareVersion: d.firmwareVersion,
      },
    });
  }

  console.log(`✓ Devices seeded: ${devicesData.length} devices`);

  // 8. Vehicles
  const vehiclesData = [
    { id: 'veh-001', vin: 'VIN_TESLA_TEST_001', plateNumber: '沪AD12345', modelId: 'model_y', deviceId: 'dev-001' },
    { id: 'veh-002', vin: 'VIN_BYD_TEST_002', plateNumber: '沪BD67890', modelId: 'model_han', deviceId: 'dev-002' },
    { id: 'veh-003', vin: 'VIN_NIO_TEST_003', plateNumber: '沪CD11223', modelId: 'model_es6', deviceId: 'dev-003' },
  ];

  for (const v of vehiclesData) {
    await prisma.vehicle.upsert({
      where: { vin: v.vin },
      update: {
        tenantId: tenantDefault.id,
        projectId: projDefault.id,
        plateNumber: v.plateNumber,
        modelId: v.modelId,
        deviceId: v.deviceId,
        status: 'NORMAL',
      },
      create: {
        id: v.id,
        tenantId: tenantDefault.id,
        projectId: projDefault.id,
        vin: v.vin,
        plateNumber: v.plateNumber,
        modelId: v.modelId,
        deviceId: v.deviceId,
        status: 'NORMAL',
      },
    });
  }

  console.log(`✓ Vehicles seeded: ${vehiclesData.length} vehicles`);
  console.log('🎉 Seeding completed successfully!');
}

async function main() {
  try {
    await seedDatabase();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('seed.js') || process.argv[1]?.endsWith('seed.ts')) {
  main();
}
