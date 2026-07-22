import {
  DEFAULT_PARAMETERS,
  SCENARIOS,
  applyIntervention,
  derivative,
  interpolate,
  simulate,
  summarize,
} from "./model.mjs";

const DAYS = 120;
const PEOPLE = 260;
const TRACE_WIDTH = 1200;
const TRACE_MARGIN_LEFT = 3;
const TRACE_MARGIN_RIGHT = 3;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ink = "17,17,15";
const paper = "#f4f3ef";

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element;
}

const ui = {
  canvas: byId("network-canvas"),
  fieldNote: byId("field-note"),
  phaseTitle: byId("phase-title"),
  phaseDetail: byId("phase-detail"),
  nodeTooltip: byId("node-tooltip"),
  day: byId("day-output"),
  lensLabel: byId("lens-label"),
  trace: byId("trace-chart"),
  traceTooltip: byId("trace-tooltip"),
  traceReadout: byId("trace-readout"),
  play: byId("play-button"),
  conditionsButton: byId("conditions-button"),
  conditions: byId("conditions"),
  conditionsClose: byId("conditions-close"),
  reset: byId("reset-button"),
  lensButton: byId("lens-button"),
  lensSheet: byId("lens-sheet"),
  lensMenu: byId("lens-menu"),
  compareButton: byId("compare-button"),
  compareSheet: byId("compare-sheet"),
  compareMenu: byId("compare-menu"),
  compareNote: byId("compare-note"),
  compareLabel: byId("compare-label"),
  compareResult: byId("compare-result"),
  aboutButton: byId("about-button"),
  aboutDialog: byId("about-dialog"),
  preferredCitation: byId("preferred-citation"),
  copyCitation: byId("copy-citation"),
  copyStatus: byId("copy-status"),
  outcome: byId("outcome-text"),
  peak: byId("peak-output"),
  reach: byId("reach-output"),
  fade: byId("fade-output"),
  controls: {
    influence: byId("influence-slider"),
    dropoff: byId("dropoff-slider"),
    memory: byId("memory-slider"),
    friction: byId("friction-slider"),
    seed: byId("seed-slider"),
  },
  outputs: {
    influence: byId("influence-output"),
    dropoff: byId("dropoff-output"),
    memory: byId("memory-output"),
    friction: byId("friction-output"),
    seed: byId("seed-output"),
  },
};

const context = ui.canvas.getContext("2d");
let scenarioKey = "product";
let parameters = scenarioParameters(scenarioKey);
let series = simulate(parameters);
let summary = summarize(series, parameters);
let intervention = "retention";
let alternativeParameters = applyIntervention(parameters, intervention);
let alternativeSeries = simulate(alternativeParameters);
let alternativeSummary = summarize(alternativeSeries, alternativeParameters);
let currentDay = 0;
let playing = false;
let compareEnabled = false;
let comparePinned = false;
let lensPinned = false;
let previousFrame = null;
let canvasWidth = 0;
let canvasHeight = 0;
let hoveredNode = null;
let pinnedNode = null;
let displayedNodes = [];
let currentPhase = -1;
let noteTimer = null;
let traceDragging = false;
let lastTraceDay = -1;

function scenarioParameters(key) {
  return { ...DEFAULT_PARAMETERS, ...SCENARIOS[key].parameters };
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNetwork() {
  const random = mulberry32(1931);
  const centres = [
    [0.19, 0.31],
    [0.47, 0.20],
    [0.79, 0.32],
    [0.32, 0.72],
    [0.69, 0.70],
  ];
  const nodes = Array.from({ length: PEOPLE }, (_, id) => {
    const community = id % centres.length;
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.58) * (community === 2 ? 0.19 : 0.17);
    return {
      id,
      community,
      x: Math.max(0.035, Math.min(0.965, centres[community][0] + Math.cos(angle) * radius)),
      y: Math.max(0.065, Math.min(0.94, centres[community][1] + Math.sin(angle) * radius)),
      seed: random(),
      rank: 0,
    };
  });

  const activationOrder = nodes.map((node) => node.id);
  for (let index = activationOrder.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [activationOrder[index], activationOrder[swap]] = [activationOrder[swap], activationOrder[index]];
  }
  activationOrder.forEach((nodeId, rank) => { nodes[nodeId].rank = rank; });

  const edgeKeys = new Set();
  const edges = [];
  const neighbours = Array.from({ length: PEOPLE }, () => new Set());
  function connect(a, b) {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ a, b, seed: random() });
    neighbours[a].add(b);
    neighbours[b].add(a);
  }

  nodes.forEach((node) => {
    const local = nodes
      .filter((candidate) => candidate.community === node.community && candidate.id !== node.id)
      .sort((a, b) => ((a.x - node.x) ** 2 + (a.y - node.y) ** 2) - ((b.x - node.x) ** 2 + (b.y - node.y) ** 2));
    connect(node.id, local[0].id);
    connect(node.id, local[1].id);
    if (node.id % 7 === 0) connect(node.id, local[2].id);
    if (node.id % 11 === 0) {
      const nextCommunity = (node.community + 1 + Math.floor(random() * 3)) % centres.length;
      const bridges = nodes.filter((candidate) => candidate.community === nextCommunity);
      connect(node.id, bridges[Math.floor(random() * bridges.length)].id);
    }
  });
  return { nodes, edges, neighbours };
}

