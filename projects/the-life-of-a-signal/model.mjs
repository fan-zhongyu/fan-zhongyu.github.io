/** Numerical core for The Life of a Signal.
 *
 * State variables:
 *   P — people not yet reached
 *   A — people actively participating or sharing
 *   I — circulating information / attention
 *
 * The equations are adapted from the nondimensional social-network model in
 * MGP Project 2. The browser uses RK4 so the microsite can be hosted as static
 * files with no server-side computation.
 */

export const DEFAULT_PARAMETERS = Object.freeze({
  influence: 0.20,
  dropoff: 0.05,
  crowding: 0.05,
  cubicLoss: 0.01,
  creation: 0.10,
  attentionDecay: Math.log(2) / 13,
  retentionScale: 1.0,
  initialPotential: 1.0,
  initialActive: 0.04,
  initialAttention: 0.035,
});

export const SCENARIOS = Object.freeze({
  product: {
    label: "New product",
    question: "Can this launch outlive its hype?",
    deck: "Watch word-of-mouth convert an audience into active users—and see when churn catches up.",
    nouns: ["Not reached", "Active users", "Lost interest"],
    parameters: {
      influence: 0.20,
      dropoff: 0.05,
      crowding: 0.05,
      cubicLoss: 0.01,
      attentionDecay: Math.log(2) / 13,
      initialAttention: 0.035,
    },
  },
  health: {
    label: "Public-health message",
    question: "Can useful guidance travel far enough?",
    deck: "Explore how trusted sharing, message fatigue, and limited attention shape the reach of a public campaign.",
    nouns: ["Unreached", "Sharing guidance", "Disengaged"],
    parameters: {
      influence: 0.125,
      dropoff: 0.035,
      crowding: 0.025,
      cubicLoss: 0.006,
      attentionDecay: Math.log(2) / 20,
      initialAttention: 0.055,
    },
  },
  rumor: {
    label: "Online rumor",
    question: "How fast can a rumor outrun attention?",
    deck: "A rumor can spread quickly and still have a short public life. Test the tension between amplification and fatigue.",
    nouns: ["Unexposed", "Amplifying", "Moved on"],
    parameters: {
      influence: 0.34,
      dropoff: 0.095,
      crowding: 0.085,
      cubicLoss: 0.018,
      attentionDecay: Math.log(2) / 6,
      initialAttention: 0.09,
    },
  },
});

export function derivative(state, p) {
  const [potential, active, information] = state;
  const adoption = p.influence * potential * information;
  const abandonment = p.dropoff * active / (active + p.retentionScale);
  const overload = p.crowding * active ** 2 + p.cubicLoss * active ** 3;
  return [
    -adoption,
    adoption - abandonment - overload,
    p.creation * active - p.attentionDecay * information,
  ];
}

function add(state, increment, scale = 1) {
  return state.map((value, index) => value + scale * increment[index]);
}

function rk4Step(state, dt, p) {
  const k1 = derivative(state, p);
  const k2 = derivative(add(state, k1, dt / 2), p);
  const k3 = derivative(add(state, k2, dt / 2), p);
  const k4 = derivative(add(state, k3, dt), p);
  return state.map((value, index) =>
    Math.max(0, value + (dt / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index])),
  );
}

export function simulate(parameters = {}, days = 120, dt = 0.05, sampleEvery = 5) {
  const p = { ...DEFAULT_PARAMETERS, ...parameters };
  let state = [p.initialPotential, p.initialActive, p.initialAttention];
  const output = [{ day: 0, potential: state[0], active: state[1], information: state[2] }];
  const steps = Math.round(days / dt);

  for (let step = 1; step <= steps; step += 1) {
    state = rk4Step(state, dt, p);
    if (!state.every(Number.isFinite)) throw new Error("Simulation left the finite numerical domain.");
    if (step % sampleEvery === 0 || step === steps) {
      output.push({
        day: step * dt,
        potential: state[0],
        active: state[1],
        information: state[2],
      });
    }
  }
  return output;
}

export function summarize(series, parameters = {}) {
  const p = { ...DEFAULT_PARAMETERS, ...parameters };
  const peak = series.reduce((best, point) => (point.active > best.active ? point : best), series[0]);
  const initialAudience = p.initialPotential + p.initialActive;
  const final = series.at(-1);
  const reach = Math.max(0, Math.min(1, (p.initialPotential - final.potential) / p.initialPotential));
  const fadeTarget = peak.active * 0.1;
  const afterPeak = series.filter((point) => point.day > peak.day);
  const fadePoint = afterPeak.find((point) => point.active <= fadeTarget);
  const spacing = series[1].day - series[0].day;
  const engagementDays =
    series.reduce((total, point) => total + point.active * spacing, 0) / initialAudience;
  const momentum =
    (p.influence * p.initialPotential * p.creation * p.retentionScale) /
    (p.dropoff * p.attentionDecay);

  return {
    peakDay: peak.day,
    peakActive: peak.active,
    peakShare: peak.active / initialAudience,
    reach,
    fadeDay: fadePoint?.day ?? null,
    momentum,
    engagementDays,
  };
}

export function interpolate(series, day) {
  if (day <= 0) return series[0];
  const last = series.at(-1);
  if (day >= last.day) return last;
  const spacing = series[1].day - series[0].day;
  const lowerIndex = Math.min(series.length - 2, Math.floor(day / spacing));
  const lower = series[lowerIndex];
  const upper = series[lowerIndex + 1];
  const mix = (day - lower.day) / (upper.day - lower.day);
  return {
    day,
    potential: lower.potential + mix * (upper.potential - lower.potential),
    active: lower.active + mix * (upper.active - lower.active),
    information: lower.information + mix * (upper.information - lower.information),
  };
}

export function applyIntervention(parameters, intervention) {
  const changed = { ...parameters };
  switch (intervention) {
    case "retention":
      changed.dropoff *= 0.7;
      break;
    case "seed":
      changed.initialAttention *= 2;
      break;
    case "memory":
      changed.attentionDecay *= 0.65;
      break;
    case "friction":
      changed.crowding *= 0.6;
      changed.cubicLoss *= 0.6;
      break;
    default:
      break;
  }
  return changed;
}
