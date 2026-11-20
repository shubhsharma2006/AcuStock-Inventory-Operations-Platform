'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface BinNode {
  _id: string;
  code: string;
  label?: string;
  zoneType: string;
  velocityClassification: string;
  gridCoordinates: {
    aisleNumber: number;
    bayNumber: number;
    shelfLevel: number;
    binIndex: number;
    x: number;
    y: number;
    z: number;
  };
  capacity: {
    maxUnits: number;
    currentUnits: number;
    occupancyPercent: number;
  };
  contents: Array<{
    stockId: string;
    sku: string;
    name: string;
    quantity: number;
  }>;
  isPickable: boolean;
}

export interface Waypoint3D {
  x: number;
  y: number;
  z: number;
}

interface Warehouse3DSceneProps {
  bins: BinNode[];
  viewMode: 'occupancy' | 'velocity';
  highlightedBinId?: string | null;
  pathWaypoints?: Waypoint3D[];
  onSelectBin?: (bin: BinNode | null) => void;
  className?: string;
}

export function Warehouse3DScene({
  bins = [],
  viewMode = 'occupancy',
  highlightedBinId,
  pathWaypoints = [],
  onSelectBin,
  className = ''
}: Warehouse3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoveredBin, setHoveredBin] = useState<BinNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // References to preserve Three.js state across renders
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const binMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const pathLineRef = useRef<THREE.Line | null>(null);
  const binLookupRef = useRef<Map<number, BinNode>>(new Map());
  const animationFrameId = useRef<number | null>(null);

  // Helper color map
  const getColorForBin = useCallback((bin: BinNode, mode: 'occupancy' | 'velocity') => {
    if (mode === 'velocity') {
      const v = bin.velocityClassification;
      if (v === 'FAST_A') return new THREE.Color(0xf43f5e); // Hot Rose / Red
      if (v === 'MEDIUM_B') return new THREE.Color(0xf59e0b); // Amber / Yellow
      return new THREE.Color(0x06b6d4); // Cool Cyan
    }

    // Occupancy mode
    if (bin.zoneType === 'HAZMAT') return new THREE.Color(0xe11d48);
    if (bin.zoneType === 'HIGH_VALUE') return new THREE.Color(0xa855f7);

    const pct = bin.capacity?.occupancyPercent || 0;
    if (pct === 0) return new THREE.Color(0x334155); // Slate / Empty
    if (pct < 50) return new THREE.Color(0x10b981); // Emerald / Light
    if (pct <= 85) return new THREE.Color(0xf59e0b); // Amber / Moderate
    return new THREE.Color(0xef4444); // Crimson / Full
  }, []);

  // Set camera view preset
  const setCameraPreset = (preset: 'iso' | 'top' | 'dock') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;

    if (preset === 'top') {
      cam.position.set(0, 38, 0);
      ctrl.target.set(0, 0, 0);
    } else if (preset === 'dock') {
      cam.position.set(0, 6, -22);
      ctrl.target.set(0, 2, 0);
    } else {
      // Isometric
      cam.position.set(24, 20, 24);
      ctrl.target.set(0, 2, 0);
    }
    ctrl.update();
  };

  // Initialize Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;

    // 1. Scene & Background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080f1d);
    scene.fog = new THREE.FogExp2(0x080f1d, 0.015);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(24, 20, 24);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent camera sinking under floor
    controls.minDistance = 5;
    controls.maxDistance = 80;
    controls.target.set(0, 2, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 35, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-20, 20, -15);
    scene.add(fillLight);

    // 6. Concrete Floor Grid
    const floorGeo = new THREE.PlaneGeometry(70, 70);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.15
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Floor grid lines
    const grid = new THREE.GridHelper(60, 30, 0x1e293b, 0x111c30);
    grid.position.y = 0.01;
    scene.add(grid);

    // Staging Dock Boundary Line (Safety Yellow)
    const dockGeo = new THREE.RingGeometry(0.05, 0.15, 32);
    const dockMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
    const dockMarker = new THREE.Mesh(dockGeo, dockMat);
    dockMarker.rotation.x = -Math.PI / 2;
    dockMarker.position.set(0, 0.02, -11);
    scene.add(dockMarker);

    // 7. Raycasting for hover & click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (!binMeshRef.current || !cameraRef.current) return;
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObject(binMeshRef.current);

      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const bin = binLookupRef.current.get(intersects[0].instanceId);
        if (bin) {
          setHoveredBin(bin);
          setTooltipPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          container.style.cursor = 'pointer';
          return;
        }
      }
      setHoveredBin(null);
      container.style.cursor = 'default';
    };

    const handleClick = () => {
      if (hoveredBin && onSelectBin) {
        onSelectBin(hoveredBin);
      }
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousemove', handleMouseMove);
    domElement.addEventListener('click', handleClick);

    // 8. Animation Loop
    let time = 0;
    const animate = () => {
      time += 0.02;
      controls.update();

      // Gentle floating animation on path line pulse
      if (pathLineRef.current) {
        const mat = pathLineRef.current.material as THREE.LineDashedMaterial;
        if (mat && mat.dashSize) {
          // Pulse brightness
          mat.color.setHSL(0.52 + Math.sin(time) * 0.04, 0.9, 0.65);
        }
      }

      renderer.render(scene, camera);
      animationFrameId.current = requestAnimationFrame(animate);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      domElement.removeEventListener('mousemove', handleMouseMove);
      domElement.removeEventListener('click', handleClick);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      renderer.dispose();
      controls.dispose();
    };
  }, [getColorForBin, onSelectBin, hoveredBin]);

  // Update Bins Geometry & Mesh on Data Changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || bins.length === 0) return;

    // Remove old bin mesh if exists
    if (binMeshRef.current) {
      scene.remove(binMeshRef.current);
      binMeshRef.current.geometry.dispose();
      (binMeshRef.current.material as THREE.Material).dispose();
      binMeshRef.current = null;
    }

    // Geometry of a standard warehouse storage bin tote
    const binGeo = new THREE.BoxGeometry(0.9, 0.7, 1.1);
    const binMat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.1
    });

    const instancedBins = new THREE.InstancedMesh(binGeo, binMat, bins.length);
    instancedBins.castShadow = true;
    instancedBins.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const lookup = new Map<number, BinNode>();

    bins.forEach((bin, idx) => {
      lookup.set(idx, bin);
      const coords = bin.gridCoordinates;
      dummy.position.set(coords.x, coords.y, coords.z);

      // Slightly enlarge highlighted bin
      if (highlightedBinId && bin._id === highlightedBinId) {
        dummy.scale.set(1.15, 1.15, 1.15);
      } else {
        dummy.scale.set(1, 1, 1);
      }
      dummy.updateMatrix();

      instancedBins.setMatrixAt(idx, dummy.matrix);

      // Color coding
      const color = highlightedBinId && bin._id === highlightedBinId
        ? new THREE.Color(0x38bdf8) // Vivid highlight cyan
        : getColorForBin(bin, viewMode);

      instancedBins.setColorAt(idx, color);
    });

    instancedBins.instanceMatrix.needsUpdate = true;
    if (instancedBins.instanceColor) instancedBins.instanceColor.needsUpdate = true;

    scene.add(instancedBins);
    binMeshRef.current = instancedBins;
    binLookupRef.current = lookup;
  }, [bins, viewMode, highlightedBinId, getColorForBin]);

  // Update Animated Pick Path Spline Curve
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous path
    if (pathLineRef.current) {
      scene.remove(pathLineRef.current);
      pathLineRef.current.geometry.dispose();
      (pathLineRef.current.material as THREE.Material).dispose();
      pathLineRef.current = null;
    }

    if (!pathWaypoints || pathWaypoints.length < 2) return;

    // Create 3D Catmull-Rom smooth curve from waypoints
    const points = pathWaypoints.map(w => new THREE.Vector3(w.x, Math.max(0.2, w.y), w.z));
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
    const curvePoints = curve.getPoints(Math.min(points.length * 15, 300));

    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x06b6d4, // Neon Cyan
      linewidth: 3,
      scale: 1,
      dashSize: 0.8,
      gapSize: 0.4
    });

    const pathLine = new THREE.Line(lineGeo, lineMat);
    pathLine.computeLineDistances();
    scene.add(pathLine);
    pathLineRef.current = pathLine;
  }, [pathWaypoints]);

  return (
    <div className={`relative w-full h-full overflow-hidden rounded-2xl select-none ${className}`}>
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} className="w-full h-full min-h-[500px]" />

      {/* Camera View Switcher Buttons */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 p-1.5 backdrop-blur-md text-xs font-semibold text-slate-300 shadow-xl">
        <button
          type="button"
          onClick={() => setCameraPreset('iso')}
          className="rounded-lg px-2.5 py-1 transition hover:bg-white/10 hover:text-white"
        >
          Isometric 3D
        </button>
        <button
          type="button"
          onClick={() => setCameraPreset('top')}
          className="rounded-lg px-2.5 py-1 transition hover:bg-white/10 hover:text-white"
        >
          2D Floorplan
        </button>
        <button
          type="button"
          onClick={() => setCameraPreset('dock')}
          className="rounded-lg px-2.5 py-1 transition hover:bg-white/10 hover:text-white"
        >
          Dispatch Dock
        </button>
      </div>

      {/* Mode Indicator & Legend Pill */}
      <div className="absolute top-4 right-4 z-10 rounded-xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur-md text-[11px] text-slate-300 shadow-xl space-y-1.5">
        <div className="font-bold text-white uppercase tracking-wider text-[10px]">
          {viewMode === 'occupancy' ? 'Capacity Utilization' : 'ABC Velocity Heatmap'}
        </div>
        {viewMode === 'occupancy' ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" /> Empty</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> &lt;50%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 50-85%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> &gt;85%</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Class A (Fast)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Class B (Medium)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" /> Class C (Slow)</span>
          </div>
        )}
      </div>

      {/* Floating Raycaster Tooltip */}
      {hoveredBin && tooltipPos && (
        <div
          className="pointer-events-none absolute z-20 rounded-xl border border-cyan-500/30 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-md text-xs text-slate-200 min-w-[190px]"
          style={{
            left: `${Math.min(window.innerWidth - 220, tooltipPos.x + 15)}px`,
            top: `${Math.max(10, tooltipPos.y - 65)}px`
          }}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5 font-mono">
            <span className="font-bold text-cyan-300">{hoveredBin.code}</span>
            <span className="text-[10px] text-slate-400">L{hoveredBin.gridCoordinates.shelfLevel}</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Occupancy:</span>
              <span className="font-semibold text-white">{hoveredBin.capacity.occupancyPercent}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Velocity:</span>
              <span className="font-semibold text-amber-300">{hoveredBin.velocityClassification.replace('_', ' ')}</span>
            </div>
            {hoveredBin.contents.length > 0 && (
              <div className="pt-1 text-[11px] text-slate-300 truncate">
                📦 {hoveredBin.contents[0].sku} ({hoveredBin.contents[0].quantity} pcs)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