const network = buildNetwork();

function resizeCanvas() {
  const rectangle = ui.canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvasWidth = rectangle.width;
  canvasHeight = rectangle.height;
  ui.canvas.width = Math.max(1, Math.round(canvasWidth * ratio));
  ui.canvas.height = Math.max(1, Math.round(canvasHeight * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawNetwork(performance.now());
}

function stateCounts(point, params = parameters) {
  const total = params.initialPotential + params.initialActive;
  const potential = Math.max(0, Math.min(PEOPLE, Math.round((point.potential / total) * PEOPLE)));
  const active = Math.max(0, Math.min(PEOPLE - potential, Math.round((point.active / total) * PEOPLE)));
  return { potential, active, churned: PEOPLE - potential - active };
}

function statusFor(node, counts) {
  if (node.rank < counts.churned) return "churned";
  if (node.rank < counts.churned + counts.active) return "active";
  return "potential";
}

function activeProbeId() {
  return pinnedNode ?? hoveredNode;
}

function relatedToProbe(nodeId) {
  const probeId = activeProbeId();
  if (probeId === null) return true;
  return nodeId === probeId || network.neighbours[probeId].has(nodeId);
}

function drawOpenNode(node, alpha) {
  context.beginPath();
  context.arc(node.px, node.py, 2.15, 0, Math.PI * 2);
  context.strokeStyle = `rgba(${ink},${alpha})`;
  context.lineWidth = 0.72;
  context.stroke();
}

function drawActiveNode(node, alpha, timestamp, information) {
  const pulse = reducedMotion ? 0.5 : (timestamp * 0.0003 + node.seed) % 1;
  if (node.seed < Math.min(0.48, information * 1.5)) {
    context.beginPath();
    context.arc(node.px, node.py, 4.5 + pulse * 9, 0, Math.PI * 2);
    context.strokeStyle = `rgba(${ink},${alpha * (1 - pulse) * 0.18})`;
    context.lineWidth = 0.7;
    context.stroke();
  }
  context.beginPath();
  context.arc(node.px, node.py, 2.9, 0, Math.PI * 2);
  context.fillStyle = `rgba(${ink},${alpha})`;
  context.fill();
}

function drawChurnedNode(node, alpha) {
  const radius = 2.25;
  context.beginPath();
  context.moveTo(node.px - radius, node.py - radius);
  context.lineTo(node.px + radius, node.py + radius);
  context.moveTo(node.px + radius, node.py - radius);
  context.lineTo(node.px - radius, node.py + radius);
  context.strokeStyle = `rgba(${ink},${alpha * 0.58})`;
  context.lineWidth = 0.7;
  context.stroke();
}

function drawGhostNode(node, alpha) {
  context.save();
  context.setLineDash([1.5, 2.5]);
  context.beginPath();
  context.arc(node.px, node.py, 5.8, 0, Math.PI * 2);
  context.strokeStyle = `rgba(${ink},${alpha * 0.42})`;
  context.lineWidth = 0.8;
  context.stroke();
  context.restore();
}

function drawNetwork(timestamp) {
  if (!canvasWidth || !canvasHeight) return;
  context.clearRect(0, 0, canvasWidth, canvasHeight);

  const point = interpolate(series, currentDay);
  const counts = stateCounts(point);
  const alternativePoint = interpolate(alternativeSeries, currentDay);
  const alternativeCounts = stateCounts(alternativePoint, alternativeParameters);
  const horizontalPadding = Math.min(42, canvasWidth * 0.04);
  const verticalPadding = Math.min(34, canvasHeight * 0.07);
  const width = canvasWidth - 2 * horizontalPadding;
  const height = canvasHeight - 2 * verticalPadding;

  displayedNodes = network.nodes.map((node) => ({
    ...node,
    px: horizontalPadding + node.x * width,
    py: verticalPadding + node.y * height,
    status: statusFor(node, counts),
    alternativeStatus: statusFor(node, alternativeCounts),
  }));

  const probeId = activeProbeId();
  network.edges.forEach((edge) => {
    const a = displayedNodes[edge.a];
    const b = displayedNodes[edge.b];
    const incident = probeId !== null && (edge.a === probeId || edge.b === probeId);
    const carries = a.status === "active" || b.status === "active";
    const alpha = incident ? 0.52 : carries ? 0.095 : probeId === null ? 0.026 : 0.009;
    context.beginPath();
    context.moveTo(a.px, a.py);
    context.lineTo(b.px, b.py);
    context.strokeStyle = `rgba(${ink},${alpha})`;
    context.lineWidth = incident ? 0.9 : 0.55;
    context.stroke();

    if (carries && point.information > 0.018 && edge.seed < Math.min(0.68, point.information * 1.8)) {
      const travel = reducedMotion ? 0.52 : (timestamp * 0.00012 + edge.seed + currentDay * 0.009) % 1;
      const x = a.px + (b.px - a.px) * travel;
      const y = a.py + (b.py - a.py) * travel;
      context.beginPath();
      context.arc(x, y, 1.15, 0, Math.PI * 2);
      context.fillStyle = `rgba(${ink},${incident ? 0.95 : 0.48})`;
      context.fill();
    }
  });

  displayedNodes.forEach((node) => {
    const related = relatedToProbe(node.id);
    const alpha = related ? 0.94 : probeId === null ? 0.72 : 0.11;
    if (compareEnabled && node.alternativeStatus === "active" && node.status !== "active") {
      drawGhostNode(node, related ? 1 : 0.28);
    }
    if (node.status === "active") drawActiveNode(node, alpha, timestamp, point.information);
    else if (node.status === "churned") drawChurnedNode(node, alpha);
    else drawOpenNode(node, alpha);
  });

  if (probeId !== null) {
    const probe = displayedNodes[probeId];
    context.beginPath();
    context.arc(probe.px, probe.py, 8.5, 0, Math.PI * 2);
    context.strokeStyle = `rgba(${ink},0.9)`;
    context.lineWidth = 0.8;
    context.stroke();
  }
}

function percentage(value, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function padded(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  return Math.round(value).toString().padStart(3, "0");
}

function audienceMeasures(point, params = parameters) {
  const total = params.initialPotential + params.initialActive;
  return {
    active: Math.max(0, point.active / total),
    reached: Math.max(0, Math.min(1, 1 - point.potential / total)),
    attention: Math.max(0, point.information * 100),
  };
}

function phaseForDay(point) {
  if (currentDay < 2) return [0, "A small seed begins to move.", "Move across the field to inspect its local structure."];
  if (currentDay < summary.peakDay * 0.55) return [1, "Attention starts to compound.", "A few active clusters make the field visible to the next wave."];
  if (currentDay < summary.peakDay - 2) return [2, "The field accelerates.", "Participation now crosses the spaces between communities."];
  if (Math.abs(currentDay - summary.peakDay) <= 2.5) return [3, "Peak is a turning point.", "New participation can no longer outrun drop-off and crowding."];
  if (point.active > summary.peakActive * 0.28) return [4, "Reach rises as activity falls.", "Most people have seen it; fewer remain involved."];
  return [5, "Only the echo remains.", "Circulating information outlives active participation."];
}

function revealFieldNote(title, detail) {
  ui.phaseTitle.textContent = title;
  ui.phaseDetail.textContent = detail;
  ui.fieldNote.classList.add("is-visible");
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => ui.fieldNote.classList.remove("is-visible"), reducedMotion ? 5000 : 3300);
}

function updateLiveState(forceNote = false) {
  const point = interpolate(series, currentDay);
  const measures = audienceMeasures(point);
  const [phaseIndex, title, detail] = phaseForDay(point);
  ui.day.textContent = padded(currentDay);
  ui.traceReadout.textContent = `${percentage(measures.active).padStart(3, "0")} active · ${percentage(measures.reached).padStart(3, "0")} reached · attention ${Math.round(measures.attention).toString().padStart(2, "0")}`;
  if (forceNote || phaseIndex !== currentPhase) {
    currentPhase = phaseIndex;
    revealFieldNote(title, detail);
  }
}

function linePath(data, xScale, yScale, accessor) {
  return data.map((point, index) => `${index ? "L" : "M"}${xScale(point.day).toFixed(2)},${yScale(accessor(point)).toFixed(2)}`).join(" ");
}

function renderTrace() {
  const width = TRACE_WIDTH;
  const height = 116;
  const margin = { top: 9, right: TRACE_MARGIN_RIGHT, bottom: 18, left: TRACE_MARGIN_LEFT };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const total = parameters.initialPotential + parameters.initialActive;
  const x = (day) => margin.left + (day / DAYS) * innerWidth;
  const maximumActive = Math.max(...series.map((point) => point.active / total), 0.001);
  const maximumInformation = Math.max(...series.map((point) => point.information), 0.001);
  const y = (normalised) => margin.top + (1 - normalised) * innerHeight;
  const activeValue = (point) => (point.active / total) / maximumActive;
  const reachValue = (point) => Math.max(0, Math.min(1, 1 - point.potential / total));
  const attentionValue = (point) => point.information / maximumInformation;
  const currentPoint = interpolate(series, currentDay);
  const currentX = x(currentDay);
  const alternativeTotal = alternativeParameters.initialPotential + alternativeParameters.initialActive;
  const alternativeMax = Math.max(...alternativeSeries.map((point) => point.active / alternativeTotal), 0.001);
  const alternativeValue = (point) => (point.active / alternativeTotal) / alternativeMax;
  const ticks = [0, 60, 120].map((day) => {
    const tickX = x(day);
    const anchor = day === 0 ? "start" : day === DAYS ? "end" : "middle";
    return `<line class="trace-tick" x1="${tickX}" x2="${tickX}" y1="${height - margin.bottom - 4}" y2="${height - margin.bottom + 4}"/><text class="trace-label" x="${tickX}" y="${height - 3}" text-anchor="${anchor}">${day}</text>`;
  }).join("");

  ui.trace.innerHTML = `
    <line class="trace-baseline" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"/>
    ${compareEnabled ? `<path class="trace-alternative" d="${linePath(alternativeSeries, x, y, alternativeValue)}"/>` : ""}
    <path class="trace-reach" d="${linePath(series, x, y, reachValue)}"/>
    <path class="trace-attention" d="${linePath(series, x, y, attentionValue)}"/>
    <path class="trace-active" d="${linePath(series, x, y, activeValue)}"/>
    <line class="trace-current" x1="${currentX}" x2="${currentX}" y1="${margin.top}" y2="${height - margin.bottom}"/>
    <circle class="trace-current-dot" cx="${currentX}" cy="${y(activeValue(currentPoint))}" r="2.4"/>
    ${ticks}
    <rect class="trace-hit" x="${margin.left}" y="0" width="${innerWidth}" height="${height}" fill="transparent"/>
  `;
  lastTraceDay = Math.floor(currentDay);
}

function dayFromTracePointer(event) {
  const rectangle = ui.trace.getBoundingClientRect();
  const svgX = ((event.clientX - rectangle.left) / rectangle.width) * TRACE_WIDTH;
  const innerWidth = TRACE_WIDTH - TRACE_MARGIN_LEFT - TRACE_MARGIN_RIGHT;
  return Math.max(0, Math.min(DAYS, ((svgX - TRACE_MARGIN_LEFT) / innerWidth) * DAYS));
}

function showTraceProbe(event) {
  const hoverDay = dayFromTracePointer(event);
  const hoverPoint = interpolate(series, hoverDay);
  const measures = audienceMeasures(hoverPoint);
  const rectangle = ui.trace.getBoundingClientRect();
  ui.traceTooltip.hidden = false;
  ui.traceTooltip.style.left = `${Math.max(4, Math.min(rectangle.width - 174, event.clientX - rectangle.left + 9))}px`;
  ui.traceTooltip.style.top = `${Math.max(3, event.clientY - rectangle.top - 29)}px`;
  ui.traceTooltip.textContent = `${padded(hoverDay)} · ${percentage(measures.active)} active · ${percentage(measures.reached)} reached`;
}

function setDayFromTrace(event) {
  currentDay = dayFromTracePointer(event);
  pause();
  updateAll(true);
}

function frictionLabel(value) {
  if (value < 0.035) return "low";
  if (value < 0.075) return "moderate";
  return "high";
}

function updateControlOutputs() {
  ui.outputs.influence.textContent = percentage(parameters.influence);
  ui.outputs.dropoff.textContent = `${(parameters.dropoff * 100).toFixed(1)}% / day`;
  ui.outputs.memory.textContent = `${Math.round(Math.log(2) / parameters.attentionDecay)} days`;
  ui.outputs.friction.textContent = frictionLabel(parameters.crowding);
  ui.outputs.seed.textContent = percentage(parameters.initialAttention);
}

function setControlsFromParameters() {
  ui.controls.influence.value = parameters.influence;
  ui.controls.dropoff.value = parameters.dropoff;
  ui.controls.memory.value = Math.round(Math.log(2) / parameters.attentionDecay);
  ui.controls.friction.value = parameters.crowding;
  ui.controls.seed.value = parameters.initialAttention;
  updateControlOutputs();
}

function readControls() {
  const crowding = Number(ui.controls.friction.value);
  parameters = {
    ...parameters,
    influence: Number(ui.controls.influence.value),
    dropoff: Number(ui.controls.dropoff.value),
    attentionDecay: Math.log(2) / Number(ui.controls.memory.value),
    crowding,
    cubicLoss: crowding * 0.20,
    initialAttention: Number(ui.controls.seed.value),
  };
  updateControlOutputs();
}

function updateSummary() {
  ui.peak.textContent = padded(summary.peakDay);
  ui.reach.textContent = Math.round(summary.reach * 100).toString().padStart(3, "0");
  ui.fade.textContent = padded(summary.fadeDay);
  const fadeText = summary.fadeDay === null ? "after day 120" : `day ${Math.round(summary.fadeDay)}`;
  ui.outcome.textContent = `Peak day ${Math.round(summary.peakDay)} · ${percentage(summary.reach)} reached · fades ${fadeText}`;

  const change = ((alternativeSummary.engagementDays / summary.engagementDays) - 1) * 100;
  const peakShift = alternativeSummary.peakDay - summary.peakDay;
  const fadeShift = (alternativeSummary.fadeDay ?? DAYS) - (summary.fadeDay ?? DAYS);
  const interventionLabels = {
    retention: "keep people longer",
    seed: "double the seed",
    memory: "slow the fade",
    friction: "reduce crowding",
  };
  ui.compareLabel.textContent = interventionLabels[intervention];
  if (Math.abs(change) >= 1) {
    ui.compareResult.textContent = `${change > 0 ? "+" : ""}${change.toFixed(0)}% cumulative participation`;
  } else if (Math.abs(peakShift) >= 1) {
    ui.compareResult.textContent = `peak ${Math.abs(peakShift).toFixed(0)} days ${peakShift > 0 ? "later" : "earlier"}`;
  } else if (Math.abs(fadeShift) >= 1) {
    ui.compareResult.textContent = `fade ${Math.abs(fadeShift).toFixed(0)} days ${fadeShift > 0 ? "later" : "earlier"}`;
  } else {
    ui.compareResult.textContent = "trajectory nearly unchanged";
  }
}

function updateScenarioLabels() {
  const scenario = SCENARIOS[scenarioKey];
  ui.lensLabel.textContent = scenario.label.toLowerCase();
  const ids = ["key-potential", "key-active", "key-churned"];
  ids.forEach((id, index) => { byId(id).textContent = scenario.nouns[index].toLowerCase(); });
}

function recompute(keepDay = true) {
  series = simulate(parameters);
  summary = summarize(series, parameters);
  alternativeParameters = applyIntervention(parameters, intervention);
  alternativeSeries = simulate(alternativeParameters);
  alternativeSummary = summarize(alternativeSeries, alternativeParameters);
  if (!keepDay) currentDay = 0;
  currentDay = Math.max(0, Math.min(DAYS, currentDay));
  currentPhase = -1;
  updateSummary();
  updateAll(true);
}

function updateAll(forceNote = false) {
  updateLiveState(forceNote);
  renderTrace();
  drawNetwork(performance.now());
}

function pause() {
  playing = false;
  ui.play.textContent = currentDay >= DAYS ? "Again" : "Play";
  previousFrame = null;
}

function setScenario(key) {
  scenarioKey = key;
  parameters = scenarioParameters(key);
  document.querySelectorAll("[data-scenario]").forEach((button) => {
    const active = button.dataset.scenario === key;
    button.setAttribute("aria-pressed", String(active));
  });
  updateScenarioLabels();
  setControlsFromParameters();
  pause();
  recompute(false);
  lensPinned = false;
  ui.lensSheet.hidden = true;
  ui.lensButton.setAttribute("aria-expanded", "false");
}

function setIntervention(key) {
  intervention = key;
  document.querySelectorAll("[data-intervention]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.intervention === key));
  });
  alternativeParameters = applyIntervention(parameters, intervention);
  alternativeSeries = simulate(alternativeParameters);
  alternativeSummary = summarize(alternativeSeries, alternativeParameters);
  updateSummary();
  renderTrace();
  drawNetwork(performance.now());
}

function setCompare(enabled, pinned = comparePinned) {
  compareEnabled = enabled;
  comparePinned = pinned;
  ui.compareButton.setAttribute("aria-pressed", String(enabled));
  ui.compareButton.setAttribute("aria-expanded", String(!ui.compareSheet.hidden));
  ui.compareNote.hidden = !enabled;
  renderTrace();
  drawNetwork(performance.now());
}

function openConditions(open) {
  ui.conditions.classList.toggle("is-open", open);
  ui.conditions.setAttribute("aria-hidden", String(!open));
  ui.conditions.inert = !open;
  ui.conditionsButton.setAttribute("aria-expanded", String(open));
}

function showLensSheet(show) {
  ui.lensSheet.hidden = !show;
  ui.lensButton.setAttribute("aria-expanded", String(show));
}

function showCompareSheet(show) {
  ui.compareSheet.hidden = !show;
  ui.compareButton.setAttribute("aria-expanded", String(show));
}

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => setScenario(button.dataset.scenario));
});

