import React, {
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useCallback,
} from 'react';
import { DoubleRightOutlined, CheckCircleFilled } from '@ant-design/icons';
import {
  calculateSliderOffset,
  evaluateSliderVerification,
  generateCaptchaToken,
} from './slider-captcha-core.ts';
import type { SliderCaptchaStatus } from './slider-captcha-core.ts';

export * from './slider-captcha-core.ts';

export interface SliderCaptchaHandle {
  reset: () => void;
  isVerified: () => boolean;
}

export interface SliderCaptchaProps {
  onSuccess?: (captchaToken: string) => void;
  onReset?: () => void;
  disabled?: boolean;
  width?: number | string;
  height?: number;
  thumbWidth?: number;
  threshold?: number;
  text?: string;
  successText?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const SliderCaptcha = forwardRef<SliderCaptchaHandle, SliderCaptchaProps>(
  (
    {
      onSuccess,
      onReset,
      disabled = false,
      width = '100%',
      height = 40,
      thumbWidth = 44,
      threshold = 0.9,
      text = '向右滑动完成人机验证',
      successText = '验证通过',
      className,
      style,
    },
    ref
  ) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<SliderCaptchaStatus>('idle');
    const [offset, setOffset] = useState<number>(0);
    const [token, setToken] = useState<string | null>(null);

    const isDraggingRef = useRef<boolean>(false);
    const startXRef = useRef<number>(0);

    const getMaxOffset = useCallback(() => {
      if (!trackRef.current) {
        return typeof width === 'number' ? Math.max(0, width - thumbWidth) : 276;
      }
      return Math.max(0, trackRef.current.clientWidth - thumbWidth);
    }, [width, thumbWidth]);

    const handleReset = useCallback(() => {
      setStatus('idle');
      setOffset(0);
      setToken(null);
      isDraggingRef.current = false;
      onReset?.();
    }, [onReset]);

    useImperativeHandle(
      ref,
      () => ({
        reset: handleReset,
        isVerified: () => status === 'success',
      }),
      [handleReset, status]
    );

    const handleStartDrag = (clientX: number) => {
      if (disabled || status === 'success') {
        return;
      }
      isDraggingRef.current = true;
      startXRef.current = clientX;
      setStatus('dragging');
    };

    const handleMove = useCallback(
      (clientX: number) => {
        if (!isDraggingRef.current || status === 'success') {
          return;
        }
        const maxOffset = getMaxOffset();
        const nextOffset = calculateSliderOffset(clientX, startXRef.current, maxOffset);
        setOffset(nextOffset);
      },
      [getMaxOffset, status]
    );

    const handleEnd = useCallback(
      (currentClientX?: number) => {
        if (!isDraggingRef.current || status === 'success') {
          return;
        }
        isDraggingRef.current = false;
        const maxOffset = getMaxOffset();
        const currentOffset =
          typeof currentClientX === 'number'
            ? calculateSliderOffset(currentClientX, startXRef.current, maxOffset)
            : offset;

        const verified = evaluateSliderVerification(currentOffset, maxOffset, threshold);

        if (verified) {
          const generatedToken = generateCaptchaToken();
          setStatus('success');
          setOffset(maxOffset);
          setToken(generatedToken);
          onSuccess?.(generatedToken);
        } else {
          setStatus('idle');
          setOffset(0);
        }
      },
      [getMaxOffset, offset, threshold, onSuccess, status]
    );

    useEffect(() => {
      if (status !== 'dragging') {
        return;
      }

      const onMouseMove = (e: MouseEvent) => {
        handleMove(e.clientX);
      };

      const onMouseUp = (e: MouseEvent) => {
        handleEnd(e.clientX);
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length > 0) {
          handleMove(e.touches[0].clientX);
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        const lastTouch = e.changedTouches[0];
        handleEnd(lastTouch ? lastTouch.clientX : undefined);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);

      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      };
    }, [status, handleMove, handleEnd]);

    const isSuccess = status === 'success';
    const isDragging = status === 'dragging';
    const maxOffset = getMaxOffset();
    const progressPercent = maxOffset > 0 ? (offset / maxOffset) * 100 : 0;

    return (
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
        aria-label="人机安全验证滑块"
        aria-disabled={disabled}
        className={className}
        style={{
          position: 'relative',
          width,
          height,
          boxSizing: 'border-box',
          backgroundColor: isSuccess ? '#52c41a' : 'var(--car-bg-layout, #f5f7fa)',
          border: isSuccess
            ? '1px solid #52c41a'
            : '1px solid var(--car-color-border, #d9d9d9)',
          borderRadius: 'var(--car-border-radius, 6px)',
          overflow: 'hidden',
          userSelect: 'none',
          transition: isDragging ? 'none' : 'background-color 0.3s ease, border-color 0.3s ease',
          ...style,
        }}
      >
        {/* 滑动进度条背景 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: isSuccess ? '100%' : `${offset + thumbWidth / 2}px`,
            backgroundColor: isSuccess
              ? '#52c41a'
              : 'var(--car-color-primary-bg, #e6f4ff)',
            transition: isDragging ? 'none' : 'width 0.3s ease, background-color 0.3s ease',
          }}
        />

        {/* 居中文案 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 500,
            color: isSuccess ? '#ffffff' : 'var(--car-text-regular, rgba(0, 0, 0, 0.65))',
            opacity: isSuccess ? 1 : Math.max(0.15, 1 - progressPercent / 100),
            pointerEvents: 'none',
            zIndex: 1,
            transition: isDragging ? 'none' : 'opacity 0.3s ease, color 0.3s ease',
          }}
        >
          {isSuccess ? successText : text}
        </div>

        {/* 拖拽把手 (Thumb) */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            handleStartDrag(e.clientX);
          }}
          onTouchStart={(e) => {
            if (e.touches.length > 0) {
              handleStartDrag(e.touches[0].clientX);
            }
          }}
          style={{
            position: 'absolute',
            left: offset,
            top: 0,
            width: thumbWidth,
            height: '100%',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--car-border-radius, 6px)',
            boxShadow: '0 2px 6px 0 rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : isSuccess ? 'default' : isDragging ? 'grabbing' : 'grab',
            zIndex: 2,
            transition: isDragging ? 'none' : 'left 0.3s cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          {isSuccess ? (
            <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
          ) : (
            <DoubleRightOutlined
              style={{
                color: isDragging ? 'var(--car-color-primary-active, #0958d9)' : 'var(--car-color-primary, #1677ff)',
                fontSize: 15,
              }}
            />
          )}
        </div>
      </div>
    );
  }
);

SliderCaptcha.displayName = 'SliderCaptcha';
