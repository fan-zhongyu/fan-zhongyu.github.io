const DATA_URL = "./data/argentina-world-cups.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  data: null,
  selectedMatchId: "M-2022-64",
  eventMatchIds: { 2018: "M-2018-49", 2022: "M-2022-64" },
  selectedPlayer: null,
  selectedTeammate: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resultWord(result) {
  return result === "W" ? "win" : result === "L" ? "loss" : "draw";
}

function scoreText(match) {
  const normal = `${match.argScore}—${match.oppScore}`;
  return match.penalties ? `${normal} · ${match.penalties.arg}—${match.penalties.opp} pens` : normal;
}

function findMatch(matchId) {
  for (const tournament of state.data.tournaments) {
    const match = tournament.matches.find((candidate) => candidate.id === matchId);
    if (match) return { tournament, match };
  }
  return null;
}

function enhancementFor(matchId) {
  return state.data.eventEnhancements.find((item) => item.matchId === matchId);
}

function renderJourneys() {
  const root = $("#journey-visual");
  root.replaceChildren();

  for (const tournament of state.data.tournaments) {
    const row = element("div", "journey-row");
    row.dataset.year = tournament.year;
    const label = element("div", "journey-year");
    label.append(element("strong", "", tournament.year), element("span", "", tournament.finish));
    if (tournament.year === 2022) label.append(element("span", "champion-seal", "Third star"));

    const track = element("div", "journey-track");
    track.setAttribute("role", "list");
    track.setAttribute("aria-label", `${tournament.year} World Cup journey`);
    for (let index = 0; index < 7; index += 1) {
      const stop = element("div", tournament.matches[index] ? "journey-stop" : "journey-empty");
      const match = tournament.matches[index];
      if (match) {
        stop.setAttribute("role", "listitem");
        const button = element("button", "match-point");
        button.type = "button";
        button.dataset.matchId = match.id;
        button.dataset.result = match.result;
        button.setAttribute("aria-pressed", String(match.id === state.selectedMatchId));
        button.setAttribute(
          "aria-label",
          `${tournament.year}, ${titleCase(match.stage)}: Argentina ${scoreText(match)} ${match.opponent}, ${resultWord(match.result)}`,
        );
        button.addEventListener("click", () => selectMatch(match.id));
        stop.append(button, element("span", "opponent-code", match.opponentCode));
      }
      track.append(stop);
    }
    row.append(label, track);
    root.append(row);
  }

  const key = element("div", "journey-key");
  for (const [className, label] of [["win", "win"], ["draw", "draw"], ["loss", "loss"]]) {
    key.append(element("span", `key-symbol ${className}`, label));
  }
  root.append(key);
}

function scoreDifferenceAfter(goals, minute) {
  return goals
    .filter((goal) => goal.minute <= minute)
    .reduce((total, goal) => total + (goal.side === "ARG" ? 1 : -1), 0);
}

