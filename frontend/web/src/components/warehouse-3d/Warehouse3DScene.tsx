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
    category?: string;
    lotNumber?: string;
    barcode?: string;
    expiryDate?: string;
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
  cameraPreset?: 'iso' | 'top' | 'dock' | 'side';
  onSelectBin?: (bin: BinNode | null) => void;
  simulationProgress?: number;
  isPlaying?: boolean;
  className?: string;
}

export function Warehouse3DScene({
  bins = [],
  viewMode = 'occupancy',
  highlightedBinId,
  pathWaypoints = [],
  cameraPreset = 'iso',
  onSelectBin,
  simulationProgress = 0,
  isPlaying = true,
  className = ''
}: Warehouse3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoveredBin, setHoveredBin] = useState<BinNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Core Three.js Refs (Persistent Across Renders)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Stable Callback & State Refs (To prevent scene recreation)
  const onSelectBinRef = useRef(onSelectBin);
  useEffect(() => {
    onSelectBinRef.current = onSelectBin;
  }, [onSelectBin]);

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const animProgressRef = useRef(simulationProgress);
  useEffect(() => {
    animProgressRef.current = simulationProgress;
  }, [simulationProgress]);

  const prevHoveredIdRef = useRef<string | null>(null);
  const hoveredBinRef = useRef<BinNode | null>(null);

  // Meshes & Objects
  const binMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const palletMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const rackFramesGroupRef = useRef<THREE.Group | null>(null);
  const pathLineRef = useRef<THREE.Line | null>(null);
  const agvGroupRef = useRef<THREE.Group | null>(null);
  const curveRef = useRef<THREE.CatmullRomCurve3 | null>(null);

  const binLookupRef = useRef<Map<number, BinNode>>(new Map());
  const animationFrameId = useRef<number | null>(null);

  // Color mapper for industrial bins
  const getColorForBin = useCallback((bin: BinNode, mode: 'occupancy' | 'velocity') => {
    if (mode === 'velocity') {
      const v = bin.velocityClassification;
      if (v === 'FAST_A') return new THREE.Color(0xf43f5e); // Hot Rose Red (Class A)
      if (v === 'MEDIUM_B') return new THREE.Color(0xf59e0b); // Industrial Amber (Class B)
      return new THREE.Color(0x06b6d4); // Cool Electric Cyan (Class C)
    }

    // Occupancy mode with high-contrast safety grading
    if (bin.zoneType === 'HAZMAT') return new THREE.Color(0xe11d48);
    if (bin.zoneType === 'HIGH_VALUE') return new THREE.Color(0xa855f7);

    const pct = bin.capacity?.occupancyPercent || 0;
    if (pct === 0) return new THREE.Color(0x27354a); // Distinct Slate Frame for empty
    if (pct < 50) return new THREE.Color(0x10b981); // Emerald Light
    if (pct <= 85) return new THREE.Color(0xf59e0b); // Amber Moderate
    return new THREE.Color(0xef4444); // Crimson Critical / Near Full
  }, []);

  // Helper: Create Aisle Overhead Signboard texture
  const createAisleSignTexture = (text: string, subtitle: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Dark industrial backing
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 512, 128);

    // Yellow hazard accent bar
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 16, 128);
    ctx.fillRect(496, 0, 16, 128);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 62);

    // Subtitle
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(subtitle, 256, 102);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  };

  // 1. Initialize Master 3D Scene (ONCE ON MOUNT)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 1000;
    const height = container.clientHeight || 700;

    // A. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911); // Deep Charcoal Industrial
    scene.fog = new THREE.FogExp2(0x060911, 0.012);
    sceneRef.current = scene;

    // B. Perspective Camera
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1000);
    camera.position.set(24, 22, 24);
    cameraRef.current = camera;

    // C. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // D. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 4;
    controls.maxDistance = 90;
    controls.target.set(0, 2, 0);
    controlsRef.current = controls;

    // E. Lighting Architecture (Industrial High-Bay)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const mainSun = new THREE.DirectionalLight(0xffffff, 1.4);
    mainSun.position.set(25, 40, 20);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 2048;
    mainSun.shadow.mapSize.height = 2048;
    mainSun.shadow.bias = -0.0005;
    scene.add(mainSun);

    const blueFill = new THREE.DirectionalLight(0x38bdf8, 0.6);
    blueFill.position.set(-25, 25, -20);
    scene.add(blueFill);

    // F. Industrial Epoxy Concrete Floor
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a101d,
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor Grid lines
    const grid = new THREE.GridHelper(64, 32, 0x1e293b, 0x0f172a);
    grid.position.y = 0.01;
    scene.add(grid);

    // G. Safety Yellow Travel Arteries & Crosswalk Lines
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
    const zebraMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    // Front Main Forklift Artery (Z = -10.5)
    const frontArtery = new THREE.Mesh(new THREE.PlaneGeometry(50, 0.35), stripMat);
    frontArtery.rotation.x = -Math.PI / 2;
    frontArtery.position.set(0, 0.02, -10.5);
    scene.add(frontArtery);

    // Rear Staging Artery (Z = 10.5)
    const rearArtery = new THREE.Mesh(new THREE.PlaneGeometry(50, 0.35), stripMat);
    rearArtery.rotation.x = -Math.PI / 2;
    rearArtery.position.set(0, 0.02, 10.5);
    scene.add(rearArtery);

    // Zebra crosswalk stripes at dispatch dock
    for (let i = -12; i <= 12; i += 2) {
      const zebra = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.5), zebraMat);
      zebra.rotation.x = -Math.PI / 2;
      zebra.position.set(i, 0.02, -11.8);
      scene.add(zebra);
    }

    // H. Dispatch Loading Docks (3 Overhead Roll-up Doors)
    const dockWallGeo = new THREE.BoxGeometry(40, 6, 0.5);
    const dockWallMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    const dockWall = new THREE.Mesh(dockWallGeo, dockWallMat);
    dockWall.position.set(0, 3, -16);
    scene.add(dockWall);

    const doorGeo = new THREE.BoxGeometry(6, 4.5, 0.6);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
    const bollardGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.2, 16);
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });

    [-12, 0, 12].forEach((dockX, idx) => {
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(dockX, 2.25, -16);
      scene.add(door);

      // Dock Bay Sign
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, 0.8),
        new THREE.MeshBasicMaterial({ map: createAisleSignTexture(`DOCK 0${idx + 1}`, 'INBOUND / OUTBOUND') })
      );
      signMesh.position.set(dockX, 5.1, -15.7);
      scene.add(signMesh);

      // Safety Yellow Bollards
      const b1 = new THREE.Mesh(bollardGeo, bollardMat);
      b1.position.set(dockX - 3.4, 0.6, -14.8);
      const b2 = new THREE.Mesh(bollardGeo, bollardMat);
      b2.position.set(dockX + 3.4, 0.6, -14.8);
      scene.add(b1);
      scene.add(b2);
    });

    // I. Overhead 3D Aisle Signs
    const signGeo = new THREE.PlaneGeometry(3.6, 0.9);
    const aisleLabels = [
      { text: 'AISLE 01', sub: 'HIGH VELOCITY / FAST-A' },
      { text: 'AISLE 02', sub: 'AMBIENT PALLETS' },
      { text: 'AISLE 03', sub: 'RESERVE STORAGE' },
      { text: 'AISLE 04', sub: 'HAZMAT & BULK' }
    ];

    aisleLabels.forEach((info, aIdx) => {
      const aisleX = (aIdx) * 4.2 - ((4 - 1) * 4.2) / 2;
      const signMat = new THREE.MeshBasicMaterial({
        map: createAisleSignTexture(info.text, info.sub),
        side: THREE.DoubleSide
      });
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(aisleX, 6.2, -9.2);
      scene.add(sign);
    });

    // J. Structural Pallet Racking Upright Columns & Beams
    const rackFramesGroup = new THREE.Group();
    const uprightColGeo = new THREE.BoxGeometry(0.08, 5.6, 0.08);
    const uprightColMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.8, roughness: 0.3 }); // Safety Blue
    const beamGeo = new THREE.BoxGeometry(1.4, 0.06, 0.08);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.7, roughness: 0.3 }); // Industrial Orange

    const aislesCount = 4;
    const baysCount = 6;
    for (let a = 0; a < aislesCount; a++) {
      const aisleX = a * 4.2 - ((aislesCount - 1) * 4.2) / 2;
      for (let b = 0; b <= baysCount; b++) {
        const bayZ = b * 2.8 - ((baysCount - 1) * 2.8) / 2 - 1.4;

        // Front upright column
        const colF = new THREE.Mesh(uprightColGeo, uprightColMat);
        colF.position.set(aisleX - 0.75, 2.8, bayZ);
        rackFramesGroup.add(colF);

        // Back upright column
        const colB = new THREE.Mesh(uprightColGeo, uprightColMat);
        colB.position.set(aisleX + 0.75, 2.8, bayZ);
        rackFramesGroup.add(colB);

        // Horizontal shelf support beams across tiers
        if (b < baysCount) {
          const midZ = bayZ + 1.4;
          for (let s = 1; s <= 4; s++) {
            const shelfY = (s - 1) * 1.3 + 0.25;
            const bF = new THREE.Mesh(beamGeo, beamMat);
            bF.position.set(aisleX - 0.75, shelfY, midZ);
            bF.rotation.y = Math.PI / 2;
            const bB = new THREE.Mesh(beamGeo, beamMat);
            bB.position.set(aisleX + 0.75, shelfY, midZ);
            bB.rotation.y = Math.PI / 2;
            rackFramesGroup.add(bF);
            rackFramesGroup.add(bB);
          }
        }
      }
    }
    scene.add(rackFramesGroup);
    rackFramesGroupRef.current = rackFramesGroup;

    // K. AMR / AGV Forklift Autonomous Robot
    const agvGroup = new THREE.Group();
    const chassisGeo = new THREE.BoxGeometry(1.4, 0.45, 1.8);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3, metalness: 0.4 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.35;
    agvGroup.add(chassis);

    const mastGeo = new THREE.BoxGeometry(0.15, 1.4, 0.15);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    const mastL = new THREE.Mesh(mastGeo, mastMat);
    mastL.position.set(-0.35, 1.0, 0.8);
    const mastR = new THREE.Mesh(mastGeo, mastMat);
    mastR.position.set(0.35, 1.0, 0.8);
    agvGroup.add(mastL);
    agvGroup.add(mastR);

    const beaconGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 0.65, -0.4);
    agvGroup.add(beacon);

    const headlightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.08), headlightMat);
    hl1.position.set(-0.45, 0.35, 0.9);
    const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.08), headlightMat);
    hl2.position.set(0.45, 0.35, 0.9);
    agvGroup.add(hl1);
    agvGroup.add(hl2);

    agvGroup.position.set(0, 0, -11);
    scene.add(agvGroup);
    agvGroupRef.current = agvGroup;

    // L. Raycasting for hover & click
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
          if (prevHoveredIdRef.current !== bin._id) {
            prevHoveredIdRef.current = bin._id;
            hoveredBinRef.current = bin;
            setHoveredBin(bin);
          }
          setTooltipPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          container.style.cursor = 'pointer';
          return;
        }
      }
      if (prevHoveredIdRef.current !== null) {
        prevHoveredIdRef.current = null;
        hoveredBinRef.current = null;
        setHoveredBin(null);
      }
      container.style.cursor = 'default';
    };

    const handleClick = () => {
      if (hoveredBinRef.current && onSelectBinRef.current) {
        onSelectBinRef.current(hoveredBinRef.current);
      }
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousemove', handleMouseMove);
    domElement.addEventListener('click', handleClick);

    // M. 60 FPS Render Loop & AGV Spline Simulation
    let tProgress = 0;

    const animate = () => {
      controls.update();

      // Drive AGV along pick curve if waypoints exist
      if (curveRef.current && agvGroupRef.current) {
        if (isPlayingRef.current) {
          tProgress = (tProgress + 0.002) % 1;
        } else {
          tProgress = animProgressRef.current;
        }

        const point = curveRef.current.getPointAt(tProgress);
        const tangent = curveRef.current.getTangentAt(tProgress).normalize();

        agvGroupRef.current.position.set(point.x, 0, point.z);
        const angle = Math.atan2(tangent.x, tangent.z);
        agvGroupRef.current.rotation.y = angle;

        // Flash orange beacon
        beaconMat.color.setHex((Math.sin(performance.now() * 0.01) > 0) ? 0xf97316 : 0x7c2d12);
      }

      renderer.render(scene, camera);
      animationFrameId.current = requestAnimationFrame(animate);
    };
    animate();

    // Resize Observer
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
  }, []); // Run ONCE on mount! Zero unmount churn!

  // 2. Camera Preset Switcher (Independent Effect)
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;

    if (cameraPreset === 'top') {
      cam.position.set(0, 42, 0.1);
      ctrl.target.set(0, 0, 0);
    } else if (cameraPreset === 'dock') {
      cam.position.set(0, 7, -22);
      ctrl.target.set(0, 2, 0);
    } else if (cameraPreset === 'side') {
      cam.position.set(28, 12, 0);
      ctrl.target.set(0, 2, 0);
    } else {
      // Isometric 3D
      cam.position.set(24, 22, 24);
      ctrl.target.set(0, 2, 0);
    }
    ctrl.update();
  }, [cameraPreset]);

  // 3. Render Instanced Pallet Racking & Detailed Bins
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || bins.length === 0) return;

    // Clean up old instances safely
    if (binMeshRef.current) {
      scene.remove(binMeshRef.current);
      binMeshRef.current.geometry.dispose();
      (binMeshRef.current.material as THREE.Material).dispose();
      binMeshRef.current = null;
    }
    if (palletMeshRef.current) {
      scene.remove(palletMeshRef.current);
      palletMeshRef.current.geometry.dispose();
      (palletMeshRef.current.material as THREE.Material).dispose();
      palletMeshRef.current = null;
    }

    // Geometry A: Wooden EUR-Pallet base
    const palletGeo = new THREE.BoxGeometry(1.2, 0.14, 1.0);
    const palletMat = new THREE.MeshStandardMaterial({
      color: 0x92400e, // Timber amber
      roughness: 0.85,
      metalness: 0.05
    });
    const instancedPallets = new THREE.InstancedMesh(palletGeo, palletMat, bins.length);
    instancedPallets.receiveShadow = true;

    // Geometry B: Cargo Box / Bin on top of pallet
    const binGeo = new THREE.BoxGeometry(1.05, 0.85, 0.9);
    const binMat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.15
    });
    const instancedBins = new THREE.InstancedMesh(binGeo, binMat, bins.length);
    instancedBins.castShadow = true;
    instancedBins.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const lookup = new Map<number, BinNode>();

    bins.forEach((bin, idx) => {
      lookup.set(idx, bin);
      const coords = bin.gridCoordinates;

      // 1. Position Pallet
      dummy.position.set(coords.x, coords.y, coords.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instancedPallets.setMatrixAt(idx, dummy.matrix);

      // 2. Position Cargo Carton (stacked on pallet)
      const occPct = bin.capacity?.occupancyPercent || 0;
      const heightScale = Math.max(0.35, occPct / 100);
      dummy.position.set(coords.x, coords.y + 0.1 + (heightScale * 0.85) / 2, coords.z);

      if (highlightedBinId && bin._id === highlightedBinId) {
        dummy.scale.set(1.2, heightScale * 1.2, 1.2);
      } else {
        dummy.scale.set(1, heightScale, 1);
      }
      dummy.updateMatrix();
      instancedBins.setMatrixAt(idx, dummy.matrix);

      // Color coding
      const color = highlightedBinId && bin._id === highlightedBinId
        ? new THREE.Color(0x38bdf8) // Vivid highlight cyan
        : getColorForBin(bin, viewMode);

      instancedBins.setColorAt(idx, color);
    });

    instancedPallets.instanceMatrix.needsUpdate = true;
    instancedBins.instanceMatrix.needsUpdate = true;
    if (instancedBins.instanceColor) instancedBins.instanceColor.needsUpdate = true;

    scene.add(instancedPallets);
    scene.add(instancedBins);

    palletMeshRef.current = instancedPallets;
    binMeshRef.current = instancedBins;
    binLookupRef.current = lookup;
  }, [bins, viewMode, highlightedBinId, getColorForBin]);

  // 4. Render High-Voltage Glowing Pick Route
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (pathLineRef.current) {
      scene.remove(pathLineRef.current);
      pathLineRef.current.geometry.dispose();
      (pathLineRef.current.material as THREE.Material).dispose();
      pathLineRef.current = null;
    }

    if (!pathWaypoints || pathWaypoints.length < 2) {
      curveRef.current = null;
      return;
    }

    // Build Catmull-Rom 3D Curve
    const points = pathWaypoints.map(w => new THREE.Vector3(w.x, 0.25, w.z));
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.25);
    curveRef.current = curve;

    const curvePoints = curve.getPoints(Math.min(points.length * 20, 400));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x06b6d4, // High-voltage Cyan
      linewidth: 4,
      scale: 1,
      dashSize: 1.0,
      gapSize: 0.5
    });

    const pathLine = new THREE.Line(lineGeo, lineMat);
    pathLine.computeLineDistances();
    scene.add(pathLine);
    pathLineRef.current = pathLine;
  }, [pathWaypoints]);

  return (
    <div className={`relative w-full h-full overflow-hidden select-none bg-slate-950 ${className}`}>
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} className="w-full h-full min-h-[620px]" />

      {/* Floating Raycaster Tooltip */}
      {hoveredBin && tooltipPos && (
        <div
          className="pointer-events-none absolute z-30 rounded-xl border border-cyan-500/40 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-md text-xs text-slate-200 min-w-[210px]"
          style={{
            left: `${Math.min(window.innerWidth - 240, tooltipPos.x + 15)}px`,
            top: `${Math.max(10, tooltipPos.y - 75)}px`
          }}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5 font-mono">
            <span className="font-bold text-cyan-300">{hoveredBin.code}</span>
            <span className="text-[10px] text-slate-400">Level {hoveredBin.gridCoordinates.shelfLevel}</span>
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
              <div className="pt-1.5 border-t border-white/5 space-y-0.5">
                <div className="text-[11px] font-medium text-white truncate">
                  📦 {hoveredBin.contents[0].name}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  SKU: {hoveredBin.contents[0].sku} ({hoveredBin.contents[0].quantity} units)
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
