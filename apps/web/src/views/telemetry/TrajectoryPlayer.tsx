import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button, Slider, Segmented, Space, Typography, Tooltip, Tag } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  RedoOutlined,
  DashboardOutlined,
  CompassOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import {
  type TrajectoryPoint,
  type InterpolatedTrajectoryState,
  interpolateTrajectory,
  formatDuration,
} from './trajectory-core.ts';

const { Text } = Typography;

export interface TrajectoryPlayerProps {
  points: TrajectoryPoint[];
  plateNumber?: string;
  onProgressChange?: (state: InterpolatedTrajectoryState) => void;
  className?: string;
  style?: React.CSSProperties;
  autoPlay?: boolean;
}

export const TrajectoryPlayer: React.FC<TrajectoryPlayerProps> = ({
  points,
  plateNumber,
  onProgressChange,
  className,
  style,
  autoPlay = false,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [progressFraction, setProgressFraction] = useState<number>(0);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);

  // Animation frame references
  const lastTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const progressRef = useRef<number>(0);
  progressRef.current = progressFraction;

  // Trajectory time window
  const totalDurationMs = useMemo(() => {
    if (points.length < 2) return 0;
    const start = points[0].timestamp;
    const end = points[points.length - 1].timestamp;
    return Math.max(1000, end - start);
  }, [points]);

  // Current interpolated state
  const currentState = useMemo(() => {
    return interpolateTrajectory(points, progressFraction);
  }, [points, progressFraction]);

  // Notify parent of progress change
  useEffect(() => {
    onProgressChange?.(currentState);
  }, [currentState, onProgressChange]);

  // Playback Step
  const step = useCallback(
    (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const deltaTime = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Virtual playback speed calculation:
      // A standard 1x playback runs the trip at a reasonable review rate (e.g. 1 second real-time = 30 seconds trip time)
      const baseTripCompressionFactor = 30; // 30x real-time at 1x multiplier
      const incrementFraction =
        (deltaTime * baseTripCompressionFactor * speedMultiplier) / totalDurationMs;

      const nextFraction = progressRef.current + incrementFraction;

      if (nextFraction >= 1) {
        setProgressFraction(1);
        setIsPlaying(false);
        lastTimeRef.current = null;
      } else {
        setProgressFraction(nextFraction);
        rafIdRef.current = requestAnimationFrame(step);
      }
    },
    [speedMultiplier, totalDurationMs]
  );

  // RAF loop control
  useEffect(() => {
    if (isPlaying && points.length >= 2) {
      if (progressFraction >= 1) {
        setProgressFraction(0);
      }
      lastTimeRef.current = null;
      rafIdRef.current = requestAnimationFrame(step);
    } else {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastTimeRef.current = null;
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying, points, step]);

  // Handlers
  const handlePlayPause = () => {
    if (points.length < 2) return;
    if (progressFraction >= 1) {
      setProgressFraction(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setProgressFraction(0);
    lastTimeRef.current = null;
  };

  const handleSliderChange = (value: number) => {
    const fraction = value / 100;
    setProgressFraction(fraction);
  };

  // Time metrics
  const elapsedSec = Math.round((progressFraction * totalDurationMs) / 1000);
  const remainingSec = Math.max(0, Math.round(((1 - progressFraction) * totalDurationMs) / 1000));
  const totalSec = Math.round(totalDurationMs / 1000);

  // Compass Heading Cardinal Direction
  const headingDirection = useMemo(() => {
    const h = (currentState.heading + 360) % 360;
    if (h >= 337.5 || h < 22.5) return '北 (N)';
    if (h >= 22.5 && h < 67.5) return '东北 (NE)';
    if (h >= 67.5 && h < 112.5) return '东 (E)';
    if (h >= 112.5 && h < 157.5) return '东南 (SE)';
    if (h >= 157.5 && h < 202.5) return '南 (S)';
    if (h >= 202.5 && h < 247.5) return '西南 (SW)';
    if (h >= 247.5 && h < 292.5) return '西 (W)';
    return '西北 (NW)';
  }, [currentState.heading]);

  return (
    <div
      className={`trajectory-player-hud ${className || ''}`}
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderRadius: 12,
        padding: '12px 20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(12px)',
        zIndex: 50,
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        ...style,
      }}
      data-testid="trajectory-player-hud"
    >
      {/* Top Row: Realtime Telematics HUD Gauges */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: 8,
        }}
      >
        {/* Left: Vehicle Plate & Speed Gauge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {plateNumber && (
            <Tag
              color="blue"
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
              }}
            >
              🚗 {plateNumber}
            </Tag>
          )}

          {/* Speed Indicator */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <DashboardOutlined style={{ color: '#1677ff', fontSize: 16 }} />
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>瞬时车速:</Text>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 18,
                fontWeight: 700,
                color: currentState.speed > 0 ? '#52c41a' : 'rgba(255,255,255,0.45)',
              }}
            >
              {currentState.speed.toFixed(1)}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>km/h</span>
          </div>

          {/* Compass Heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CompassOutlined
              style={{
                color: '#faad14',
                fontSize: 16,
                transform: `rotate(${currentState.heading}deg)`,
                transition: 'transform 0.1s linear',
              }}
            />
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>航向角:</Text>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#f8fafc', fontWeight: 600 }}>
              {currentState.heading}°
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>({headingDirection})</span>
          </div>
        </div>

        {/* Right: Timestamp & Remaining Time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 14 }} />
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>回放时刻:</Text>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>
              {currentState.timeFormatted || '--:--:--'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FieldTimeOutlined style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>
              {formatDuration(elapsedSec)} / {formatDuration(totalSec)}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              (余 {formatDuration(remainingSec)})
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Timeline Slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', minWidth: 32 }}>0%</span>
        <div style={{ flex: 1, padding: '0 4px' }}>
          <Slider
            min={0}
            max={100}
            step={0.1}
            value={Number((progressFraction * 100).toFixed(1))}
            onChange={handleSliderChange}
            tooltip={{
              formatter: (v) => `${currentState.timeFormatted} (${v}%)`,
            }}
            styles={{
              track: { backgroundColor: '#1677ff' },
              rail: { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
            }}
            style={{ margin: '6px 0' }}
          />
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', minWidth: 36 }}>
          {(progressFraction * 100).toFixed(0)}%
        </span>
      </div>

      {/* Bottom Controls: Play/Pause, Reset, Speed Multipliers */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Playback action buttons */}
        <Space size="middle">
          <Button
            type="primary"
            shape="round"
            icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={handlePlayPause}
            disabled={points.length < 2}
            style={{
              padding: '0 18px',
              fontWeight: 600,
              backgroundColor: isPlaying ? '#faad14' : '#1677ff',
              borderColor: isPlaying ? '#faad14' : '#1677ff',
            }}
          >
            {isPlaying ? '暂停回放' : progressFraction >= 1 ? '重新播放' : '开始回放'}
          </Button>

          <Tooltip title="重置回放起点">
            <Button
              shape="circle"
              icon={<RedoOutlined />}
              onClick={handleReset}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
              }}
            />
          </Tooltip>
        </Space>

        {/* Speed multiplier selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.65)' }}>倍速:</Text>
          <Segmented
            options={[
              { label: '1x', value: 1 },
              { label: '2x', value: 2 },
              { label: '4x', value: 4 },
              { label: '8x', value: 8 },
              { label: '16x', value: 16 },
            ]}
            value={speedMultiplier}
            onChange={(val) => setSpeedMultiplier(Number(val))}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
            }}
          />
        </div>
      </div>
    </div>
  );
};