function makeClock(match, options = {}) {
  const fixedMaximum = options.fixedMaximum ?? match.maximumMinute;
  const width = 720;
  const height = options.compact ? 132 : 176;
  const left = 34;
  const right = 704;
  const baseline = options.compact ? 64 : 82;
  const stepHeight = options.compact ? 21 : 28;
  const plotWidth = right - left;
  const x = (minute) => left + (Math.min(minute, fixedMaximum) / fixedMaximum) * plotWidth;
  const y = (difference) => baseline - Math.max(-2, Math.min(2, difference)) * stepHeight;
  const svg = svgElement("svg", {
    class: "match-clock",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `Score-state clock for Argentina against ${match.opponent}`,
  });
  const title = svgElement("title");
  title.textContent = `Argentina ${scoreText(match)} ${match.opponent}`;
  const description = svgElement("desc");
  description.textContent = "A step line above zero indicates Argentina leading and below zero indicates Argentina trailing.";
  svg.append(title, description);

  for (const tick of [0, 45, 90, 120].filter((value) => value <= fixedMaximum)) {
    svg.append(svgElement("line", { class: "clock-grid", x1: x(tick), x2: x(tick), y1: 24, y2: height - 30 }));
    const label = svgElement("text", { class: "clock-label", x: x(tick), y: height - 9, "text-anchor": tick === 0 ? "start" : tick === fixedMaximum ? "end" : "middle" });
    label.textContent = tick === 0 ? "0′" : `${tick}′`;
    svg.append(label);
  }
  svg.append(svgElement("line", { class: "clock-axis", x1: left, x2: right, y1: baseline, y2: baseline }));

  const visibleSegments = match.scoreSegments.map((segment) => ({ ...segment, to: Math.min(segment.to, match.maximumMinute) }));
  for (const segment of visibleSegments) {
    if (segment.difference === 0 || segment.to <= segment.from) continue;
    const top = Math.min(baseline, y(segment.difference));
    const areaHeight = Math.abs(baseline - y(segment.difference));
    svg.append(
      svgElement("rect", {
        class: segment.difference > 0 ? "clock-area-lead" : "clock-area-trail",
        x: x(segment.from),
        y: top,
        width: Math.max(0, x(segment.to) - x(segment.from)),
        height: areaHeight,
      }),
    );
  }

  const segments = match.scoreSegments;
  if (segments.length) {
    let path = `M ${x(segments[0].from)} ${y(segments[0].difference)}`;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      path += ` H ${x(segment.to)}`;
      const next = segments[index + 1];
      if (next) path += ` V ${y(next.difference)}`;
    }
    svg.append(svgElement("path", { class: "clock-state-line", d: path }));
  }

  match.goals.forEach((goal) => {
    const difference = scoreDifferenceAfter(match.goals, goal.minute);
    const group = svgElement("g", {
      class: "goal-hit",
      role: "button",
      tabindex: "0",
      "aria-pressed": "false",
      "aria-label": `${goal.label} ${goal.scorer}, ${goal.team}${goal.penalty ? ", penalty" : ""}${goal.ownGoal ? ", own goal" : ""}`,
    });
    group.append(svgElement("circle", { class: "goal-hit-area", cx: x(goal.minute), cy: y(difference), r: 13 }));
    group.append(svgElement("circle", { class: `goal-mark ${goal.side === "ARG" ? "arg" : "opp"}`, cx: x(goal.minute), cy: y(difference), r: 4.5 }));
    const message = `${goal.label} · ${goal.scorer} (${goal.team})${goal.penalty ? " · penalty" : ""}${goal.ownGoal ? " · own goal" : ""}`;
    for (const eventName of ["mouseenter", "focus"]) group.addEventListener(eventName, () => options.onReadout?.(message));
    group.addEventListener("click", () => {
      svg.querySelectorAll(".goal-hit, .sub-hit").forEach((item) => {
        item.classList.remove("is-selected");
        item.setAttribute("aria-pressed", "false");
      });
      group.classList.add("is-selected");
      group.setAttribute("aria-pressed", "true");
      options.onReadout?.(message);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        group.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    svg.append(group);
  });

  match.substitutions
    .filter((substitution) => substitution.side === "ARG" && substitution.direction === "on")
    .forEach((substitution, index) => {
      const y1 = baseline + stepHeight + 13 + (index % 2) * 5;
      const group = svgElement("g", {
        class: "sub-hit",
        role: "button",
        tabindex: "0",
        "aria-pressed": "false",
        "aria-label": `${substitution.label} Argentina substitution: ${substitution.player} on`,
      });
      group.append(svgElement("line", { class: "sub-hit-area", x1: x(substitution.minute), x2: x(substitution.minute), y1: y1 - 8, y2: y1 + 16 }));
      group.append(svgElement("line", { class: "sub-mark", x1: x(substitution.minute), x2: x(substitution.minute), y1, y2: y1 + 8 }));
      const message = `${substitution.label} · ${substitution.player} entered for Argentina`;
      for (const eventName of ["mouseenter", "focus"]) group.addEventListener(eventName, () => options.onReadout?.(message));
      group.addEventListener("click", () => {
        svg.querySelectorAll(".goal-hit, .sub-hit").forEach((item) => {
          item.classList.remove("is-selected");
          item.setAttribute("aria-pressed", "false");
        });
        group.classList.add("is-selected");
        group.setAttribute("aria-pressed", "true");
        options.onReadout?.(message);
      });
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          group.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
      });
      svg.append(group);
    });
  return svg;
}

