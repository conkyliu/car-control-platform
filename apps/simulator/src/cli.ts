#!/usr/bin/env node
import { DeviceSimulator } from './device-simulator.js';

async function main() {
  const deviceCount = parseInt(process.env.DEVICE_COUNT || '1', 10);
  console.log(`[Simulator CLI] Starting ${deviceCount} virtual vehicle devices...`);

  const simulators: DeviceSimulator[] = [];
  for (let i = 1; i <= deviceCount; i++) {
    const pad = String(i).padStart(4, '0');
    const sim = new DeviceSimulator({
      productKey: 'CAR_DEMO_PK',
      deviceNo: `TBOX_${pad}`,
      heartbeatIntervalMs: 15000,
      defaultLatencyMs: 150,
    });
    await sim.start();
    simulators.push(sim);
  }

  console.log(`[Simulator CLI] ${simulators.length} virtual devices are online and listening.`);

  process.on('SIGINT', async () => {
    console.log('\n[Simulator CLI] Shutting down simulated devices...');
    for (const sim of simulators) {
      await sim.stop();
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Simulator CLI] Error:', err);
  process.exit(1);
});
