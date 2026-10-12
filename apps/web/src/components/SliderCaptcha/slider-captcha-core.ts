export type SliderCaptchaStatus = 'idle' | 'dragging' | 'success';

export interface SliderCaptchaOptions {
  trackWidth?: number;
  thumbWidth?: number;
  threshold?: number;
}

/**
 * 计算滑块位移，强制限制在 [0, maxOffset] 区间内
 */
export function calculateSliderOffset(
  clientX: number,
  startX: number,
  maxOffset: number
): number {
  const delta = clientX - startX;
  if (delta <= 0) {
    return 0;
  }
  if (delta >= maxOffset) {
    return maxOffset;
  }
  return delta;
}

/**
 * 校验滑块是否达到通过阈值（默认 >= 90% 即通过）
 */
export function evaluateSliderVerification(
  offset: number,
  maxOffset: number,
  threshold: number = 0.9
): boolean {
  if (maxOffset <= 0) {
    return false;
  }
  const target = maxOffset * threshold;
  return offset >= target;
}

/**
 * 生成一次性前端人机验证安全 Ticket/Token
 */
export function generateCaptchaToken(): string {
  const randomPart = Math.random().toString(36).substring(2, 12);
  const timePart = Date.now().toString(36);
  return `captcha_${randomPart}_${timePart}`;
}

/**
 * 滑块人机验证核心控制器与状态机
 */
export class SliderCaptchaController {
  private trackWidth: number;
  private thumbWidth: number;
  private threshold: number;

  private status: SliderCaptchaStatus = 'idle';
  private startX: number = 0;
  private offset: number = 0;
  private token: string | null = null;

  private successCallbacks: Array<(token: string) => void> = [];
  private resetCallbacks: Array<() => void> = [];

  constructor(options: SliderCaptchaOptions = {}) {
    this.trackWidth = options.trackWidth ?? 320;
    this.thumbWidth = options.thumbWidth ?? 44;
    this.threshold = options.threshold ?? 0.9;
  }

  public getMaxOffset(): number {
    return Math.max(0, this.trackWidth - this.thumbWidth);
  }

  public setDimensions(trackWidth: number, thumbWidth: number): void {
    this.trackWidth = trackWidth;
    this.thumbWidth = thumbWidth;
  }

  public getStatus(): SliderCaptchaStatus {
    return this.status;
  }

  public getOffset(): number {
    return this.offset;
  }

  public isVerified(): boolean {
    return this.status === 'success';
  }

  public getToken(): string | null {
    return this.token;
  }

  public startDrag(clientX: number): void {
    if (this.status === 'success') {
      return;
    }
    this.status = 'dragging';
    this.startX = clientX;
  }

  public onDrag(clientX: number): number {
    if (this.status !== 'dragging') {
      return this.offset;
    }
    const maxOffset = this.getMaxOffset();
    this.offset = calculateSliderOffset(clientX, this.startX, maxOffset);
    return this.offset;
  }

  public endDrag(): { verified: boolean; token: string | null } {
    if (this.status !== 'dragging') {
      return { verified: this.isVerified(), token: this.token };
    }

    const maxOffset = this.getMaxOffset();
    const verified = evaluateSliderVerification(this.offset, maxOffset, this.threshold);

    if (verified) {
      this.status = 'success';
      this.offset = maxOffset;
      this.token = generateCaptchaToken();
      this.successCallbacks.forEach((cb) => cb(this.token!));
      return { verified: true, token: this.token };
    }

    // 未达阈值弹性归零
    this.status = 'idle';
    this.offset = 0;
    this.token = null;
    return { verified: false, token: null };
  }

  public reset(): void {
    this.status = 'idle';
    this.offset = 0;
    this.token = null;
    this.startX = 0;
    this.resetCallbacks.forEach((cb) => cb());
  }

  public onSuccess(cb: (token: string) => void): () => void {
    this.successCallbacks.push(cb);
    return () => {
      this.successCallbacks = this.successCallbacks.filter((fn) => fn !== cb);
    };
  }

  public onReset(cb: () => void): () => void {
    this.resetCallbacks.push(cb);
    return () => {
      this.resetCallbacks = this.resetCallbacks.filter((fn) => fn !== cb);
    };
  }
}