document.querySelectorAll("[data-intervention]").forEach((button) => {
  button.addEventListener("click", () => {
    setIntervention(button.dataset.intervention);
    comparePinned = true;
    setCompare(true, true);
  });
});

Object.values(ui.controls).forEach((control) => {
  control.addEventListener("input", () => {
    readControls();
    recompute(true);
  });
});

ui.play.addEventListener("click", () => {
  if (currentDay >= DAYS) currentDay = 0;
  playing = !playing;
  ui.play.textContent = playing ? "Pause" : "Play";
  previousFrame = null;
  updateAll(true);
});

ui.conditionsButton.addEventListener("click", (event) => {
  const opening = !ui.conditions.classList.contains("is-open");
  openConditions(opening);
  if (opening && event.detail === 0) ui.conditionsClose.focus();
});
ui.conditionsClose.addEventListener("click", (event) => {
  openConditions(false);
  if (event.detail === 0) ui.conditionsButton.focus();
});
ui.reset.addEventListener("click", () => setScenario(scenarioKey));

ui.lensButton.addEventListener("click", () => {
  lensPinned = !lensPinned;
  showLensSheet(lensPinned || ui.lensSheet.hidden);
});
ui.lensMenu.addEventListener("pointerenter", () => showLensSheet(true));
ui.lensMenu.addEventListener("pointerleave", () => { if (!lensPinned) showLensSheet(false); });
ui.lensMenu.addEventListener("focusin", () => showLensSheet(true));
ui.lensMenu.addEventListener("focusout", (event) => {
  if (!lensPinned && !ui.lensMenu.contains(event.relatedTarget)) showLensSheet(false);
});