function renderSelectedMatch() {
  const target = $("#selected-match");
  target.replaceChildren();
  const found = findMatch(state.selectedMatchId);
  if (!found) return;
  const { tournament, match } = found;
  target.dataset.year = tournament.year;

  const copy = element("div", "match-copy");
  copy.append(
    element("p", "match-kicker", `${tournament.year} · ${titleCase(match.stage)} · match ${match.index}`),
    element("p", "match-score", scoreText(match)),
    element("p", "match-opponent", `Argentina — ${match.opponent}`),
  );
  const metaParts = [match.date, `${match.retainedStarters} starters retained`];
  const enhancement = enhancementFor(match.id);
  if (enhancement) metaParts.push(`${enhancement.summary.shots} shots · ${enhancement.summary.xg.toFixed(2)} xG`);
  else metaParts.push("common match record only");
  copy.append(element("p", "match-meta", metaParts.join("  ·  ")));

  const clockWrap = element("div", "clock-wrap");
  const caption = element("p", "clock-caption", "Filled goal: Argentina. Ring: opponent. Lower ticks: Argentina substitutions.");
  const clock = makeClock(match, { onReadout: (message) => { caption.textContent = message; } });
  clockWrap.append(clock, caption);
  target.append(copy, clockWrap);
}

function selectMatch(matchId) {
  state.selectedMatchId = matchId;
  const found = findMatch(matchId);
  if (found && enhancementFor(matchId)) state.eventMatchIds[found.tournament.year] = matchId;
  $$(".match-point").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.matchId === matchId)));
  renderSelectedMatch();
  renderEventLayer();
}

function renderCritical() {
  const root = $("#critical-visual");
  const readout = $("#critical-readout");
  root.replaceChildren();
  for (const tournament of state.data.tournaments) {
    const match = tournament.matches.find((candidate) => candidate.critical);
    const row = element("div", "critical-row");
    row.dataset.year = tournament.year;
    const label = element("div", "critical-label");
    label.append(element("strong", "", tournament.year), element("span", "", `${match.opponent} · ${scoreText(match)}`));
    const clock = makeClock(match, { compact: true, fixedMaximum: 120, onReadout: (message) => { readout.textContent = `${tournament.year} · ${message}`; } });
    row.append(label, clock);
    root.append(row);
  }
}

function renderLineups() {
  const root = $("#lineup-visual");
  const readout = $("#lineup-readout");
  root.replaceChildren();

  for (const tournament of state.data.tournaments) {
    const panel = element("section", "weave");
    panel.dataset.year = tournament.year;
    panel.setAttribute("aria-label", `${tournament.year} starting line-up continuity`);
    const head = element("div", "weave-head");
    head.append(element("strong", "weave-year", tournament.year));
    for (let index = 0; index < 7; index += 1) {
      head.append(element("span", "weave-retained", tournament.matches[index] ? (index === 0 ? "XI" : tournament.matches[index].retainedStarters) : ""));
    }
    panel.append(head);

    const players = tournament.players.slice(0, 15);
    for (const player of players) {
      const row = element("button", "weave-person");
      row.type = "button";
      row.dataset.playerKey = `${tournament.year}-${player.id}`;
      row.setAttribute("aria-pressed", String(state.selectedPlayer === row.dataset.playerKey));
      row.setAttribute("aria-label", `${tournament.year}, ${player.name}: ${player.starts} starts and ${player.subAppearances} substitute appearances`);
      row.append(element("span", `weave-name ${player.familyName === "Messi" ? "messi" : ""}`, player.familyName));
      for (let index = 0; index < 7; index += 1) {
        const entry = player.matches[index];
        const status = entry?.status === "start" ? "start" : entry ? "sub" : "absent";
        const cell = element("span", `appearance ${status}`);
        cell.setAttribute("aria-hidden", "true");
        row.append(cell);
      }
      const positions = player.matches.filter(Boolean).map((item) => item.position).join(" · ");
      const message = `${tournament.year} · ${player.name}: ${player.starts} starts, ${player.subAppearances} substitute appearances${player.goals ? `, ${player.goals} goal${player.goals === 1 ? "" : "s"}` : ""} · ${positions}`;
      for (const eventName of ["mouseenter", "focus"]) row.addEventListener(eventName, () => { readout.textContent = message; });
      row.addEventListener("click", () => {
        state.selectedPlayer = row.dataset.playerKey;
        $$(".weave-person").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.playerKey === state.selectedPlayer)));
        readout.textContent = message;
      });
      panel.append(row);
    }
    const foot = element("div", "weave-foot");
    foot.append(
      element("span", "", `${tournament.summary.averageRetainedStarters} average retained`),
      element("span", "", `${tournament.summary.played} matches`),
    );
    panel.append(foot);
    root.append(panel);
  }
}

