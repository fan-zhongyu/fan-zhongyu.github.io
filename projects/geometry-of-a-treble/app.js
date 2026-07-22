const SVG_NS = "http://www.w3.org/2000/svg";
const MSN_IDS = new Set([4320, 5246, 5503]);
const MSN_ORDER = [4320, 5246, 5503];

const elements = {
  pitch: document.querySelector("#pitch"),
  pitchFrame: document.querySelector("#pitchFrame"),
  pitchTitle: document.querySelector("#pitchTitle"),
  pitchDescription: document.querySelector("#pitchDescription"),
  networkLayer: document.querySelector("#networkLayer"),
  triangleLayer: document.querySelector("#triangleLayer"),
  playerLayer: document.querySelector("#playerLayer"),
  flowLayer: document.querySelector("#flowLayer"),
  tooltip: document.querySelector("#tooltip"),
  loadingState: document.querySelector("#loadingState"),
  matchContext: document.querySelector("#matchContext"),
  fixtureLabel: document.querySelector("#fixtureLabel"),
  matchMeasures: document.querySelector("#matchMeasures"),
  matchScore: document.querySelector("#matchScore"),
  inspectionPrimary: document.querySelector("#inspectionPrimary"),
  inspectionSecondary: document.querySelector("#inspectionSecondary"),
  selectedOrdinal: document.querySelector("#selectedOrdinal"),
  timeline: document.querySelector("#timeline"),
  previousMatch: document.querySelector("#previousMatch"),
  nextMatch: document.querySelector("#nextMatch"),
  structureView: document.querySelector("#structureView"),
  attacksView: document.querySelector("#attacksView"),
  footerMode: document.querySelector("#footerMode"),
  openIndex: document.querySelector("#openIndex"),
  closeIndex: document.querySelector("#closeIndex"),
  indexDrawer: document.querySelector("#indexDrawer"),
  copyCitation: document.querySelector("#copyCitation"),
  citationText: document.querySelector("#citationText"),
  copyStatus: document.querySelector("#copyStatus"),
};

const state = {
  data: null,
  // Matchday 18 is the first loaded plate: all three MSN forwards scored in a
  // 3–1 win, so the central geometry is legible before the visitor interacts.
  matchIndex: 17,
  mode: "structure",
  selectedPlayer: null,
  selectedFlow: null,
};

const formatDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) {
      node.setAttribute(key, String(value));
    }
  }
  return node;
}

function shortName(label) {
  const preferred = {
    "Lionel Messi": "Messi",
    "Luis Suárez": "Suárez",
    Neymar: "Neymar",
    "Marc-André ter Stegen": "ter Stegen",
    "Sergio Busquets": "Busquets",
    "Dani Alves": "Alves",
    "Jordi Alba": "Alba",
    "Gerard Piqué": "Piqué",
    "Ivan Rakitić": "Rakitić",
    "Andrés Iniesta": "Iniesta",
    "Javier Mascherano": "Mascherano",
  };
  if (preferred[label]) return preferred[label];
  const parts = label.trim().split(/\s+/);
  return parts.at(-1) || label;
}

function readableFormation(value) {
  if (!value) return "formation unavailable";
  return String(value).split("").join("–");
}

function matchDate(value) {
  return formatDate.format(new Date(`${value}T00:00:00Z`));
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function clearLayers() {
  elements.networkLayer.replaceChildren();
  elements.triangleLayer.replaceChildren();
  elements.playerLayer.replaceChildren();
  elements.flowLayer.replaceChildren();
}

function aggregateLinks(match) {
  const links = new Map();
  for (const link of match.links) {
    const ids = [link.source, link.target].sort((a, b) => a - b);
    const key = `${ids[0]}:${ids[1]}`;
    if (!links.has(key)) {
      links.set(key, { source: ids[0], target: ids[1], count: 0 });
    }
    links.get(key).count += link.count;
  }
  return [...links.values()];
}

function showTooltip(text, x, y) {
  const point = elements.pitch.createSVGPoint();
  point.x = x;
  point.y = y;
  const matrix = elements.pitch.getScreenCTM();
  if (!matrix) return;
  const screen = point.matrixTransform(matrix);
  const frame = elements.pitchFrame.getBoundingClientRect();
  elements.tooltip.textContent = text;
  elements.tooltip.style.left = `${screen.x - frame.left}px`;
  elements.tooltip.style.top = `${screen.y - frame.top}px`;
  elements.tooltip.classList.add("is-visible");
  elements.tooltip.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    const tooltipBox = elements.tooltip.getBoundingClientRect();
    const halfWidth = tooltipBox.width / 2;
    const unclamped = screen.x - frame.left;
    const clamped = Math.max(halfWidth + 6, Math.min(frame.width - halfWidth - 6, unclamped));
    elements.tooltip.style.left = `${clamped}px`;
  });
}

