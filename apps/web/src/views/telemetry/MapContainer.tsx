import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button, Tooltip, Tag, Typography } from 'antd';
import {
  PlusOutlined,
  MinusOutlined,
  AimOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  CarOutlined,
} from '@ant-design/icons';
import {
  type Coordinates,
  type MapMarkerItem,
  type ClusterGroup,
  type MapTileLayerType,
  calculateDistanceMeters,
  formatSpeed,
  formatCoordinates,
  calculateBoundingBox,
  clusterMarkers,
  latLngToPixel,
  pixelToLatLng,
  SEED_MAP_VEHICLES,
} from './map-core.ts';

const { Text } = Typography;

export interface MapContainerProps {
  vehicles?: MapMarkerItem[];
  selectedVehicleId?: string;
  onSelectVehicle?: (vehicle: MapMarkerItem | null) => void;
  onTriggerCommand?: (vehicle: MapMarkerItem) => void;
  onViewTrack?: (vehicle: MapMarkerItem) => void;
  center?: Coordinates;
  zoom?: number;
  initialCenter?: Coordinates;
  initialZoom?: number;
  initialLayer?: MapTileLayerType;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  showControls?: boolean;
  showLegend?: boolean;
  showScale?: boolean;
  clusterEnabled?: boolean;
  clusterDistancePx?: number;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  vehicles = SEED_MAP_VEHICLES,
  selectedVehicleId,
  onSelectVehicle,
  onTriggerCommand,
  onViewTrack,
  center: controlledCenter,
  zoom: controlledZoom,
  initialCenter,
  initialZoom = 13,
  initialLayer = 'standard',
  height = 600,
  className,
  style,
  showControls = true,
  showLegend = true,
  showScale = true,
  clusterEnabled = true,
  clusterDistancePx = 50,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport State
  const defaultCenter = useMemo(() => {
    if (initialCenter) return initialCenter;
    if (vehicles.length > 0) return vehicles[0].coordinates;
    return { lat: 22.5428, lng: 113.9389 };
  }, [initialCenter, vehicles]);

