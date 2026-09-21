"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

export type StoryChapter = {
  id: number;
  badge: string;
  title: string;
  subtitle: string;
  narrative: string;
  characterDialogue: string;
  characterMood: "alarm" | "awakening" | "precision" | "victory";
  sceneColor: number;
  ambientColor: number;
  stats: { label: string; value: string }[];
};

export const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 1,
    badge: "ACT I • THE LEGACY CRISIS",
    title: "The Phantom Warehouse",
    subtitle: "When disconnected spreadsheets cost enterprises millions.",
    narrative:
      "In the old era, warehouses were black boxes. Spreadsheets desynchronized, phantom serial numbers multiplied, and warranty claims vanished into bureaucratic voids. Millions in stock leaked undetected through fragmented ledgers.",
    characterDialogue:
      "“CRITICAL ALERT: 4,120 phantom items detected in unverified legacy log. Ledger mismatch rate: 38.4%. Immediate system purge and sensory initialization required.”",
    characterMood: "alarm",
    sceneColor: 0xff3b5c,
    ambientColor: 0x22050b,
    stats: [
      { label: "Phantom Stock Leak", value: "$4.2M/yr" },
      { label: "Audit Discrepancy", value: "38.4%" },
      { label: "Dispute Resolution", value: "14 Days" },
    ],
  },
  {
    id: 2,
    badge: "ACT II • THE AWAKENING",
    title: "AcuBot Online: Quantum Ledger",
    subtitle: "Activation of the multi-tenant neural inventory core.",
    narrative:
      "From the chaos rises AcuBot-Prime — the intelligent sensory custodian of AcuStock. Equipped with sub-millisecond barcode tracking, immutable transaction recording, and strict multi-tenant isolation.",
    characterDialogue:
      "“ONLINE & SYNCHRONIZING: Neural inventory mesh online. Scanning 12,000 pallets. Inbound streams verified. Initializing double-entry serial ledgers.”",
    characterMood: "awakening",
    sceneColor: 0x00f0ff,
    ambientColor: 0x031728,
    stats: [
      { label: "Sync Latency", value: "< 12ms" },
      { label: "Isolation Level", value: "Strict Tenant" },
      { label: "Sensor Resolution", value: "Sub-millimeter" },
    ],
  },
  {
    id: 3,
    badge: "ACT III • THE PRECISION ENGINE",
    title: "Autonomous Flow & Serial Immortality",
    subtitle: "Every item tracked from raw intake to lifetime warranty.",
    narrative:
      "Every single component receives a cryptographic serial identity. Stock-IN automatically validates supplier warranties, Stock-OUT binds seller guarantees, and every movement is permanently sealed in the immutable ledger.",
    characterDialogue:
      "“LEDGER SEALED: Serial #ACU-9021-X routed to Logistics Bay 4. Supplier warranty linked: 24 Months. Automated PDF manifests generated in real-time.”",
    characterMood: "precision",
    sceneColor: 0xf59e0b,
    ambientColor: 0x1f1402,
    stats: [
      { label: "Warranty Accuracy", value: "100.0%" },
      { label: "Inventory Velocity", value: "4.8x Faster" },
      { label: "Dispatch Precision", value: "99.99%" },
    ],
  },
  {
    id: 4,
    badge: "ACT IV • THE SOVEREIGN ENTERPRISE",
    title: "Zero-Leakage Supremacy",
    subtitle: "Complete operational harmony across global enterprise scale.",
    narrative:
      "Warehouses operate with balletic robotic synchronicity. Executive dashboards forecast inventory dry-outs before they occur, role-based controls guard sensitive assets, and audits complete in one single click.",
    characterDialogue:
      "“ENTERPRISE HARMONY ACHIEVED: Zero phantom stock detected. Audit logs verified against cryptographic hash. All systems operating at peak perfection.”",
    characterMood: "victory",
    sceneColor: 0x10b981,
    ambientColor: 0x021c14,
    stats: [
      { label: "Audit Readiness", value: "Instant 100%" },
      { label: "Inventory Loss", value: "0.000%" },
      { label: "ROI Multiple", value: "14.2x" },
    ],
  },
];