function hideTooltip() {
  elements.tooltip.classList.remove("is-visible");
  elements.tooltip.setAttribute("aria-hidden", "true");
}

function structureDefault(match, combinedLinks) {
  const visibleMsn = match.players.filter((player) => MSN_IDS.has(player.id));
  const msnPasses = combinedLinks
    .filter((link) => MSN_IDS.has(link.source) && MSN_IDS.has(link.target))
    .reduce((total, link) => total + link.count, 0);

  if (visibleMsn.length === 3) {
    elements.inspectionPrimary.textContent = `MSN triangle · ${plural(msnPasses, "completed pass", "completed passes")} within the front three`;
  } else {
    const missing = MSN_ORDER
      .filter((id) => !visibleMsn.some((player) => player.id === id))
      .map((id) => ({ 4320: "Neymar", 5246: "Suárez", 5503: "Messi" })[id]);
    elements.inspectionPrimary.textContent = `The MSN triangle is incomplete · ${missing.join(" + ")} without a passing origin`;
  }
  elements.inspectionSecondary.textContent = `${plural(match.players.length, "passer")} · ${plural(combinedLinks.length, "connection")}`;
}

function playerDetail(player) {
  elements.inspectionPrimary.textContent = `${player.label} · ${plural(player.passes, "completed open-play pass", "completed open-play passes")}`;
  elements.inspectionSecondary.textContent = `${plural(player.received, "pass", "passes")} received · ${player.starter ? "started" : "substitute"}`;
}

