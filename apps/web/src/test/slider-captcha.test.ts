import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSliderOffset,
  evaluateSliderVerification,
  generateCaptchaToken,
  SliderCaptchaController,
} from '../components/SliderCaptcha/slider-captcha-core.ts';

test('SliderCaptcha Human Verification Logic Test Suite', async (t) => {
  // Test 1: Displacement clamping calculation
  await t.test('calculateSliderOffset clamps displacement correctly within [0, maxOffset]', () => {
    const maxOffset = 276; // e.g. 320 - 44
    const startX = 100;

    // Drag to the left (negative offset) -> should clamp to 0
    assert.equal(calculateSliderOffset(80, startX, maxOffset), 0);
    assert.equal(calculateSliderOffset(0, startX, maxOffset), 0);

    // Normal dragging within range
    assert.equal(calculateSliderOffset(150, startX, maxOffset), 50);
    assert.equal(calculateSliderOffset(200, startX, maxOffset), 100);

    // Drag beyond maxOffset -> should clamp to maxOffset
    assert.equal(calculateSliderOffset(376, startX, maxOffset), 276);
    assert.equal(calculateSliderOffset(500, startX, maxOffset), 276);
  });

  // Test 2: Threshold evaluation (>= 90% passes, < 90% fails)
  await t.test('evaluateSliderVerification verifies strictly against 90% threshold', () => {
    const maxOffset = 276;
    const threshold = 0.9;
    const targetOffset = maxOffset * threshold; // 248.4

    // Under threshold (e.g. 89.9%) -> fail / rebound
    assert.equal(evaluateSliderVerification(247, maxOffset, threshold), false);
    assert.equal(evaluateSliderVerification(0, maxOffset, threshold), false);
    assert.equal(evaluateSliderVerification(138, maxOffset, threshold), false); // 50%

    // Exactly or above threshold -> pass
    assert.equal(evaluateSliderVerification(targetOffset, maxOffset, threshold), true);
    assert.equal(evaluateSliderVerification(250, maxOffset, threshold), true);
    assert.equal(evaluateSliderVerification(maxOffset, maxOffset, threshold), true);

    // Custom threshold support
    assert.equal(evaluateSliderVerification(200, maxOffset, 0.7), true); // 200/276 = 72.4% >= 70%
    assert.equal(evaluateSliderVerification(190, maxOffset, 0.7), false);
  });

  // Test 3: Token generation
  await t.test('generateCaptchaToken produces non-empty unique verification tokens', () => {
    const token1 = generateCaptchaToken();
    const token2 = generateCaptchaToken();

    assert.ok(token1 && typeof token1 === 'string');
    assert.ok(token2 && typeof token2 === 'string');
    assert.ok(token1.length >= 16);
    assert.notEqual(token1, token2);
    assert.ok(token1.startsWith('captcha_'));
  });

  // Test 4: Controller state management and reset
  await t.test('SliderCaptchaController handles lifecycle, rebound, success, and reset', () => {
    const controller = new SliderCaptchaController({
      trackWidth: 320,
      thumbWidth: 44,
      threshold: 0.9,
    });

    // Initial state
    assert.equal(controller.getStatus(), 'idle');
    assert.equal(controller.getOffset(), 0);
    assert.equal(controller.isVerified(), false);
    assert.equal(controller.getToken(), null);

    // Start drag
    controller.startDrag(50);
    assert.equal(controller.getStatus(), 'dragging');

    // Drag below threshold (e.g. 100px / 276px = 36%)
    controller.onDrag(150);
    assert.equal(controller.getOffset(), 100);

    // Release below threshold -> should rebound to 0 and become idle
    const belowResult = controller.endDrag();
    assert.equal(belowResult.verified, false);
    assert.equal(controller.getStatus(), 'idle');
    assert.equal(controller.getOffset(), 0);
    assert.equal(controller.isVerified(), false);
    assert.equal(controller.getToken(), null);

    // Drag above threshold (e.g. 260px / 276px = 94.2%)
    controller.startDrag(50);
    controller.onDrag(310);
    assert.equal(controller.getOffset(), 260);

    // Release above threshold -> should succeed, lock at maxOffset, generate token
    let receivedToken: string | null = null;
    controller.onSuccess((token) => {
      receivedToken = token;
    });

    const passResult = controller.endDrag();
    assert.equal(passResult.verified, true);
    assert.ok(passResult.token);
    assert.equal(controller.getStatus(), 'success');
    assert.equal(controller.getOffset(), 276); // locked to max
    assert.equal(controller.isVerified(), true);
    assert.equal(controller.getToken(), passResult.token);
    assert.equal(receivedToken, passResult.token);

    // Further drags when verified must be ignored
    controller.startDrag(100);
    assert.equal(controller.getStatus(), 'success');

    // Reset back to initial state
    controller.reset();
    assert.equal(controller.getStatus(), 'idle');
    assert.equal(controller.getOffset(), 0);
    assert.equal(controller.isVerified(), false);
    assert.equal(controller.getToken(), null);
  });
});
