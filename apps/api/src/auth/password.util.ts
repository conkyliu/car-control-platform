import crypto from 'node:crypto';

export class PasswordUtil {
  /**
   * 生成带随机 Salt 的安全 scrypt 密码哈希
   */
  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 32);
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * 验证密码是否与存储哈希一致
   */
  static verifyPassword(password: string, storedHash: string): boolean {
    try {
      const [salt, key] = storedHash.split(':');
      if (!salt || !key) return false;

      const derivedKey = crypto.scryptSync(password, salt, 32);
      const keyBuffer = Buffer.from(key, 'hex');

      return (
        derivedKey.length === keyBuffer.length &&
        crypto.timingSafeEqual(derivedKey, keyBuffer)
      );
    } catch {
      return false;
    }
  }
}