function renderStructure(match) {
  clearLayers();
  elements.pitchTitle.textContent = `${match.opponent}: Barcelona passing structure`;
  elements.pitchDescription.textContent =
    "Average origins of completed open-play passes. Lines connect players who exchanged at least two completed passes; the front-three triangle appears when Messi, Suárez and Neymar all have a passing origin.";

  const positions = new Map(match.players.map((player) => [player.id, player]));
  const combinedLinks = aggregateLinks(match).filter(
    (link) => positions.has(link.source) && positions.has(link.target),
  );
  const maximum = Math.max(1, ...combinedLinks.map((link) => link.count));

  for (const link of combinedLinks) {
    const source = positions.get(link.source);
    const target = positions.get(link.target);
    const strength = Math.sqrt(link.count / maximum);
    const line = svgElement("line", {
      class: "network-link",
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      opacity: (0.08 + strength * 0.48).toFixed(2),
      "stroke-width": (0.25 + strength * 1.2).toFixed(2),
    });
    const title = svgElement("title");
    title.textContent = `${source.label} and ${target.label}: ${plural(link.count, "completed pass", "completed passes")}`;
    line.append(title);
    elements.networkLayer.append(line);
  }

  const msn = MSN_ORDER.map((id) => positions.get(id)).filter(Boolean);
  if (msn.length === 3) {
    const polygon = svgElement("polygon", {
      class: "triangle-shape",
      points: msn.map((player) => `${player.x},${player.y}`).join(" "),
    });
    elements.triangleLayer.append(polygon);

    for (let index = 0; index < msn.length; index += 1) {
      const first = msn[index];
      const second = msn[(index + 1) % msn.length];
      const edge = combinedLinks.find(
        (link) =>
          (link.source === first.id && link.target === second.id) ||
          (link.source === second.id && link.target === first.id),
      );
      if (!edge) continue;
      const label = svgElement("text", {
        class: "triangle-edge-label",
        x: ((first.x + second.x) / 2).toFixed(1),
        y: ((first.y + second.y) / 2 - 0.8).toFixed(1),
      });
      label.textContent = edge.count;
      elements.triangleLayer.append(label);
    }
  }

  const maxPasses = Math.max(1, ...match.players.map((player) => player.passes));
  for (const player of match.players) {
    const radius = 1.2 + Math.sqrt(player.passes / maxPasses) * 0.85;
    const node = svgElement("g", {
      class: `player-node${player.msn ? " is-msn" : ""}`,
      transform: `translate(${player.x} ${player.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${player.label}, ${plural(player.passes, "completed open-play pass", "completed open-play passes")}`,
    });
    const hitCircle = svgElement("circle", {
      class: "player-hit",
      cx: 0,
      cy: 0,
      r: (radius + 4.5).toFixed(2),
    });
    const circle = svgElement("circle", { cx: 0, cy: 0, r: radius.toFixed(2) });
    const number = svgElement("text", {
      class: "player-number",
      x: 0,
      y: 0.43,
    });
    number.textContent = player.jersey ?? "·";
    const label = svgElement("text", {
      class: "player-label",
      x: 0,
      y: player.y < 10 ? radius + 2.2 : -(radius + 1.15),
    });
    label.textContent = shortName(player.label);
    node.append(hitCircle, circle, number, label);

    const reveal = () => {
      playerDetail(player);
      showTooltip(
        `${player.label} · ${player.passes} made · ${player.received} received`,
        player.x,
        player.y - radius,
      );
    };
    const restore = () => {
      hideTooltip();
      if (state.selectedPlayer === player.id) {
        playerDetail(player);
      } else {
        structureDefault(match, combinedLinks);
      }
    };
    node.addEventListener("mouseenter", reveal);
    node.addEventListener("focus", reveal);
    node.addEventListener("mouseleave", restore);
    node.addEventListener("blur", restore);
    node.addEventListener("click", () => {
      state.selectedPlayer = state.selectedPlayer === player.id ? null : player.id;
      elements.playerLayer
        .querySelectorAll(".player-node")
        .forEach((item) => item.classList.remove("is-selected"));
      if (state.selectedPlayer === player.id) {
        node.classList.add("is-selected");
        reveal();
      } else {
        restore();
      }
    });
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    elements.playerLayer.append(node);
  }

  structureDefault(match, combinedLinks);
}

function flowCurve(flow) {
  const start = flow.path[0];
  const deepest = flow.path.reduce(
    (candidate, point) => (point[0] > candidate[0] ? point : candidate),
    start,
  );
  const relevantPoints = flow.path.slice(
    0,
    Math.max(2, flow.path.findIndex((point) => point === deepest) + 1),
  );
  const meanY =
    relevantPoints.reduce((total, point) => total + point[1], 0) / relevantPoints.length;
  const deltaX = deepest[0] - start[0];
  const firstControl = [start[0] + deltaX * 0.36, start[1] * 0.72 + meanY * 0.28];
  const secondControl = [start[0] + deltaX * 0.74, deepest[1] * 0.68 + meanY * 0.32];
  return {
    d: `M${start[0]},${start[1]} C${firstControl[0].toFixed(1)},${firstControl[1].toFixed(1)} ${secondControl[0].toFixed(1)},${secondControl[1].toFixed(1)} ${deepest[0]},${deepest[1]}`,
    end: deepest,
    anchor: [
      (firstControl[0] + secondControl[0]) / 2,
      (firstControl[1] + secondControl[1]) / 2,
    ],
  };
}

function flowText(flow) {
  const outcome = flow.goal ? "goal" : flow.shot ? `shot · ${flow.xg.toFixed(2)} xG` : "final-third entry";
  return `${Math.floor(flow.minute)}′ · ${plural(flow.actions, "action")} · ${outcome}`;
}