ui.compareButton.addEventListener("click", () => {
  comparePinned = !comparePinned;
  showCompareSheet(comparePinned);
  setCompare(comparePinned, comparePinned);
});
ui.compareMenu.addEventListener("pointerenter", () => {
  showCompareSheet(true);
  if (!comparePinned) setCompare(true, false);
});
ui.compareMenu.addEventListener("pointerleave", () => {
  if (!comparePinned) {
    showCompareSheet(false);
    setCompare(false, false);
  }
});
ui.compareMenu.addEventListener("focusin", () => {
  showCompareSheet(true);
  if (!comparePinned) setCompare(true, false);
});
ui.compareMenu.addEventListener("focusout", (event) => {
  if (!comparePinned && !ui.compareMenu.contains(event.relatedTarget)) {
    showCompareSheet(false);
    setCompare(false, false);
  }
});

ui.aboutButton.addEventListener("click", () => ui.aboutDialog.showModal());

ui.copyCitation.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(ui.preferredCitation.textContent.trim());
    ui.copyStatus.textContent = "Copied.";
  } catch {
    ui.copyStatus.textContent = "Select the citation above to copy.";
  }
  window.setTimeout(() => { ui.copyStatus.textContent = ""; }, 2400);
});

ui.canvas.addEventListener("pointermove", (event) => {
  const rectangle = ui.canvas.getBoundingClientRect();
  const x = event.clientX - rectangle.left;
  const y = event.clientY - rectangle.top;
  let nearest = null;
  let nearestDistance = 12;
  displayedNodes.forEach((node) => {
    const distance = Math.hypot(node.px - x, node.py - y);
    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  });
  hoveredNode = nearest?.id ?? null;
  if (hoveredNode === null && pinnedNode === null) {
    ui.nodeTooltip.hidden = true;
    return;
  }
  const node = displayedNodes[pinnedNode ?? hoveredNode];
  const label = node.status === "potential" ? "not reached" : node.status === "active" ? "active" : "moved on";
  ui.nodeTooltip.hidden = false;
  ui.nodeTooltip.textContent = `${String(node.id + 1).padStart(3, "0")} / ${label} / field ${node.community + 1}`;
  ui.nodeTooltip.style.left = `${Math.max(5, Math.min(rectangle.width - 158, node.px + 12))}px`;
  ui.nodeTooltip.style.top = `${Math.max(5, node.py - 27)}px`;
  drawNetwork(performance.now());
});