function renderOrbits() {
  const root = $("#orbit-visual");
  const readout = $("#orbit-readout");
  root.replaceChildren();
  for (const tournament of state.data.tournaments) {
    const panel = element("section", "orbit-panel");
    panel.dataset.year = tournament.year;
    panel.setAttribute("aria-label", `${tournament.year} Messi co-start network`);
    const head = element("div", "orbit-head");
    head.append(
      element("strong", "", tournament.year),
      element("span", "", `${tournament.messi.goals}/${tournament.summary.goalsFor} team goals`),
    );
    const stage = element("div", "orbit-stage");
    const lines = svgElement("svg", { class: "orbit-lines", viewBox: "0 0 100 100", "aria-hidden": "true" });
    for (const radius of [23, 32, 41]) lines.append(svgElement("circle", { class: "orbit-ring", cx: 50, cy: 50, r: radius }));
    const nodes = [];
    tournament.messi.teammates.forEach((teammate, index) => {
      const angle = -Math.PI / 2 + (index / tournament.messi.teammates.length) * Math.PI * 2;
      const maxStarts = tournament.matches.length;
      const radius = 23 + (1 - teammate.coStarts / maxStarts) * 22;
      const left = 50 + Math.cos(angle) * radius;
      const top = 50 + Math.sin(angle) * radius;
      nodes.push({ teammate, left, top });
      lines.append(svgElement("line", { class: "orbit-link", x1: 50, y1: 50, x2: left, y2: top }));
    });
    stage.append(lines);

    const center = element("button", "orbit-center", "10");
    center.type = "button";
    center.setAttribute("aria-label", `${tournament.year}: Messi scored ${tournament.messi.goals} of Argentina's ${tournament.summary.goalsFor} credited goals`);
    const messiMessage = `${tournament.year} · Messi: ${tournament.messi.starts} starts, ${tournament.messi.goals} of Argentina’s ${tournament.summary.goalsFor} credited goals (${Math.round(tournament.messi.shareOfTeamGoals * 100)}%)`;
    for (const eventName of ["mouseenter", "focus", "click"]) center.addEventListener(eventName, () => { readout.textContent = messiMessage; });
    stage.append(center);

    for (const { teammate, left, top } of nodes) {
      const node = element("button", "orbit-node");
      node.type = "button";
      node.style.left = `${left}%`;
      node.style.top = `${top}%`;
      const size = Math.min(28, 13 + teammate.goals * 3.2);
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.dataset.teammateKey = `${tournament.year}-${teammate.id}`;
      node.setAttribute("aria-pressed", String(state.selectedTeammate === node.dataset.teammateKey));
      node.setAttribute("aria-label", `${teammate.name}: ${teammate.coStarts} shared starts with Messi, ${teammate.goals} goals`);
      const message = `${tournament.year} · ${teammate.name}: ${teammate.coStarts} shared starts with Messi · ${teammate.goals} goal${teammate.goals === 1 ? "" : "s"}`;
      for (const eventName of ["mouseenter", "focus"]) node.addEventListener(eventName, () => { readout.textContent = message; });
      node.addEventListener("click", () => {
        state.selectedTeammate = node.dataset.teammateKey;
        $$(".orbit-node").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.teammateKey === state.selectedTeammate)));
        readout.textContent = message;
      });
      stage.append(node);
    }
    panel.append(head, stage, element("p", "role-sequence", tournament.messi.positions.join("  —  ")));
    root.append(panel);
  }
}