function flowDefault(match, displayed) {
  const goalFlows = match.flows.filter((flow) => flow.goal).length;
  elements.inspectionPrimary.textContent = `${plural(displayed, "selected attack")} · ${plural(match.shots, "shot")} · ${plural(goalFlows, "goal sequence")}`;
  elements.inspectionSecondary.textContent = `${match.flows.length} possessions reached x ≥ 80; goals are darkest`;
}

function renderAttacks(match) {
  clearLayers();
  elements.pitchTitle.textContent = `${match.opponent}: Barcelona attack paths`;
  elements.pitchDescription.textContent =
    "Selected Barcelona possessions that reached the final third or ended in a shot. Darker paths ended in shots; solid dark paths ended in goals.";

  const shotFlows = match.flows.filter((flow) => flow.shot);
  const regularFlows = match.flows
    .filter((flow) => !flow.shot)
    .sort((first, second) => second.actions + second.span / 8 - (first.actions + first.span / 8))
    .slice(0, Math.max(0, 30 - shotFlows.length));
  const flows = [...regularFlows, ...shotFlows].sort(
    (first, second) =>
      Number(first.goal) - Number(second.goal) ||
      Number(first.shot) - Number(second.shot) ||
      first.minute - second.minute,
  );
  const maxActions = Math.max(1, ...flows.map((flow) => flow.actions));

  for (const flow of flows) {
    const group = svgElement("g", { class: "flow-group" });
    const curve = flowCurve(flow);
    const pathData = curve.d;
    const category = flow.goal ? "is-goal" : flow.shot ? "is-shot" : "is-possession";
    const opacity = flow.goal
      ? 0.96
      : flow.shot
        ? 0.42 + Math.min(0.25, flow.xg * 0.35)
        : 0.055 + (flow.actions / maxActions) * 0.12;
    const visible = svgElement("path", {
      class: `flow-visible ${category}`,
      d: pathData,
      opacity: opacity.toFixed(2),
    });
    const hit = svgElement("path", {
      class: "flow-hit",
      d: pathData,
      role: "button",
      "aria-label": flowText(flow),
    });
    if (flow.shot) hit.setAttribute("tabindex", "0");
    group.append(visible, hit);

    if (flow.shot) {
      const end = curve.end;
      group.append(
        svgElement("circle", {
          class: `flow-endpoint${flow.goal ? " is-goal" : ""}`,
          cx: end[0],
          cy: end[1],
          r: flow.goal ? 0.82 : 0.58,
        }),
      );
    }

    const middle = curve.anchor;
    const reveal = () => {
      elements.inspectionPrimary.textContent = flowText(flow);
      elements.inspectionSecondary.textContent = `reached x ${flow.maxX.toFixed(1)} · horizontal span ${flow.span.toFixed(1)}`;
      showTooltip(flowText(flow), middle[0], middle[1]);
    };
    const restore = () => {
      hideTooltip();
      if (state.selectedFlow === flow.id) {
        reveal();
      } else {
        flowDefault(match, flows.length);
      }
    };
    hit.addEventListener("mouseenter", reveal);
    hit.addEventListener("focus", reveal);
    hit.addEventListener("mouseleave", restore);
    hit.addEventListener("blur", restore);
    hit.addEventListener("click", () => {
      state.selectedFlow = state.selectedFlow === flow.id ? null : flow.id;
      elements.flowLayer
        .querySelectorAll(".flow-group")
        .forEach((item) => item.classList.remove("is-selected"));
      if (state.selectedFlow === flow.id) {
        group.classList.add("is-selected");
        reveal();
      } else {
        restore();
      }
    });
    hit.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    elements.flowLayer.append(group);
  }

  flowDefault(match, flows.length);
}

function fixtureText(match) {
  return match.venue === "H" ? `Barcelona — ${match.opponent}` : `${match.opponent} — Barcelona`;
}

function scoreText(match) {
  return match.venue === "H"
    ? `${match.goalsFor} — ${match.goalsAgainst}`
    : `${match.goalsAgainst} — ${match.goalsFor}`;
}