interface ThreeLandingSceneProps {
  currentChapterIndex: number;
  onChapterSelect: (index: number) => void;
  activeAction: string | null;
  onActionTriggered?: (action: string) => void;
}

export default function ThreeLandingScene({
  currentChapterIndex,
  onChapterSelect,
  activeAction,
  onActionTriggered,
}: ThreeLandingSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [typedDialogue, setTypedDialogue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [characterActionStatus, setCharacterActionStatus] = useState<string>("Hovering nominal");
  const [interactiveMode, setInteractiveMode] = useState<"orbit" | "scan" | "inspect">("scan");

  // Typewriter effect for AcuBot dialogue
  const currentChapter = STORY_CHAPTERS[currentChapterIndex] || STORY_CHAPTERS[0];
  useEffect(() => {
    setIsTyping(true);
    setTypedDialogue("");
    const text = currentChapter.characterDialogue;
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setTypedDialogue(text.slice(0, i + 1));
        i++;
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, 20);
    return () => clearInterval(interval);
  }, [currentChapterIndex, currentChapter.characterDialogue]);

  // Three.js Scene Setup & Character Construction
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId: number;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050c18, 0.035);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.8, 6.2);
    camera.lookAt(0, 1.2, 0);

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0x1a2e4d, 1.2);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    mainKeyLight.position.set(4, 8, 5);
    mainKeyLight.castShadow = true;
    scene.add(mainKeyLight);

    const moodSpotLight = new THREE.SpotLight(currentChapter.sceneColor, 6.0, 18, Math.PI / 4, 0.4);
    moodSpotLight.position.set(0, 5, 2);
    moodSpotLight.target.position.set(0, 1, 0);
    scene.add(moodSpotLight);
    scene.add(moodSpotLight.target);

    const rimLight = new THREE.PointLight(0x00e5ff, 3.5, 10);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    // 4. Ground Grid & Cyber Floor
    const gridHelper = new THREE.GridHelper(30, 30, 0x00f0ff, 0x1e3a5f);
    gridHelper.position.y = -0.5;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.45;
    scene.add(gridHelper);

    // Subtle reflective circular podium under AcuBot
    const podiumGeo = new THREE.CylinderGeometry(2.4, 2.6, 0.15, 36);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0x0a1526,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x021020,
    });
    const podium = new THREE.Mesh(podiumGeo, podiumMat);
    podium.position.y = -0.5;
    podium.receiveShadow = true;
    scene.add(podium);

    // Holographic energy ring on the podium
    const ringGeo = new THREE.RingGeometry(2.1, 2.3, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: currentChapter.sceneColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const energyRing = new THREE.Mesh(ringGeo, ringMat);
    energyRing.rotation.x = -Math.PI / 2;
    energyRing.position.y = -0.42;
    scene.add(energyRing);

    // ----------------------------------------------------
    // 5. BUILD THE 3D CHARACTER: ACUBOT-PRIME
    // ----------------------------------------------------
    const botGroup = new THREE.Group();
    botGroup.position.set(0, 1.2, 0);
    scene.add(botGroup);

    // Materials
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const goldAccentMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0x78350f,
      emissiveIntensity: 0.3,
    });
    const glowVisorMat = new THREE.MeshBasicMaterial({
      color: currentChapter.sceneColor,
    });
    const coreGlowMat = new THREE.MeshBasicMaterial({
      color: currentChapter.sceneColor,
    });

    // 5A. Torso / Chassis
    const torsoGeo = new THREE.CylinderGeometry(0.38, 0.28, 0.7, 16);
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.castShadow = true;
    botGroup.add(torso);

    // Torso Chest Plate (Beveled trapezoid shape)
    const chestPlateGeo = new THREE.BoxGeometry(0.48, 0.38, 0.22);
    const chestPlate = new THREE.Mesh(chestPlateGeo, armorMat);
    chestPlate.position.set(0, 0.1, 0.18);
    botGroup.add(chestPlate);

    // Glowing Reactor Core in Chest
    const coreGeo = new THREE.SphereGeometry(0.12, 24, 24);
    const coreMesh = new THREE.Mesh(coreGeo, coreGlowMat);
    coreMesh.position.set(0, 0.1, 0.28);
    botGroup.add(coreMesh);

    // Core Gyro Ring around reactor
    const coreRingGeo = new THREE.TorusGeometry(0.17, 0.02, 12, 32);
    const coreRing = new THREE.Mesh(coreRingGeo, goldAccentMat);
    coreRing.position.set(0, 0.1, 0.28);
    botGroup.add(coreRing);

    // 5B. Head & Neck
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.58, 0);
    botGroup.add(headGroup);

    const neckGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.15, 12);
    const neck = new THREE.Mesh(neckGeo, armorMat);
    neck.position.set(0, -0.1, 0);
    headGroup.add(neck);

    // Head Helm
    const helmGeo = new THREE.SphereGeometry(0.32, 24, 24);
    helmGeo.scale(1.0, 0.95, 1.1);
    const helm = new THREE.Mesh(helmGeo, armorMat);
    headGroup.add(helm);

    // Glowing Visor Face Display
    const visorGeo = new THREE.BoxGeometry(0.42, 0.18, 0.15);
    const visorMesh = new THREE.Mesh(visorGeo, glowVisorMat);
    visorMesh.position.set(0, 0.02, 0.28);
    headGroup.add(visorMesh);

    // Animated Digital Eyes inside Visor
    const eyeGeo = new THREE.PlaneGeometry(0.09, 0.04);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.1, 0.03, 0.36);
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.1, 0.03, 0.36);
    headGroup.add(rightEye);

    // Head Antenna / Sensor Horns
    const antennaGeo = new THREE.CylinderGeometry(0.015, 0.03, 0.25, 8);
    const leftAntenna = new THREE.Mesh(antennaGeo, goldAccentMat);
    leftAntenna.position.set(-0.28, 0.22, -0.05);
    leftAntenna.rotation.z = 0.45;
    headGroup.add(leftAntenna);

    const rightAntenna = new THREE.Mesh(antennaGeo, goldAccentMat);
    rightAntenna.position.set(0.28, 0.22, -0.05);
    rightAntenna.rotation.z = -0.45;
    headGroup.add(rightAntenna);

    // 5C. Articulated Arms (Left & Right)
    // Left Arm Group
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.52, 0.25, 0);
    botGroup.add(leftArmGroup);

    const shoulderGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const leftShoulder = new THREE.Mesh(shoulderGeo, goldAccentMat);
    leftArmGroup.add(leftShoulder);

    const bicepGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.32, 12);
    const leftBicep = new THREE.Mesh(bicepGeo, armorMat);
    leftBicep.position.set(0, -0.2, 0);
    leftArmGroup.add(leftBicep);

    const leftForearmGroup = new THREE.Group();
    leftForearmGroup.position.set(0, -0.36, 0);
    leftArmGroup.add(leftForearmGroup);

    const elbowGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const leftElbow = new THREE.Mesh(elbowGeo, goldAccentMat);
    leftForearmGroup.add(leftElbow);

    const forearmGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.3, 12);
    const leftForearm = new THREE.Mesh(forearmGeo, armorMat);
    leftForearm.position.set(0, -0.18, 0);
    leftForearmGroup.add(leftForearm);

    // Left Hand Scanner Emitter
    const scannerGeo = new THREE.CylinderGeometry(0.05, 0.02, 0.1, 12);
    const leftScanner = new THREE.Mesh(scannerGeo, glowVisorMat);
    leftScanner.position.set(0, -0.35, 0);
    leftForearmGroup.add(leftScanner);

    // Right Arm Group
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.52, 0.25, 0);
    botGroup.add(rightArmGroup);

    const rightShoulder = new THREE.Mesh(shoulderGeo, goldAccentMat);
    rightArmGroup.add(rightShoulder);

    const rightBicep = new THREE.Mesh(bicepGeo, armorMat);
    rightBicep.position.set(0, -0.2, 0);
    rightArmGroup.add(rightBicep);

    const rightForearmGroup = new THREE.Group();
    rightForearmGroup.position.set(0, -0.36, 0);
    rightArmGroup.add(rightForearmGroup);

    const rightElbow = new THREE.Mesh(elbowGeo, goldAccentMat);
    rightForearmGroup.add(rightElbow);

    const rightForearm = new THREE.Mesh(forearmGeo, armorMat);
    rightForearm.position.set(0, -0.18, 0);
    rightForearmGroup.add(rightForearm);

    const rightScanner = new THREE.Mesh(scannerGeo, glowVisorMat);
    rightScanner.position.set(0, -0.35, 0);
    rightForearmGroup.add(rightScanner);

    // 5D. Levitation Thruster / Anti-Gravity Ring
    const thrusterGeo = new THREE.CylinderGeometry(0.24, 0.12, 0.25, 16);
    const thruster = new THREE.Mesh(thrusterGeo, armorMat);
    thruster.position.set(0, -0.44, 0);
    botGroup.add(thruster);

    const levRingGeo = new THREE.TorusGeometry(0.35, 0.035, 12, 32);
    const levRing = new THREE.Mesh(levRingGeo, goldAccentMat);
    levRing.rotation.x = Math.PI / 2;
    levRing.position.set(0, -0.48, 0);
    botGroup.add(levRing);

    // Downward Plasma Thrust Cone
    const thrustConeGeo = new THREE.ConeGeometry(0.22, 0.45, 16, 1, true);
    const thrustConeMat = new THREE.MeshBasicMaterial({
      color: currentChapter.sceneColor,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const thrustCone = new THREE.Mesh(thrustConeGeo, thrustConeMat);
    thrustCone.rotation.x = Math.PI;
    thrustCone.position.set(0, -0.7, 0);
    botGroup.add(thrustCone);

    // ----------------------------------------------------
    // 6. DYNAMIC CARGO CRATES & FLOATING SERIAL PALLETS
    // ----------------------------------------------------
    const cratesGroup = new THREE.Group();
    scene.add(cratesGroup);

    const crateGeometry = new THREE.BoxGeometry(0.65, 0.65, 0.65);
    const crateEdges = new THREE.EdgesGeometry(crateGeometry);

    const crates: { mesh: THREE.Mesh; line: THREE.LineSegments; initialY: number; speed: number; rotSpeed: number }[] = [];

    const cratePositions = [
      { x: -2.1, y: 0.1, z: 0.4, rot: 0.2 },
      { x: 2.2, y: 0.3, z: 0.2, rot: -0.35 },
      { x: -1.7, y: 1.4, z: -1.2, rot: 0.6 },
      { x: 1.9, y: 1.6, z: -1.1, rot: -0.4 },
    ];

    cratePositions.forEach((pos, idx) => {
      const cMat = new THREE.MeshStandardMaterial({
        color: idx === 0 ? 0x1e3a8a : idx === 1 ? 0x065f46 : 0x312e81,
        metalness: 0.7,
        roughness: 0.3,
      });
      const crateMesh = new THREE.Mesh(crateGeometry, cMat);
      crateMesh.position.set(pos.x, pos.y, pos.z);
      crateMesh.rotation.y = pos.rot;
      crateMesh.castShadow = true;
      crateMesh.receiveShadow = true;
      cratesGroup.add(crateMesh);

      const edgeLine = new THREE.LineSegments(
        crateEdges,
        new THREE.LineBasicMaterial({ color: currentChapter.sceneColor, transparent: true, opacity: 0.7 })
      );
      crateMesh.add(edgeLine);

      crates.push({
        mesh: crateMesh,
        line: edgeLine,
        initialY: pos.y,
        speed: 0.8 + idx * 0.3,
        rotSpeed: 0.005 * (idx % 2 === 0 ? 1 : -1),
      });
    });

    // ----------------------------------------------------
    // 7. SCANNER LASER CONE & HOLO GRID
    // ----------------------------------------------------
    const laserConeGeo = new THREE.ConeGeometry(0.8, 2.2, 24, 1, true);
    const laserMat = new THREE.MeshBasicMaterial({
      color: currentChapter.sceneColor,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const laserCone = new THREE.Mesh(laserConeGeo, laserMat);
    laserCone.position.set(0, -1.1, 0.4);
    laserCone.visible = true;
    botGroup.add(laserCone);

    // ----------------------------------------------------
    // 8. FLOATING DATA PARTICLES
    // ----------------------------------------------------
    const particleCount = 180;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let p = 0; p < particleCount * 3; p += 3) {
      particlePos[p] = (Math.random() - 0.5) * 12;
      particlePos[p + 1] = Math.random() * 6 - 0.5;
      particlePos[p + 2] = (Math.random() - 0.5) * 10;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.04,
      color: currentChapter.sceneColor,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // ----------------------------------------------------
    // 9. MOUSE & INTERACTION HANDLING
    // ----------------------------------------------------
    let mouseX = 0;
    let mouseY = 0;
    let targetCameraX = 0;
    let targetCameraY = 1.8;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const normX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      mouseX = normX;
      mouseY = normY;
    };

    container.addEventListener("mousemove", handleMouseMove);

    // Clock
    const clock = new THREE.Clock();
    let scanCycle = 0;

    // ----------------------------------------------------
    // 10. ANIMATION LOOP
    // ----------------------------------------------------
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth floating/hovering of AcuBot
      const hoverOffset = Math.sin(elapsedTime * 2.2) * 0.12;
      botGroup.position.y = 1.35 + hoverOffset;
      botGroup.rotation.y = Math.sin(elapsedTime * 0.8) * 0.08;

      // Reactor core spin & pulse
      coreRing.rotation.z += 0.03;
      coreRing.rotation.x += 0.015;
      const corePulse = 1.0 + Math.sin(elapsedTime * 5.0) * 0.2;
      coreMesh.scale.set(corePulse, corePulse, corePulse);

      // Levitation ring spin
      levRing.rotation.z -= 0.04;
      thrustCone.scale.y = 1.0 + Math.sin(elapsedTime * 14.0) * 0.25;

      // Head tracking mouse cursor
      const targetHeadRotY = mouseX * 0.55;
      const targetHeadRotX = -mouseY * 0.35;
      headGroup.rotation.y += (targetHeadRotY - headGroup.rotation.y) * 0.08;
      headGroup.rotation.x += (targetHeadRotX - headGroup.rotation.x) * 0.08;

      // Eye blinking
      const blinkTime = elapsedTime % 4.0;
      if (blinkTime > 3.85) {
        leftEye.scale.y = 0.05;
        rightEye.scale.y = 0.05;
      } else {
        leftEye.scale.y = 1.0;
        rightEye.scale.y = 1.0;
      }

      // Dynamic Arm Animations depending on mode / actions
      if (activeAction === "scan" || interactiveMode === "scan") {
        scanCycle += 0.03;
        leftArmGroup.rotation.x = -0.6 + Math.sin(scanCycle) * 0.2;
        leftForearmGroup.rotation.x = -0.7;
        rightArmGroup.rotation.x = -0.6 - Math.sin(scanCycle) * 0.2;
        rightForearmGroup.rotation.x = -0.7;
        laserCone.visible = true;
        laserCone.rotation.z = Math.sin(elapsedTime * 3) * 0.15;
        laserMat.opacity = 0.18 + Math.sin(elapsedTime * 8) * 0.08;
      } else if (activeAction === "victory") {
        botGroup.rotation.y += 0.05;
        leftArmGroup.rotation.z = -1.2 + Math.sin(elapsedTime * 6) * 0.2;
        rightArmGroup.rotation.z = 1.2 - Math.sin(elapsedTime * 6) * 0.2;
        laserCone.visible = false;
      } else {
        // Idle arm motion
        leftArmGroup.rotation.x = Math.sin(elapsedTime * 1.5) * 0.15;
        leftArmGroup.rotation.z = -0.15;
        rightArmGroup.rotation.x = -Math.sin(elapsedTime * 1.5) * 0.15;
        rightArmGroup.rotation.z = 0.15;
        laserCone.visible = false;
      }

      // Crates smooth bobbing & gentle rotation
      crates.forEach((c, idx) => {
        c.mesh.position.y = c.initialY + Math.sin(elapsedTime * c.speed + idx) * 0.12;
        c.mesh.rotation.y += c.rotSpeed;
      });

      // Floating particles motion
      const positions = particleGeo.attributes.position.array as Float32Array;
      for (let i = 1; i < particleCount * 3; i += 3) {
        positions[i] += 0.008;
        if (positions[i] > 6) {
          positions[i] = -0.5;
        }
      }
      particleGeo.attributes.position.needsUpdate = true;

      // Camera parallax damping
      targetCameraX = mouseX * 0.9;
      targetCameraY = 1.8 + mouseY * 0.4;
      camera.position.x += (targetCameraX - camera.position.x) * 0.04;
      camera.position.y += (targetCameraY - camera.position.y) * 0.04;
      camera.lookAt(0, 1.2, 0);

      renderer.render(scene, camera);
    };

    animate();

    // ----------------------------------------------------
    // 11. RESIZE OBSERVER
    // ----------------------------------------------------
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener("resize", handleResize);

    // Clean up
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [currentChapterIndex, activeAction, interactiveMode, currentChapter.sceneColor]);

  // Action Buttons handlers
  const handleAction = (actionName: string) => {
    if (onActionTriggered) onActionTriggered(actionName);
    if (actionName === "scan") {
      setCharacterActionStatus("Scanning Sector 4 • Pallet #A-901 Verified");
      setInteractiveMode("scan");
    } else if (actionName === "audit") {
      setCharacterActionStatus("Running Hash Check • 0 Ledger Collisions");
      setInteractiveMode("inspect");
    } else if (actionName === "victory") {
      setCharacterActionStatus("All Systems 100% Calibrated & Active");
      setInteractiveMode("orbit");
    }
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-b from-slate-950 via-[#07111e] to-slate-950 shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
      {/* 3D WebGL Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Cybernetic HUD Overlay & Corner Accents */}
      <div className="pointer-events-none absolute inset-0 z-10 p-6 flex flex-col justify-between">
        {/* Top HUD Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
          {/* Character Identity Chip */}
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/75 px-4 py-2.5 backdrop-blur-xl shadow-lg">
            <div className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500"></span>
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-wider text-cyan-400 uppercase">
                AcuBot-Prime • Autonomous Custodian
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                AI CORE v4.8 • {characterActionStatus}
              </div>
            </div>
          </div>

          {/* Interactive Character Command Trigger */}
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/75 p-1.5 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => handleAction("scan")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                interactiveMode === "scan"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              ⚡ Scan Sector
            </button>
            <button
              type="button"
              onClick={() => handleAction("audit")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                interactiveMode === "inspect"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-400/40"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              🛡️ Audit Ledger
            </button>
            <button
              type="button"
              onClick={() => handleAction("victory")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                interactiveMode === "orbit"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              🎉 Victory Spin
            </button>
          </div>
        </div>

        {/* Bottom Dialogue Box & Live Voice HUD */}
        <div className="pointer-events-auto max-w-2xl">
          <div className="relative rounded-2xl border border-cyan-500/30 bg-slate-950/85 p-5 shadow-2xl backdrop-blur-2xl">
            {/* Holographic header indicator */}
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-cyan-300 font-semibold">
                  AcuBot Comm-Link // {currentChapter.badge}
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">STATUS: ACTIVE</span>
            </div>

            {/* Typewriter dialogue content */}
            <p className="font-mono text-sm leading-relaxed text-cyan-100 min-h-[52px]">
              {typedDialogue}
              {isTyping && <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse" />}
            </p>

            {/* Chapter Stepper & Navigation Controls */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div className="flex items-center gap-1.5">
                {STORY_CHAPTERS.map((chap, idx) => (
                  <button
                    key={chap.id}
                    type="button"
                    onClick={() => onChapterSelect(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentChapterIndex
                        ? "w-8 bg-gradient-to-r from-cyan-400 to-amber-300"
                        : "w-2 bg-white/20 hover:bg-white/40"
                    }`}
                    title={`Chapter ${chap.id}: ${chap.title}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentChapterIndex === 0}
                  onClick={() => onChapterSelect(Math.max(0, currentChapterIndex - 1))}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                >
                  ← Prev Act
                </button>
                <button
                  type="button"
                  disabled={currentChapterIndex === STORY_CHAPTERS.length - 1}
                  onClick={() => onChapterSelect(Math.min(STORY_CHAPTERS.length - 1, currentChapterIndex + 1))}
                  className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-md transition hover:from-cyan-400 hover:to-blue-500 disabled:opacity-30"
                >
                  Next Act →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