ui.canvas.addEventListener("pointerleave", () => {
  hoveredNode = null;
  if (pinnedNode === null) ui.nodeTooltip.hidden = true;
});

ui.canvas.addEventListener("click", () => {
  if (hoveredNode === null) {
    pinnedNode = null;
    ui.nodeTooltip.hidden = true;
  } else {
    pinnedNode = pinnedNode === hoveredNode ? null : hoveredNode;
  }
  drawNetwork(performance.now());
});

ui.trace.addEventListener("pointerdown", (event) => {
  traceDragging = true;
  ui.trace.setPointerCapture(event.pointerId);
  setDayFromTrace(event);
});
ui.trace.addEventListener("pointermove", (event) => {
  showTraceProbe(event);
  if (traceDragging) setDayFromTrace(event);
});
ui.trace.addEventListener("pointerup", (event) => {
  traceDragging = false;
  if (ui.trace.hasPointerCapture(event.pointerId)) ui.trace.releasePointerCapture(event.pointerId);
});
ui.trace.addEventListener("pointercancel", () => { traceDragging = false; });
ui.trace.addEventListener("pointerleave", () => {
  if (!traceDragging) ui.traceTooltip.hidden = true;
});

document.addEventListener("keydown", (event) => {
  const interactive = event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement;
  if (event.code === "Space" && !interactive && !ui.aboutDialog.open) {
    event.preventDefault();
    ui.play.click();
  }
  if (event.key === "Escape") {
    if (ui.conditions.classList.contains("is-open")) openConditions(false);
    lensPinned = false;
    showLensSheet(false);
    comparePinned = false;
    showCompareSheet(false);
    setCompare(false, false);
  }
});

function animate(timestamp) {
  if (playing) {
    if (previousFrame !== null) {
      const elapsed = Math.min(80, timestamp - previousFrame);
      currentDay += elapsed * (reducedMotion ? 0.005 : 0.011);
      if (currentDay >= DAYS) {
        currentDay = DAYS;
        pause();
      }
    }
    previousFrame = timestamp;
    updateLiveState(false);
    if (Math.floor(currentDay) !== lastTraceDay) renderTrace();
  }
  drawNetwork(timestamp);
  requestAnimationFrame(animate);
}

new ResizeObserver(resizeCanvas).observe(ui.canvas);
window.addEventListener("resize", renderTrace);

setControlsFromParameters();
updateScenarioLabels();
updateSummary();
updateAll(true);
requestAnimationFrame(animate);