function contextText(match) {
  if (match.phase === "epilogue") {
    return `Champions League · Final · ${matchDate(match.date)} · Epilogue`;
  }
  return `La Liga · Matchday ${match.week} · ${matchDate(match.date)}`;
}

function setMode(mode, update = true) {
  state.mode = mode;
  state.selectedPlayer = null;
  state.selectedFlow = null;
  const isStructure = mode === "structure";
  elements.structureView.classList.toggle("is-active", isStructure);
  elements.structureView.setAttribute("aria-pressed", String(isStructure));
  elements.attacksView.classList.toggle("is-active", !isStructure);
  elements.attacksView.setAttribute("aria-pressed", String(!isStructure));
  elements.footerMode.textContent = isStructure ? "Barcelona attacks →" : "← Passing structure";
  elements.footerMode.setAttribute(
    "aria-label",
    isStructure ? "Switch to Barcelona attack paths" : "Switch to the passing structure",
  );
  if (state.data) renderCurrent();
  if (update) updateLocation();
}

function updateLocation() {
  if (!state.data) return;
  const url = new URL(window.location.href);
  url.searchParams.set("match", state.data.matches[state.matchIndex].id);
  url.searchParams.set("view", state.mode);
  window.history.replaceState({}, "", url);
}

function renderCurrent() {
  const match = state.data.matches[state.matchIndex];
  elements.matchContext.textContent = contextText(match);
  elements.fixtureLabel.textContent = fixtureText(match);
  elements.matchScore.textContent = scoreText(match);
  elements.matchScore.setAttribute(
    "aria-label",
    `${fixtureText(match)}, final score ${scoreText(match)}`,
  );
  elements.matchMeasures.textContent = `${readableFormation(match.formation)} · ${match.completedPasses} open-play passes · ${match.shots} shots · ${match.xg.toFixed(2)} xG`;
  elements.selectedOrdinal.textContent = String(state.matchIndex + 1).padStart(2, "0");
  elements.previousMatch.disabled = state.matchIndex === 0;
  elements.nextMatch.disabled = state.matchIndex === state.data.matches.length - 1;
  hideTooltip();

  elements.timeline.querySelectorAll(".timeline-button").forEach((button, index) => {
    const active = index === state.matchIndex;
    button.setAttribute("aria-current", active ? "true" : "false");
  });

  if (state.mode === "structure") {
    renderStructure(match);
  } else {
    renderAttacks(match);
  }

  if (window.matchMedia("(max-width: 48rem)").matches) {
    requestAnimationFrame(() => {
      const available = elements.pitchFrame.scrollWidth - elements.pitchFrame.clientWidth;
      elements.pitchFrame.scrollLeft = Math.max(0, available * 0.72);
    });
  }
}

function centerTimelineButton(index, behavior = "auto") {
  const button = elements.timeline.querySelector(`[data-index="${index}"]`);
  if (!button || elements.timeline.scrollWidth <= elements.timeline.clientWidth) return;
  const desiredLeft =
    button.offsetLeft - elements.timeline.clientWidth / 2 + button.offsetWidth / 2;
  elements.timeline.scrollTo({
    left: Math.max(0, desiredLeft),
    behavior: prefersReducedMotion ? "auto" : behavior,
  });
}

function selectMatch(index, options = {}) {
  if (!state.data) return;
  state.matchIndex = Math.max(0, Math.min(state.data.matches.length - 1, index));
  state.selectedPlayer = null;
  state.selectedFlow = null;
  renderCurrent();
  updateLocation();
  centerTimelineButton(state.matchIndex, "smooth");
  if (options.focus) {
    const button = elements.timeline.querySelector(`[data-index="${state.matchIndex}"]`);
    button?.focus({ preventScroll: true });
  }
}

function timelineLabel(match, index) {
  const place = match.venue === "H" ? "home to" : "away at";
  const competition = match.phase === "epilogue" ? "Champions League final" : `La Liga matchday ${match.week}`;
  return `Match ${index + 1}, ${competition}, ${place} ${match.opponent}, ${match.goalsFor}–${match.goalsAgainst}, ${match.result}`;
}

