/**
 * pickPathRouter.js — Warehouse Aisle-Aware Shortest Path & TSP Routing Solver
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements S-Shape (Serpentine) aisle traversal with 2-Opt heuristic optimization.
 * 
 * In standard warehouse layouts:
 * - Aisles run parallel along the Z-axis (or X-axis).
 * - Cross-aisles connect the ends of the aisles at Front (Z = 0) and Back (Z = maxZ).
 * - Walking through a rack is physically impossible; travel between different aisles
 *   must navigate to the nearest front or back cross-aisle.
 */

/**
 * Calculates Euclidean distance between two 3D points
 */
function euclideanDistance(p1, p2) {
  const dx = (p1.x || 0) - (p2.x || 0);
  const dy = (p1.y || 0) - (p2.y || 0);
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculates warehouse aisle-aware walking distance between two locations
 * @param {Object} locA - { x, y, z, aisleNumber }
 * @param {Object} locB - { x, y, z, aisleNumber }
 * @param {Object} config - { frontCrossAisleZ, backCrossAisleZ }
 */
function calculateWarehouseDistance(locA, locB, config = {}) {
  const frontZ = config.frontCrossAisleZ !== undefined ? config.frontCrossAisleZ : 0;
  const backZ = config.backCrossAisleZ !== undefined ? config.backCrossAisleZ : 50;

  const zA = locA.z || 0;
  const zB = locB.z || 0;
  const xA = locA.x || 0;
  const xB = locB.x || 0;
  const yDiff = Math.abs((locA.y || 0) - (locB.y || 0));

  // If in the same aisle, direct linear distance + vertical shelf height delta
  if (locA.aisleNumber && locB.aisleNumber && locA.aisleNumber === locB.aisleNumber) {
    return Math.abs(zA - zB) + yDiff * 0.5;
  }

  // If in different aisles, picker must route through either front or back cross-aisle
  const distViaFront = Math.abs(zA - frontZ) + Math.abs(xA - xB) + Math.abs(zB - frontZ);
  const distViaBack  = Math.abs(zA - backZ)  + Math.abs(xA - xB) + Math.abs(zB - backZ);

  return Math.min(distViaFront, distViaBack) + yDiff * 0.5;
}

/**
 * Generates continuous 3D waypoints routing through cross-aisles between two bin locations
 */
function generateAisleWaypoints(locA, locB, config = {}) {
  const frontZ = config.frontCrossAisleZ !== undefined ? config.frontCrossAisleZ : 0;
  const backZ = config.backCrossAisleZ !== undefined ? config.backCrossAisleZ : 50;

  const waypoints = [{ x: locA.x || 0, y: locA.y || 0, z: locA.z || 0 }];

  if (locA.aisleNumber && locB.aisleNumber && locA.aisleNumber === locB.aisleNumber) {
    waypoints.push({ x: locB.x || 0, y: locB.y || 0, z: locB.z || 0 });
    return waypoints;
  }

  const distViaFront = Math.abs((locA.z || 0) - frontZ) + Math.abs((locB.z || 0) - frontZ);
  const distViaBack  = Math.abs((locA.z || 0) - backZ)  + Math.abs((locB.z || 0) - backZ);

  const crossZ = distViaFront <= distViaBack ? frontZ : backZ;

  // Move to cross-aisle exit
  waypoints.push({ x: locA.x || 0, y: 0.1, z: crossZ });
  // Traverse cross-aisle to target aisle
  waypoints.push({ x: locB.x || 0, y: 0.1, z: crossZ });
  // Enter target aisle to destination bin
  waypoints.push({ x: locB.x || 0, y: locB.y || 0, z: locB.z || 0 });

  return waypoints;
}

/**
 * Applies 2-Opt heuristic optimization to eliminate path intersections
 */
function twoOptOptimize(route, distMatrix) {
  let improved = true;
  let bestRoute = [...route];
  let iterations = 0;
  const maxIterations = 50;

  function routeLength(r) {
    let sum = 0;
    for (let i = 0; i < r.length - 1; i++) {
      sum += distMatrix[r[i].index][r[i + 1].index];
    }
    return sum;
  }

  let bestLength = routeLength(bestRoute);

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < bestRoute.length - 2; i++) {
      for (let j = i + 1; j < bestRoute.length - 1; j++) {
        // Reverse sub-segment from i to j
        const newRoute = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1)
        ];
        const newLength = routeLength(newRoute);
        if (newLength < bestLength - 0.01) {
          bestRoute = newRoute;
          bestLength = newLength;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return bestRoute;
}

/**
 * Optimizes a pick route for a set of bin stop locations
 * @param {Array} stops - Array of { id, code, sku, name, qty, aisleNumber, bayNumber, shelfLevel, x, y, z }
 * @param {Object} startPoint - Staging dock or picker origin { x, y, z }
 * @param {Object} endPoint - Packing station or final destination { x, y, z }
 * @param {Object} config - Layout bounds { frontCrossAisleZ, backCrossAisleZ }
 */
function optimizePickPath(stops = [], startPoint = { x: 0, y: 0, z: 0 }, endPoint = { x: 0, y: 0, z: 0 }, config = {}) {
  if (!stops || stops.length === 0) {
    return {
      orderedStops: [],
      totalDistanceMeters: 0,
      unoptimizedDistanceMeters: 0,
      distanceSavedMeters: 0,
      percentSavings: 0,
      waypoints3D: []
    };
  }

  // 1. Initial S-Shape (Serpentine) Heuristic Sort:
  // Sort primarily by Aisle Number ascending.
  // Within alternating aisles, reverse the Z-direction so pickers traverse up one aisle and down the next.
  const stopsWithIndex = stops.map((s, idx) => ({
    ...s,
    originalIndex: idx,
    aisleNumber: s.aisleNumber || 1,
    x: s.x || 0,
    y: s.y || 0,
    z: s.z || 0
  }));

  // Baseline Unoptimized Distance (Sequential / FIFO order as given)
  let unoptimizedDistance = 0;
  let currentPos = startPoint;
  for (const stop of stopsWithIndex) {
    unoptimizedDistance += calculateWarehouseDistance(currentPos, stop, config);
    currentPos = stop;
  }
  unoptimizedDistance += calculateWarehouseDistance(currentPos, endPoint, config);

  // Group stops by aisle
  const aisleMap = {};
  for (const s of stopsWithIndex) {
    const a = s.aisleNumber;
    if (!aisleMap[a]) aisleMap[a] = [];
    aisleMap[a].push(s);
  }

  const sortedAisles = Object.keys(aisleMap).map(Number).sort((a, b) => a - b);
  let sShapeRoute = [];

  sortedAisles.forEach((aisleNum, index) => {
    const aisleStops = aisleMap[aisleNum];
    // Even aisle index -> traverse forward (Z ascending)
    // Odd aisle index -> traverse backward (Z descending)
    if (index % 2 === 0) {
      aisleStops.sort((a, b) => a.z - b.z);
    } else {
      aisleStops.sort((a, b) => b.z - a.z);
    }
    sShapeRoute.push(...aisleStops);
  });

  // 2. Build full node sequence with start and end points
  const allNodes = [
    { ...startPoint, isOrigin: true, code: 'DOCK-START', aisleNumber: 1 },
    ...sShapeRoute,
    { ...endPoint, isDestination: true, code: 'PACKING-END', aisleNumber: 1 }
  ];

  allNodes.forEach((node, idx) => {
    node.index = idx;
  });

  // 3. Distance Matrix Calculation
  const n = allNodes.length;
  const distMatrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        distMatrix[i][j] = 0;
      } else {
        distMatrix[i][j] = calculateWarehouseDistance(allNodes[i], allNodes[j], config);
      }
    }
  }

  // 4. Refine S-Shape with 2-Opt Local Search (keeping start and end fixed)
  const optimizedNodes = twoOptOptimize(allNodes, distMatrix);

  // Extract ordered stops (excluding virtual start and end nodes)
  const orderedStops = [];
  let cumulativeDist = 0;
  const waypoints3D = [{ x: startPoint.x || 0, y: startPoint.y || 0, z: startPoint.z || 0 }];

  for (let i = 0; i < optimizedNodes.length - 1; i++) {
    const curr = optimizedNodes[i];
    const next = optimizedNodes[i + 1];

    const segmentDist = distMatrix[curr.index][next.index];
    cumulativeDist += segmentDist;

    // Generate aisle waypoints
    const segmentWaypoints = generateAisleWaypoints(curr, next, config);
    // Append waypoints (skipping the first as it matches current)
    for (let w = 1; w < segmentWaypoints.length; w++) {
      waypoints3D.push(segmentWaypoints[w]);
    }

    if (!next.isDestination) {
      orderedStops.push({
        ...next,
        stepNumber: orderedStops.length + 1,
        cumulativeDistanceMeters: Math.round(cumulativeDist * 10) / 10
      });
    }
  }

  const totalOptimizedDistance = Math.round(cumulativeDist * 10) / 10;
  const unoptRounded = Math.round(unoptimizedDistance * 10) / 10;
  const saved = Math.max(0, Math.round((unoptRounded - totalOptimizedDistance) * 10) / 10);
  const percentSavings = unoptRounded > 0 ? Math.round((saved / unoptRounded) * 1000) / 10 : 0;

  return {
    orderedStops,
    totalDistanceMeters: totalOptimizedDistance,
    unoptimizedDistanceMeters: unoptRounded,
    distanceSavedMeters: saved,
    percentSavings,
    waypoints3D
  };
}

module.exports = {
  euclideanDistance,
  calculateWarehouseDistance,
  optimizePickPath
};