  const [center, setCenter] = useState<Coordinates>(controlledCenter || defaultCenter);
  const [zoom, setZoom] = useState<number>(controlledZoom !== undefined ? controlledZoom : initialZoom);
  const [layer, setLayer] = useState<MapTileLayerType>(initialLayer);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(selectedVehicleId || null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: typeof height === 'number' ? height : 600,
  });

  // Dragging State
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startCenter: Coordinates } | null>(null);
  const wheelDeltaAccumulatorRef = useRef<number>(0);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync controlled center & zoom
  useEffect(() => {
    if (controlledCenter) {
      setCenter(controlledCenter);
    }
  }, [controlledCenter]);

  useEffect(() => {
    if (controlledZoom !== undefined) {
      setZoom(controlledZoom);
    }
  }, [controlledZoom]);

  // Sync prop changes
  useEffect(() => {
    if (selectedVehicleId !== undefined) {
      setActiveVehicleId(selectedVehicleId);
      if (selectedVehicleId) {
        const found = vehicles.find((v) => v.id === selectedVehicleId);
        if (found) {
          setCenter(found.coordinates);
          setZoom((prev) => Math.max(prev, 15));
        }
      }
    }
  }, [selectedVehicleId, vehicles]);

  // Update container size dynamically via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Active Vehicle Object
  const activeVehicle = useMemo(() => {
    if (!activeVehicleId) return null;
    return vehicles.find((v) => v.id === activeVehicleId) || null;
  }, [activeVehicleId, vehicles]);

  // Clustering calculation
  const { singles, clusters } = useMemo(() => {
    if (!clusterEnabled) {
      return { singles: vehicles, clusters: [] };
    }
    return clusterMarkers(vehicles, clusterDistancePx, zoom, containerSize.width, containerSize.height);
  }, [vehicles, clusterEnabled, clusterDistancePx, zoom, containerSize.width, containerSize.height]);

  // Screen coordinate projection helper
  const projectToScreen = useCallback(
    (coords: Coordinates) => {
      const centerPx = latLngToPixel(center, zoom);
      const targetPx = latLngToPixel(coords, zoom);
      return {
        x: containerSize.width / 2 + (targetPx.x - centerPx.x),
        y: containerSize.height / 2 + (targetPx.y - centerPx.y),
      };
    },
    [center, zoom, containerSize]
  );

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag when clicking background (not buttons, cards, or markers)
    const target = e.target as HTMLElement;
    if (target.closest('.map-control-interactive')) {
      return;
    }

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startCenter: { ...center },
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.mouseX;
    const dy = e.clientY - dragStartRef.current.mouseY;

    const startCenterPx = latLngToPixel(dragStartRef.current.startCenter, zoom);
    const newCenterPx = {
      x: startCenterPx.x - dx,
      y: startCenterPx.y - dy,
    };

    const newCenter = pixelToLatLng(newCenterPx, zoom);
    setCenter(newCenter);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Scroll wheel zoom with trackpad dampening
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    wheelDeltaAccumulatorRef.current += e.deltaY;
    const threshold = 60; // 60px accumulator for smooth trackpad and mouse wheel

    if (wheelDeltaAccumulatorRef.current <= -threshold) {
      setZoom((z) => Math.min(18, z + 1));
      wheelDeltaAccumulatorRef.current = 0;
    } else if (wheelDeltaAccumulatorRef.current >= threshold) {
      setZoom((z) => Math.max(3, z - 1));
      wheelDeltaAccumulatorRef.current = 0;
    }

    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => {
      wheelDeltaAccumulatorRef.current = 0;
    }, 200);
  };

  // Double click zoom in
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.map-control-interactive')) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const centerPx = latLngToPixel(center, zoom);
    const clickPx = {
      x: centerPx.x + (mouseX - containerSize.width / 2),
      y: centerPx.y + (mouseY - containerSize.height / 2),
    };
    const clickedCoords = pixelToLatLng(clickPx, zoom);

    setCenter(clickedCoords);
    setZoom((z) => Math.min(18, z + 1));
  };

  // Reset view to fit all vehicles
  const handleResetView = () => {
    if (vehicles.length === 0) {
      setCenter(defaultCenter);
      setZoom(13);
      return;
    }
    const bbox = calculateBoundingBox(vehicles.map((v) => v.coordinates));
    setCenter(bbox.center);
    setZoom(bbox.recommendedZoom);
  };

  // Toggle fullscreen
  const handleToggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
      } catch {
        setIsFullscreen(!isFullscreen);
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  };

  // Cluster click to zoom in
  const handleClusterClick = (cluster: ClusterGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    setCenter(cluster.center);
    setZoom((z) => Math.min(18, z + 2));
  };

  // Marker click
  const handleMarkerClick = (vehicle: MapMarkerItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveVehicleId(vehicle.id);
    onSelectVehicle?.(vehicle);
  };

  // Close InfoWindow
  const handleCloseInfoWindow = () => {
    setActiveVehicleId(null);
    onSelectVehicle?.(null);
  };

  // Center on active vehicle
  const handleCenterOnVehicle = (vehicle: MapMarkerItem) => {
    setCenter(vehicle.coordinates);
  };

  // Layer Theme Colors
  const theme = useMemo(() => {
    switch (layer) {
      case 'dark':
        return {
          bg: '#090d16',
          gridLine: 'rgba(30, 58, 138, 0.45)',
          gridText: '#475569',
          roadAvenue: 'rgba(59, 130, 246, 0.22)',
          roadHighway: 'rgba(96, 165, 250, 0.35)',
          roadBorder: 'rgba(30, 64, 175, 0.4)',
          blockFill: 'rgba(15, 23, 42, 0.75)',
          waterFill: 'rgba(2, 6, 23, 0.9)',
          panelBg: 'rgba(15, 23, 42, 0.88)',
          panelBorder: '#1e293b',
          textColor: '#f8fafc',
          textSub: '#94a3b8',
        };
      case 'satellite':
        return {
          bg: '#051923',
          gridLine: 'rgba(16, 185, 129, 0.3)',
          gridText: '#059669',
          roadAvenue: 'rgba(13, 148, 136, 0.25)',
          roadHighway: 'rgba(20, 184, 166, 0.4)',
          roadBorder: 'rgba(4, 120, 87, 0.5)',
          blockFill: 'rgba(6, 78, 59, 0.25)',
          waterFill: 'rgba(2, 44, 34, 0.95)',
          panelBg: 'rgba(6, 78, 59, 0.9)',
          panelBorder: '#065f46',
          textColor: '#ecfdf5',
          textSub: '#a7f3d0',
        };
      case 'standard':
      default:
        return {
          bg: '#f3f6f9',
          gridLine: '#e2e8f0',
          gridText: '#94a3b8',
          roadAvenue: '#ffffff',
          roadHighway: '#fed7aa',
          roadBorder: '#cbd5e1',
          blockFill: '#f8fafc',
          waterFill: '#bae6fd',
          panelBg: 'rgba(255, 255, 255, 0.92)',
          panelBorder: '#e2e8f0',
          textColor: '#0f172a',
          textSub: '#64748b',
        };
    }
  }, [layer]);

  // Scale bar calculation (80px reference)
  const scaleMeters = useMemo(() => {
    const centerPx = latLngToPixel(center, zoom);
    const p1 = pixelToLatLng({ x: centerPx.x - 40, y: centerPx.y }, zoom);
    const p2 = pixelToLatLng({ x: centerPx.x + 40, y: centerPx.y }, zoom);
    return calculateDistanceMeters(p1, p2);
  }, [center, zoom]);

  const formattedScaleText = useMemo(() => {
    if (scaleMeters >= 1000) {
      return `${(scaleMeters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(scaleMeters)} m`;
  }, [scaleMeters]);

  // Procedural SVG Grid Lines & Road Layout
  const gridInterval = useMemo(() => {
    if (zoom >= 16) return 0.005;
    if (zoom >= 14) return 0.01;
    if (zoom >= 12) return 0.02;
    if (zoom >= 10) return 0.05;
    if (zoom >= 8) return 0.1;
    if (zoom >= 6) return 0.5;
    return 1.0;
  }, [zoom]);

  const { gridLines, roadSegments } = useMemo(() => {
    const halfW = containerSize.width / 2;
    const halfH = containerSize.height / 2;
    const centerPx = latLngToPixel(center, zoom);

    const topLeft = pixelToLatLng({ x: centerPx.x - halfW, y: centerPx.y - halfH }, zoom);
    const bottomRight = pixelToLatLng({ x: centerPx.x + halfW, y: centerPx.y + halfH }, zoom);

    const minLat = Math.min(topLeft.lat, bottomRight.lat);
    const maxLat = Math.max(topLeft.lat, bottomRight.lat);
    const minLng = Math.min(topLeft.lng, bottomRight.lng);
    const maxLng = Math.max(topLeft.lng, bottomRight.lng);

    const lines: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      label?: string;
      labelX?: number;
      labelY?: number;
    }> = [];

    // Longitude lines (vertical)
    const startLng = Math.floor(minLng / gridInterval) * gridInterval;
    for (let lng = startLng; lng <= maxLng + gridInterval; lng += gridInterval) {
      const topPt = latLngToPixel({ lat: maxLat, lng }, zoom);
      const botPt = latLngToPixel({ lat: minLat, lng }, zoom);
      const screenX1 = halfW + (topPt.x - centerPx.x);
      const screenY1 = halfH + (topPt.y - centerPx.y);
      const screenX2 = halfW + (botPt.x - centerPx.x);
      const screenY2 = halfH + (botPt.y - centerPx.y);

      lines.push({
        id: `lng-${lng.toFixed(4)}`,
        x1: screenX1,
        y1: screenY1,
        x2: screenX2,
        y2: screenY2,
        label: `${lng.toFixed(2)}°E`,
        labelX: screenX1 + 4,
        labelY: 18,
      });
    }

    // Latitude lines (horizontal)
    const startLat = Math.floor(minLat / gridInterval) * gridInterval;
    for (let lat = startLat; lat <= maxLat + gridInterval; lat += gridInterval) {
      const leftPt = latLngToPixel({ lat, lng: minLng }, zoom);
      const rightPt = latLngToPixel({ lat, lng: maxLng }, zoom);
      const screenX1 = halfW + (leftPt.x - centerPx.x);
      const screenY1 = halfH + (leftPt.y - centerPx.y);
      const screenX2 = halfW + (rightPt.x - centerPx.x);
      const screenY2 = halfH + (rightPt.y - centerPx.y);

      lines.push({
        id: `lat-${lat.toFixed(4)}`,
        x1: screenX1,
        y1: screenY1,
        x2: screenX2,
        y2: screenY2,
        label: `${lat.toFixed(2)}°N`,
        labelX: 10,
        labelY: screenY1 - 4,
      });
    }

    // Procedural roads aligned with grid and diagonals
    const roads: Array<{ id: string; x1: number; y1: number; x2: number; y2: number; isHighway: boolean }> = [];
    const roadInterval = gridInterval * 2;
    const startRoadLng = Math.floor(minLng / roadInterval) * roadInterval;
    for (let lng = startRoadLng; lng <= maxLng + roadInterval; lng += roadInterval) {
      const pt1 = latLngToPixel({ lat: maxLat + 0.1, lng }, zoom);
      const pt2 = latLngToPixel({ lat: minLat - 0.1, lng }, zoom);
      roads.push({
        id: `road-v-${lng}`,
        x1: halfW + (pt1.x - centerPx.x),
        y1: halfH + (pt1.y - centerPx.y),
        x2: halfW + (pt2.x - centerPx.x),
        y2: halfH + (pt2.y - centerPx.y),
        isHighway: Math.round(lng * 100) % 4 === 0,
      });
    }

    const startRoadLat = Math.floor(minLat / roadInterval) * roadInterval;
    for (let lat = startRoadLat; lat <= maxLat + roadInterval; lat += roadInterval) {
      const pt1 = latLngToPixel({ lat, lng: minLng - 0.1 }, zoom);
      const pt2 = latLngToPixel({ lat, lng: maxLng + 0.1 }, zoom);
      roads.push({
        id: `road-h-${lat}`,
        x1: halfW + (pt1.x - centerPx.x),
        y1: halfH + (pt1.y - centerPx.y),
        x2: halfW + (pt2.x - centerPx.x),
        y2: halfH + (pt2.y - centerPx.y),
        isHighway: Math.round(lat * 100) % 4 === 0,
      });
    }

    return { gridLines: lines, roadSegments: roads };
  }, [center, zoom, containerSize, gridInterval]);

  return (
    <div
      ref={containerRef}
      className={`map-container-root ${className || ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: isFullscreen ? '100vh' : height,
        overflow: 'hidden',
        userSelect: 'none',
        backgroundColor: theme.bg,
        cursor: isDragging ? 'grabbing' : 'grab',
        borderRadius: isFullscreen ? 0 : 8,
        border: `1px solid ${theme.panelBorder}`,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        ...style,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      data-testid="gis-map-canvas"
    >
      {/* 1. Procedural Vector GIS Map Surface */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <pattern id="map-mesh-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke={theme.gridLine}
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
          </pattern>
        </defs>

        {/* Mesh Background */}
        <rect width="100%" height="100%" fill="url(#map-mesh-pattern)" />

        {/* Procedural Roads */}
        {roadSegments.map((r) => (
          <g key={r.id}>
            {/* Road border */}
            <line
              x1={r.x1}
              y1={r.y1}
              x2={r.x2}
              y2={r.y2}
              stroke={theme.roadBorder}
              strokeWidth={r.isHighway ? (zoom >= 14 ? 12 : 6) : zoom >= 14 ? 8 : 4}
              strokeLinecap="round"
            />
            {/* Road surface */}
            <line
              x1={r.x1}
              y1={r.y1}
              x2={r.x2}
              y2={r.y2}
              stroke={r.isHighway ? theme.roadHighway : theme.roadAvenue}
              strokeWidth={r.isHighway ? (zoom >= 14 ? 10 : 4) : zoom >= 14 ? 6 : 2}
              strokeLinecap="round"
            />
          </g>
        ))}

        {/* Geographic Grid Lines & Coordinate Labels */}
        {gridLines.map((l) => (
          <g key={l.id}>
            <line
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={theme.gridLine}
              strokeWidth="0.75"
              strokeDasharray="4,4"
            />
            {l.label && l.labelX !== undefined && l.labelY !== undefined && (
              <text
                x={l.labelX}
                y={l.labelY}
                fill={theme.gridText}
                fontSize="10"
                fontFamily="monospace"
                opacity="0.8"
              >
                {l.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* 2. Single Vehicle Markers */}
      {singles.map((veh) => {
        const { x, y } = projectToScreen(veh.coordinates);
        // Skip rendering if way off-screen
        if (x < -100 || x > containerSize.width + 100 || y < -100 || y > containerSize.height + 100) {
          return null;
        }

        const isSelected = veh.id === activeVehicleId;
        const heading = veh.heading ?? 0;

        let statusColor = '#52c41a'; // ONLINE
        if (veh.status === 'OFFLINE') statusColor = '#8c8c8c';
        if (veh.status === 'ALARM') statusColor = '#ff4d4f';

        return (
          <div
            key={veh.id}
            className="map-control-interactive map-marker-vehicle"
            onClick={(e) => handleMarkerClick(veh, e)}
            data-testid={`marker-${veh.id}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
              zIndex: isSelected ? 30 : 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              transition: isDragging ? 'none' : 'transform 0.15s ease',
            }}
          >
            {/* Plate Number Floating Label */}
            <div
              style={{
                backgroundColor: theme.panelBg,
                color: theme.textColor,
                border: `1px solid ${isSelected ? '#1677ff' : theme.panelBorder}`,
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: isSelected
                  ? '0 0 8px rgba(22, 119, 255, 0.6)'
                  : '0 2px 4px rgba(0,0,0,0.15)',
                marginBottom: 2,
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: statusColor,
                  display: 'inline-block',
                }}
              />
              {veh.plateNumber}
            </div>

            {/* Rotated Vehicle SVG Marker with Direction Arrow */}
            <div
              style={{
                position: 'relative',
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: isSelected ? '#1677ff' : theme.panelBg,
                border: `2px solid ${statusColor}`,
                boxShadow: isSelected
                  ? `0 0 12px ${statusColor}`
                  : '0 4px 8px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `rotate(${heading}deg)`,
                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                {/* Direction Pointer Nose */}
                <polygon
                  points="12,2 17,9 14,9 14,20 10,20 10,9 7,9"
                  fill={isSelected ? '#ffffff' : statusColor}
                />
              </svg>

              {/* Alarm Pulse Indicator */}
              {veh.status === 'ALARM' && (
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: '#ff4d4f',
                    border: '2px solid #ffffff',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* 3. Cluster Group Badges */}
      {clusters.map((cluster) => {
        const { x, y } = projectToScreen(cluster.center);
        if (x < -100 || x > containerSize.width + 100 || y < -100 || y > containerSize.height + 100) {
          return null;
        }

        return (
          <div
            key={cluster.id}
            className="map-control-interactive map-marker-cluster"
            onClick={(e) => handleClusterClick(cluster, e)}
            data-testid={`cluster-${cluster.id}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
              zIndex: 25,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
                boxShadow: '0 4px 14px rgba(22, 119, 255, 0.5)',
                border: '2px solid #ffffff',
                transition: 'transform 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              +{cluster.count}
            </div>
          </div>
        );
      })}

      {/* 4. Active Vehicle InfoWindow Popover Card */}
      {activeVehicle && (
        (() => {
          const { x, y } = projectToScreen(activeVehicle.coordinates);
          // Clamp inside container
          const cardWidth = 320;
          const posX = Math.max(16, Math.min(containerSize.width - cardWidth - 16, x - cardWidth / 2));
          const posY = Math.max(16, Math.min(containerSize.height - 240, y - 220));

          let statusTag = <Tag color="success">在线行驶</Tag>;
          if (activeVehicle.status === 'OFFLINE') {
            statusTag = <Tag color="default">熄火离线</Tag>;
          } else if (activeVehicle.status === 'ALARM') {
            statusTag = <Tag color="error">异常告警</Tag>;
          }

          return (
            <div
              className="map-control-interactive map-infowindow"
              data-testid="map-infowindow"
              style={{
                position: 'absolute',
                left: posX,
                top: posY,
                width: cardWidth,
                zIndex: 40,
                backgroundColor: theme.panelBg,
                color: theme.textColor,
                borderRadius: 8,
                border: `1px solid ${theme.panelBorder}`,
                boxShadow: '0 12px 32px 0 rgba(0, 0, 0, 0.25)',
                backdropFilter: 'blur(8px)',
                padding: '12px 14px',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${theme.panelBorder}`,
                  paddingBottom: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CarOutlined style={{ fontSize: 16, color: '#1677ff' }} />
                  <Text strong style={{ fontSize: 15, color: theme.textColor }}>
                    {activeVehicle.plateNumber}
                  </Text>
                  {statusTag}
                </div>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined style={{ color: theme.textSub }} />}
                  onClick={handleCloseInfoWindow}
                  aria-label="关闭详情卡片"
                />
              </div>

              {/* Telematics Meta Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: theme.textSub }}>车型品牌：</span>
                  <span style={{ color: theme.textColor, fontWeight: 500 }}>
                    {activeVehicle.model}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: theme.textSub }}>车架号 VIN：</span>
                  <span style={{ color: theme.textColor, fontFamily: 'monospace' }}>
                    {activeVehicle.vin}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: theme.textSub }}>实时车速：</span>
                  <span style={{ color: '#1677ff', fontWeight: 600 }}>
                    {formatSpeed(activeVehicle.speedKmh)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: theme.textSub }}>蓄电电瓶：</span>
                  <span
                    style={{
                      color:
                        activeVehicle.voltage && activeVehicle.voltage < 11.5
                          ? '#ff4d4f'
                          : '#52c41a',
                      fontWeight: 600,
                    }}
                  >
                    {activeVehicle.voltage ? `${activeVehicle.voltage.toFixed(1)} V` : '--'}
                    {activeVehicle.voltage && activeVehicle.voltage < 11.5 ? ' (欠压)' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: theme.textSub }}>车头朝向：</span>
                  <span style={{ color: theme.textColor }}>
                    {activeVehicle.heading ?? 0}°
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: theme.textSub }}>经纬坐标：</span>
                  <span style={{ color: theme.textColor, fontSize: 11 }}>
                    {formatCoordinates(activeVehicle.coordinates)}
                  </span>
                </div>
                <div style={{ marginTop: 2, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <EnvironmentOutlined style={{ color: theme.textSub, marginTop: 2 }} />
                  <span
                    style={{
                      color: theme.textSub,
                      fontSize: 11,
                      lineHeight: '16px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {activeVehicle.address || '暂无详细道路地址'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: `1px solid ${theme.panelBorder}`,
                }}
              >
                <Button
                  type="primary"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  style={{ flex: 1 }}
                  onClick={() => onTriggerCommand?.(activeVehicle)}
                >
                  远程车控
                </Button>
                <Button
                  size="small"
                  icon={<HistoryOutlined />}
                  style={{ flex: 1 }}
                  onClick={() => onViewTrack?.(activeVehicle)}
                >
                  轨迹回放
                </Button>
                <Button
                  size="small"
                  icon={<AimOutlined />}
                  onClick={() => handleCenterOnVehicle(activeVehicle)}
                  title="居中视野"
                />
              </div>
            </div>
          );
        })()
      )}

      {/* 5. Floating Controls Toolbar (Top Right) */}
      {showControls && (
        <div
          className="map-control-interactive"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: 35,
          }}
        >
          {/* Zoom & Fit Toolbar Card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: theme.panelBg,
              borderRadius: 6,
              border: `1px solid ${theme.panelBorder}`,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Tooltip title="放大 (Zoom In)" placement="left">
              <Button
                type="text"
                icon={<PlusOutlined style={{ color: theme.textColor }} />}
                onClick={() => setZoom((z) => Math.min(18, z + 1))}
                aria-label="放大"
                style={{ width: 36, height: 36, borderRadius: 0 }}
              />
            </Tooltip>
            <Tooltip title="缩小 (Zoom Out)" placement="left">
              <Button
                type="text"
                icon={<MinusOutlined style={{ color: theme.textColor }} />}
                onClick={() => setZoom((z) => Math.max(3, z - 1))}
                aria-label="缩小"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 0,
                  borderTop: `1px solid ${theme.panelBorder}`,
                }}
              />
            </Tooltip>
            <Tooltip title="复位最佳视野 (Fit Bounds)" placement="left">
              <Button
                type="text"
                icon={<AimOutlined style={{ color: theme.textColor }} />}
                onClick={handleResetView}
                aria-label="复位视野"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 0,
                  borderTop: `1px solid ${theme.panelBorder}`,
                }}
              />
            </Tooltip>
            <Tooltip title={isFullscreen ? '退出全屏' : '全屏显示'} placement="left">
              <Button
                type="text"
                icon={
                  isFullscreen ? (
                    <FullscreenExitOutlined style={{ color: theme.textColor }} />
                  ) : (
                    <FullscreenOutlined style={{ color: theme.textColor }} />
                  )
                }
                onClick={handleToggleFullscreen}
                aria-label="全屏切换"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 0,
                  borderTop: `1px solid ${theme.panelBorder}`,
                }}
              />
            </Tooltip>
          </div>

          {/* Layer Style Switcher */}
          <div
            style={{
              backgroundColor: theme.panelBg,
              borderRadius: 6,
              border: `1px solid ${theme.panelBorder}`,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              backdropFilter: 'blur(8px)',
            }}
          >
            <Button
              type={layer === 'standard' ? 'primary' : 'text'}
              size="small"
              onClick={() => setLayer('standard')}
              style={{ fontSize: 11, textAlign: 'left', height: 26 }}
            >
              标准路网
            </Button>
            <Button
              type={layer === 'dark' ? 'primary' : 'text'}
              size="small"
              onClick={() => setLayer('dark')}
              style={{ fontSize: 11, textAlign: 'left', height: 26 }}
            >
              科技暗黑
            </Button>
            <Button
              type={layer === 'satellite' ? 'primary' : 'text'}
              size="small"
              onClick={() => setLayer('satellite')}
              style={{ fontSize: 11, textAlign: 'left', height: 26 }}
            >
              卫星视效
            </Button>
          </div>
        </div>
      )}

      {/* 6. Footer Overlays: Scale Bar & Coordinates (Bottom Left) */}
      {showScale && (
        <div
          className="map-control-interactive"
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            backgroundColor: theme.panelBg,
            border: `1px solid ${theme.panelBorder}`,
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            color: theme.textColor,
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 35,
          }}
        >
          {/* Scale bar graphical line */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 10, lineHeight: '12px', color: theme.textSub }}>
              {formattedScaleText}
            </span>
            <div
              style={{
                width: 80,
                height: 4,
                borderBottom: `2px solid ${theme.textColor}`,
                borderLeft: `2px solid ${theme.textColor}`,
                borderRight: `2px solid ${theme.textColor}`,
              }}
            />
          </div>

          {/* Geographical coordinates & Zoom level */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', color: theme.textColor }}>
              {formatCoordinates(center)}
            </span>
            <Tag
              style={{
                margin: 0,
                fontSize: 10,
                lineHeight: '16px',
                padding: '0 4px',
                backgroundColor: 'transparent',
                borderColor: theme.panelBorder,
                color: theme.textSub,
              }}
            >
              Lv. {zoom}
            </Tag>
          </div>
        </div>
      )}

      {/* 7. Footer Overlays: Vehicle Legend (Bottom Right) */}
      {showLegend && (
        <div
          className="map-control-interactive"
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            backgroundColor: theme.panelBg,
            border: `1px solid ${theme.panelBorder}`,
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 11,
            color: theme.textColor,
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 35,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#52c41a',
              }}
            />
            <span style={{ color: theme.textSub }}>在线行驶</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#8c8c8c',
              }}
            />
            <span style={{ color: theme.textSub }}>熄火离线</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#ff4d4f',
              }}
            />
            <span style={{ color: theme.textSub }}>异常告警</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#1677ff',
              }}
            />
            <span style={{ color: theme.textSub }}>聚合分组</span>
          </div>
        </div>
      )}
    </div>
  );
};