function buildTimeline() {
  const fragment = document.createDocumentFragment();
  state.data.matches.forEach((match, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timeline-button is-${match.result === "W" ? "win" : match.result === "D" ? "draw" : "loss"}${match.phase === "epilogue" ? " is-epilogue" : ""}`;
    button.dataset.index = index;
    button.setAttribute("aria-label", timelineLabel(match, index));
    button.setAttribute("aria-current", index === state.matchIndex ? "true" : "false");
    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = timelineLabel(match, index);
    button.append(label);
    button.addEventListener("click", () => selectMatch(index));
    button.addEventListener("focus", () => {
      if (index !== state.matchIndex) selectMatch(index);
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") selectMatch(0, { focus: true });
      if (event.key === "End") selectMatch(state.data.matches.length - 1, { focus: true });
      if (event.key === "ArrowLeft") selectMatch(index - 1, { focus: true });
      if (event.key === "ArrowRight") selectMatch(index + 1, { focus: true });
    });
    fragment.append(button);
  });
  elements.timeline.replaceChildren(fragment);
}

async function copyCitation() {
  const text = elements.citationText.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
  elements.copyStatus.textContent = "Copied";
  window.setTimeout(() => {
    elements.copyStatus.textContent = "";
  }, 1800);
}

function attachControls() {
  elements.previousMatch.addEventListener("click", () => selectMatch(state.matchIndex - 1));
  elements.nextMatch.addEventListener("click", () => selectMatch(state.matchIndex + 1));
  elements.structureView.addEventListener("click", () => setMode("structure"));
  elements.attacksView.addEventListener("click", () => setMode("attacks"));
  elements.footerMode.addEventListener("click", () => {
    setMode(state.mode === "structure" ? "attacks" : "structure");
    elements.pitchFrame.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  elements.openIndex.addEventListener("click", () => elements.indexDrawer.showModal());
  elements.closeIndex.addEventListener("click", () => elements.indexDrawer.close());
  elements.indexDrawer.addEventListener("click", (event) => {
    if (event.target === elements.indexDrawer) elements.indexDrawer.close();
  });
  elements.indexDrawer.addEventListener("close", () => elements.openIndex.focus());
  elements.copyCitation.addEventListener("click", copyCitation);

  document.addEventListener("keydown", (event) => {
    if (elements.indexDrawer.open) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowLeft" && !event.target.closest(".timeline")) {
      selectMatch(state.matchIndex - 1);
    }
    if (event.key === "ArrowRight" && !event.target.closest(".timeline")) {
      selectMatch(state.matchIndex + 1);
    }
  });
}

async function initialise() {
  attachControls();
  try {
    const response = await fetch("./data/season.json");
    if (!response.ok) throw new Error(`Data request returned ${response.status}`);
    state.data = await response.json();
    if (!Array.isArray(state.data.matches) || state.data.matches.length !== 39) {
      throw new Error("Expected 39 matches in the compact dataset");
    }

    const parameters = new URLSearchParams(window.location.search);
    const requestedMatch = Number(parameters.get("match"));
    const requestedIndex = state.data.matches.findIndex((match) => match.id === requestedMatch);
    if (requestedIndex >= 0) state.matchIndex = requestedIndex;
    const requestedMode = parameters.get("view");
    if (requestedMode === "attacks") state.mode = "attacks";

    buildTimeline();
    setMode(state.mode, false);
    requestAnimationFrame(() => centerTimelineButton(state.matchIndex));
    elements.loadingState.hidden = true;
  } catch (error) {
    console.error(error);
    elements.loadingState.textContent = "The season data could not be read.";
    elements.loadingState.classList.add("is-error");
    elements.matchContext.textContent = "Data unavailable";
    elements.inspectionPrimary.textContent =
      "Serve this folder over HTTP, then rebuild the data with scripts/build_data.py if needed.";
  }
}

initialise();