function eventBand(label, metric, enhancement, readout) {
  const row = element("div", "event-band");
  row.append(element("span", "event-band-name", label));
  const cells = element("div", "event-cells");
  cells.style.gridTemplateColumns = `repeat(${enhancement.bins.length}, minmax(2px, 1fr))`;
  const maximum = Math.max(1, ...enhancement.bins.map((bin) => bin[metric]));
  enhancement.bins.forEach((bin) => {
    const count = bin[metric];
    const level = count === 0 ? 0 : Math.max(1, Math.ceil((count / maximum) * 4));
    const button = element("button", "event-cell");
    button.type = "button";
    button.dataset.level = String(level);
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${bin.from} to ${bin.to} minutes: ${count} ${label.toLowerCase()}`);
    const message = `${enhancement.year} · ${bin.from}–${bin.to}′ · ${count} ${label.toLowerCase()}`;
    for (const eventName of ["mouseenter", "focus"]) button.addEventListener(eventName, () => { readout.textContent = message; });
    button.addEventListener("click", () => {
      $$(".event-cell").forEach((cell) => cell.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", "true");
      readout.textContent = message;
    });
    cells.append(button);
  });
  row.append(cells);
  return row;
}

function renderEventLayer() {
  const root = $("#event-visual");
  const readout = $("#event-readout");
  root.replaceChildren();
  for (const year of [2014, 2018, 2022]) {
    const row = element("section", "event-edition");
    row.dataset.year = year;
    row.setAttribute("aria-label", `${year} event layer`);
    const label = element("div", "event-label");
    label.append(element("strong", "", year));
    if (year === 2014) {
      label.append(element("span", "", "not plotted"));
      row.append(label, element("p", "event-missing", "No comparable open event layer in this edition."));
      root.append(row);
      continue;
    }

    const matchId = state.eventMatchIds[year];
    const enhancement = enhancementFor(matchId);
    const found = findMatch(matchId);
    label.append(element("span", "", found ? found.match.opponent : "selected match"));
    const bars = element("div", "event-bars");
    if (!enhancement) {
      bars.append(element("p", "event-missing", "Event summary unavailable."));
    } else {
      bars.append(
        eventBand("Passes", "passes", enhancement, readout),
        eventBand("Carries", "carries", enhancement, readout),
        eventBand("Pressures", "pressures", enhancement, readout),
        eventBand("Shots", "shots", enhancement, readout),
      );
      const summary = enhancement.summary;
      const completion = summary.passes ? Math.round((summary.completedPasses / summary.passes) * 100) : 0;
      bars.append(
        element(
          "p",
          "event-summary",
          `${summary.passes} passes · ${completion}% complete · ${summary.shots} shots · ${summary.xg.toFixed(2)} xG${enhancement.available360 ? " · 360 source available" : ""}`,
        ),
      );
    }
    row.append(label, bars);
    root.append(row);
  }
}

function setupLenses() {
  const buttons = $$('[data-lens]');
  const panels = $$('[data-lens-panel]');

  const selectLens = (lens, focus = false) => {
    buttons.forEach((button) => {
      const active = button.dataset.lens === lens;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.lensPanel !== lens;
    });
  };

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => selectLens(button.dataset.lens));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowLeft") next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      selectLens(buttons[next].dataset.lens, true);
    });
  });
}

function setupNotes() {
  const dialog = $("#notes-dialog");
  $$('[data-open-notes]').forEach((button) => button.addEventListener("click", () => dialog.showModal()));
  $("[data-close-notes]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  $$('[data-note-tab]').forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.dataset.noteTab;
      $$('[data-note-tab]').forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
      $$('[data-note-panel]').forEach((panel) => { panel.hidden = panel.dataset.notePanel !== selected; });
    });
  });

  const copyButton = $("[data-copy-citation]");
  copyButton.addEventListener("click", async () => {
    const citation = "Fan, Zhongyu. “Argentina, Three Times.” Interactive data visualisation, 2026.";
    try {
      await navigator.clipboard.writeText(citation);
      copyButton.textContent = "Copied";
    } catch {
      copyButton.textContent = citation;
    }
  });
}

async function initialise() {
  setupLenses();
  setupNotes();
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    state.data = await response.json();
    renderJourneys();
    renderSelectedMatch();
    renderCritical();
    renderLineups();
    renderOrbits();
    renderEventLayer();
  } catch (error) {
    const root = $("#journey-visual");
    root.textContent = "The data could not be loaded. Serve this folder over HTTP rather than opening index.html directly.";
    console.error(error);
  }
}

initialise();
