import { PLAN, isoDateLocal, getTargetReps, getDayType } from "./plan.js";
import {
  openDB,
  getSessionByDate,
  upsertSession,
  deleteSetLogsForSession,
  addSetLog,
  listRecentSessions,
  listSessionsInRange,
  getWeekState,
  setWeekState,
  deleteSessionsAndLogsInDateRange,
  getLatestWeightsForExercise,
  upsertMetric,
  getMetricByDate,
  listMetricsInRange,
} from "./db.js";

/* -----------------------------
   Helpers
----------------------------- */

/* -----------------------------
   Stats (Profile + Training)
----------------------------- */

const DOB_ISO = "2002-08-12"; // Aug 12, 2002
const DEBUG = false;

function debugLog(...args) {
  if (!DEBUG) return;
  console.debug("[FitPlan]", ...args);
}

function calcAgeFromDOB(dobISO, todayISO) {
  const dob = new Date(dobISO + "T00:00:00");
  const today = new Date(todayISO + "T00:00:00");
  let age = today.getFullYear() - dob.getFullYear();

  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  return age;
}

function avg(nums) {
  const vals = nums.filter((v) => Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmtInt(n) {
  return Number.isFinite(n) ? String(Math.round(n)) : "—";
}

function fmt1Safe(n) {
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : "—";
}

function findLatestMetric(metrics) {
  // metrics is [{date, bodyweightLb?, calories?}, ...]
  if (!metrics || metrics.length === 0) return null;
  const sorted = [...metrics].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (Number.isFinite(sorted[i]?.bodyweightLb) || Number.isFinite(sorted[i]?.calories)) return sorted[i];
  }
  return sorted[sorted.length - 1] || null;
}

function computeWeightChange(metrics) {
  // 14d change: last non-null BW - first non-null BW
  const sorted = [...metrics].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted.find((m) => Number.isFinite(m?.bodyweightLb));
  const last = [...sorted].reverse().find((m) => Number.isFinite(m?.bodyweightLb));
  if (!first || !last) return null;
  return (last.bodyweightLb - first.bodyweightLb);
}

function getTopSetFromLS(key) {
  // stored as JSON: { w: number, r: number }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const w = Number(obj?.w);
    const r = Number(obj?.r);
    if (!Number.isFinite(w) || w <= 0) return null;
    if (!Number.isFinite(r) || r <= 0) return null;
    return { w, r };
  } catch {
    return null;
  }
}

function setTopSetViaPrompt(key, label) {
  const cur = getTopSetFromLS(key);
  const curText = cur ? `${cur.w} x ${cur.r}` : "";
  const val = prompt(`${label} top set (format: weight x reps)\nExample: 225 x 5`, curText);
  if (!val) return;

  const cleaned = val.toLowerCase().replace(/\s+/g, "");
  const parts = cleaned.split("x");
  if (parts.length !== 2) {
    alert("Use format like: 225 x 5");
    return;
  }

  const w = Number(parts[0]);
  const r = Number(parts[1]);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) {
    alert("Enter valid numbers, like: 225 x 5");
    return;
  }

  localStorage.setItem(key, JSON.stringify({ w, r }));
}

async function renderStats(db, todayISO) {
  // Age
  const age = calcAgeFromDOB(DOB_ISO, todayISO);
  const ageNode = elOpt("statAge");
  if (ageNode) ageNode.textContent = `${age}`;

  // Metrics windows
  const d7 = new Date(todayISO + "T00:00:00");
  d7.setDate(d7.getDate() - 6);
  const start7 = isoDateLocal(d7);

  const d14 = new Date(todayISO + "T00:00:00");
  d14.setDate(d14.getDate() - 13);
  const start14 = isoDateLocal(d14);

  const d365 = new Date(todayISO + "T00:00:00");
  d365.setDate(d365.getDate() - 365);
  const start365 = isoDateLocal(d365);

  const metrics7 = await listMetricsInRange(db, start7, todayISO);
  const metrics14 = await listMetricsInRange(db, start14, todayISO);
  const metrics365 = await listMetricsInRange(db, start365, todayISO);

  const latest = findLatestMetric(metrics365);

  const bw = latest?.bodyweightLb;
  const bmi = Number.isFinite(bw) ? calcBMI(bw, HEIGHT_IN) : null;

  const bwNode = elOpt("statBW");
  if (bwNode) bwNode.textContent = Number.isFinite(bw) ? `${fmt1Safe(bw)} lb` : "—";

  const bmiNode = elOpt("statBMI");
  if (bmiNode) bmiNode.textContent = bmi ? `${fmt1Safe(bmi)}` : "—";

  // Streak + workout counts
  const { start: s30, end: e30 } = last30RangeDates();
  const sessions30 = await listSessionsInRange(db, s30, e30);
  const trackedDatesSet = trackedDatesFromSessions(sessions30);
  const streak = computeStreak(trackedDatesSet);

  const streakNode = elOpt("statStreak");
  if (streakNode) streakNode.textContent = `${streak}`;

  // workouts 7d/30d
  const d7s = new Date(todayISO + "T00:00:00");
  d7s.setDate(d7s.getDate() - 6);
  const start7s = isoDateLocal(d7s);
  const sessions7 = await listSessionsInRange(db, start7s, todayISO);

  const w7 = sessions7.filter((s) => s.type === "WORKOUT").length;
  const w30 = sessions30.filter((s) => s.type === "WORKOUT").length;

  const w7Node = elOpt("stat7dWorkouts");
  if (w7Node) w7Node.textContent = `Workouts (7d): ${w7}`;

  const w30Node = elOpt("stat30dWorkouts");
  if (w30Node) w30Node.textContent = `Workouts (30d): ${w30}`;

  // Calories averages
  const cal7avg = avg(metrics7.map((m) => Number(m?.calories)));
  const cal14avg = avg(metrics14.map((m) => Number(m?.calories)));

  const cal7Node = elOpt("statCal7");
  if (cal7Node) cal7Node.textContent = `Avg calories (7d): ${cal7avg ? fmtInt(cal7avg) : "—"}`;

  const cal14Node = elOpt("statCal14");
  if (cal14Node) cal14Node.textContent = `Avg calories (14d): ${cal14avg ? fmtInt(cal14avg) : "—"}`;

  // Weight change 14d
  const delta = computeWeightChange(metrics14);
  const deltaNode = elOpt("statWChange14");
  if (deltaNode) {
    if (delta === null) deltaNode.textContent = "Weight change (14d): —";
    else {
      const sign = delta > 0 ? "+" : "";
      deltaNode.textContent = `Weight change (14d): ${sign}${fmt1Safe(delta)} lb`;
    }
  }

  // Strength (manual top sets stored locally)
  const bench = getTopSetFromLS("fitplan_top_bench");
  const squat = getTopSetFromLS("fitplan_top_squat");
  const dead = getTopSetFromLS("fitplan_top_dead");

  const benchNode = elOpt("statBench");
  const squatNode = elOpt("statSquat");
  const deadNode = elOpt("statDeadlift");

  if (benchNode) benchNode.textContent = `Bench: ${bench ? `${bench.w} x ${bench.r}` : "Tap to set"}`;
  if (squatNode) squatNode.textContent = `Squat: ${squat ? `${squat.w} x ${squat.r}` : "Tap to set"}`;
  if (deadNode) deadNode.textContent = `Deadlift: ${dead ? `${dead.w} x ${dead.r}` : "Tap to set"}`;

  if (benchNode) benchNode.onclick = () => { setTopSetViaPrompt("fitplan_top_bench", "Bench"); renderStats(db, todayISO).catch(()=>{}); };
  if (squatNode) squatNode.onclick = () => { setTopSetViaPrompt("fitplan_top_squat", "Squat"); renderStats(db, todayISO).catch(()=>{}); };
  if (deadNode) deadNode.onclick = () => { setTopSetViaPrompt("fitplan_top_dead", "Deadlift"); renderStats(db, todayISO).catch(()=>{}); };
}

function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

// soft-get (optional element)
function elOpt(id) {
  return document.getElementById(id);
}

function show(id) {
  const n = elOpt(id);
  if (n) n.style.display = "";
}

function hide(id) {
  const n = elOpt(id);
  if (n) n.style.display = "none";
}

function setActiveNav(activeId) {
  const ids = ["navHome", "navStats", "navHistory"];
  for (const id of ids) {
    const n = elOpt(id);
    if (!n) continue;
    n.classList.toggle("active", id === activeId);
  }
}

function goScreen(name) {
  const screens = ["screenHome", "screenLog", "screenStats", "screenHistory"];
  for (const s of screens) hide(s);
  show(name);

  if (name === "screenHome") setActiveNav("navHome");
  if (name === "screenLog") setActiveNav("navHome");     // optional: keep Home highlighted while logging
  if (name === "screenStats") setActiveNav("navStats");
  if (name === "screenHistory") setActiveNav("navHistory");
}


function formatSessionLabel(s) {
  if (s.type === "REST") return `${s.date} — Rest tracked`;
  return `${s.date} — Day ${s.dayNumber} tracked`;
}

function last30RangeDates() {
  const now = new Date();
  const end = isoDateLocal(now);
  const startD = new Date(now);
  startD.setDate(startD.getDate() - 29);
  const start = isoDateLocal(startD);
  return { start, end };
}

function daysDiff(aISO, bISO) {
  const a = new Date(aISO + "T00:00:00");
  const b = new Date(bISO + "T00:00:00");
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function computeStreak(trackedDatesSet) {
  if (trackedDatesSet.size === 0) return 0;

  // anchor on latest tracked date, not today
  const latestISO = Array.from(trackedDatesSet).sort().pop();
  let streak = 0;

  while (true) {
    const d = new Date(latestISO + "T00:00:00");
    d.setDate(d.getDate() - streak);
    const key = isoDateLocal(d);

    if (trackedDatesSet.has(key)) streak++;
    else break;
  }

  return streak;
}
function animateStreakIfImproved(newStreak) {
  const key = "fitplan_last_streak";
  const prev = Number(localStorage.getItem(key) || "0");

  // Only celebrate increases (not first load, not same, not decrease)
  if (prev > 0 && newStreak > prev) {
    const node = el("streakValue");
    node.classList.remove("streak-animate"); // reset if rapid
    // force reflow so animation restarts reliably
    void node.offsetWidth;
    node.classList.add("streak-animate");

    node.addEventListener(
      "animationend",
      () => node.classList.remove("streak-animate"),
      { once: true }
    );
  }

  localStorage.setItem(key, String(newStreak));
}

/* -----------------------------
   Week State
----------------------------- */

function defaultWeekState() {
  return {
    id: "current",
    active: false,
    startDate: null, // YYYY-MM-DD
    completedWorkoutDays: [], // subset of [1..5]
    restDaysUsed: 0
  };
}

function isWeekComplete(ws) {
  return ws.completedWorkoutDays.length === 5 && ws.restDaysUsed === 2;
}

function normalizeCompletedWorkoutDays(ws) {
  const raw = Array.isArray(ws?.completedWorkoutDays) ? ws.completedWorkoutDays : [];
  const nums = raw
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 5);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function computeNextWorkoutDay(ws) {
  const completed = normalizeCompletedWorkoutDays(ws);
  for (let d = 1; d <= 5; d++) {
    if (!completed.includes(d)) return d;
  }
  return null;
}

function safeWorkoutDay(nextDay, ws) {
  if (Number.isInteger(nextDay) && nextDay >= 1 && nextDay <= 5 && PLAN.days[nextDay]) {
    return nextDay;
  }
  const fallback = computeNextWorkoutDay(ws);
  return Number.isInteger(fallback) && PLAN.days[fallback] ? fallback : null;
}

function trackedDatesFromSessions(sessions) {
  return new Set(
    sessions
      .filter((s) => s && (s.type === "WORKOUT" || s.type === "REST"))
      .map((s) => s.date)
  );
}

async function ensureWeekState(db) {
  let ws = await getWeekState(db);
  if (!ws) {
    ws = defaultWeekState();
    await setWeekState(db, ws);
  }
  return ws;
}

async function maybeExpireWeek(db, ws, todayISO) {
  if (!ws.active) return ws;

  const diff = daysDiff(ws.startDate, todayISO);
  if (diff <= 6) return ws;

  // Week expired: if incomplete -> delete its 7-day window
  if (!isWeekComplete(ws)) {
    const start = new Date(ws.startDate + "T00:00:00");
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const endISO = isoDateLocal(end);
    await deleteSessionsAndLogsInDateRange(db, ws.startDate, endISO);
  }

  const reset = defaultWeekState();
  await setWeekState(db, reset);
  return reset;
}

/* -----------------------------
   UI building blocks (Log)
----------------------------- */

function buildExerciseCard(ex, dayNumber) {
  const wrap = document.createElement("div");
  wrap.className = "exercise";

  const header = document.createElement("div");
  header.className = "exerciseHeader";

  const name = document.createElement("div");
  name.className = "exerciseName";
  name.textContent = ex.name;

  const target = document.createElement("div");
  target.className = "exerciseTarget";

  const reps = getTargetReps(dayNumber);
  const type = getDayType(dayNumber);
  target.textContent = `Target: ${ex.sets} sets × ${reps} reps (${type})`;

  header.appendChild(name);
  header.appendChild(target);

  const sets = document.createElement("div");
  sets.className = "sets";

  for (let i = 1; i <= ex.sets; i++) {
    const row = document.createElement("div");
    row.className = "setRow";

    const label = document.createElement("div");
    label.className = "small";
    label.textContent = `Set ${i}`;

    // reps fixed
    const repsFixed = document.createElement("div");
    repsFixed.className = "small";
    repsFixed.textContent = `${reps} reps`;

    const weight = document.createElement("input");
    weight.className = "input";
    weight.type = "number";
    weight.min = "0";
    weight.step = "0.5";
    weight.placeholder = "Weight";
    weight.dataset.exercise = ex.name;
    weight.dataset.set = String(i);
    weight.dataset.field = "weight";

    const del = document.createElement("div");
    del.className = "del small";
    del.textContent = "";

    row.appendChild(label);
    row.appendChild(repsFixed);
    row.appendChild(weight);
    row.appendChild(del);

    sets.appendChild(row);
  }

  wrap.appendChild(header);
  wrap.appendChild(sets);
  return wrap;
}

async function autofillWeightsForDay(db, dayNumber, dayPlan, todayISO) {
  let filledAny = false;

  for (const ex of dayPlan.exercises) {
    const weightsMap = await getLatestWeightsForExercise(db, dayNumber, ex.name, todayISO);

    // Fill each set input if we have a saved weight > 0
    for (let i = 1; i <= ex.sets; i++) {
      const w = weightsMap.get(i);
      if (!w || w <= 0) continue;

      const input = document.querySelector(
        `input[data-field="weight"][data-exercise="${CSS.escape(ex.name)}"][data-set="${i}"]`
      );
      if (input && input.value === "") {
        input.value = String(w);
        filledAny = true;
      }
    }
  }

  return filledAny;
}
function allWorkoutWeightsFilled() {
  const weights = Array.from(document.querySelectorAll("input[data-field='weight']"));
  if (weights.length === 0) return false;
  for (const w of weights) {
    const v = w.value === "" ? 0 : Number(w.value);
    if (!Number.isFinite(v) || v <= 0) return false;
  }
  return true;
}

/* -----------------------------
   Storage writes
----------------------------- */

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // ignore
    }
  }
}

async function persistSetLogsWeightsOnly(db, session) {
  const weights = Array.from(document.querySelectorAll("input[data-exercise][data-field='weight']"));
  const grouped = new Map();

  for (const input of weights) {
    const exerciseName = input.dataset.exercise;
    const setNumber = Number(input.dataset.set);
    const key = `${exerciseName}__${setNumber}`;

    if (!grouped.has(key)) grouped.set(key, { exerciseName, setNumber, weight: 0 });
    const obj = grouped.get(key);

    const val = input.value === "" ? 0 : Number(input.value);
    obj.weight = val;
  }

  const targetReps = getTargetReps(session.dayNumber);

  for (const obj of grouped.values()) {
    if ((obj.weight ?? 0) <= 0) continue;

    await addSetLog(db, {
      id: uid("set"),
      sessionId: session.id,
      date: session.date,
      type: "WORKOUT",
      dayNumber: session.dayNumber,
      exerciseName: obj.exerciseName,
      setNumber: obj.setNumber,
      reps: targetReps, // fixed
      weight: obj.weight ?? 0,
      createdAt: Date.now()
    });
  }
}

/* -----------------------------
   Rendering (Home / Log / History)
----------------------------- */

async function renderStreakOnly(db) {
  const { start, end } = last30RangeDates();
  const sessions = await listSessionsInRange(db, start, end);
  const trackedDatesSet = trackedDatesFromSessions(sessions);
  const streak = computeStreak(trackedDatesSet);

  el("streakValue").textContent = String(streak);
  animateStreakIfImproved(streak);

  // small hint under streak
  const hint = elOpt("streakHint");
  if (hint) {
    if (streak === 0) hint.textContent = "No streak yet. Log today.";
    else if (streak === 1) hint.textContent = "1 day. Don’t break it.";
    else hint.textContent = `${streak} days. Keep it moving.`;
  }
}

function renderHome(ws, todayISO, todaySession) {
  // header sub
  const headerSub = elOpt("headerSub");
  if (headerSub) {
    if (!ws.active) headerSub.textContent = "Week not started";
    else {
      const dayN = daysDiff(ws.startDate, todayISO) + 1;
      headerSub.textContent = `Week Day ${dayN}/7 · Started ${ws.startDate}`;
    }
  }

  // week block title/subtitle
  const homeTitle = el("homeTitle");
  const homeSubtitle = el("homeSubtitle");

  if (todaySession) {
    homeTitle.textContent = "Today is already logged";
    homeSubtitle.textContent = "Come back tomorrow. No double-logging.";
  } else if (!ws.active) {
    homeTitle.textContent = "Start the week";
    homeSubtitle.textContent = "Day 1 must be logged first. No resting before Day 1.";
  } else {
    const dayN = daysDiff(ws.startDate, todayISO) + 1;
    const daysLeftAfterToday = Math.max(0, 7 - dayN);
    homeTitle.textContent = isWeekComplete(ws) ? "Week complete" : "Week in progress";
    homeSubtitle.textContent =
      isWeekComplete(ws)
        ? "You hit 5 workouts + 2 rests. Run it again."
        : `Day ${dayN}/7 · ${daysLeftAfterToday} day(s) left after today.`;
  }

  // Log today button
  const btn = el("btnHomeLogWorkout");
  btn.disabled = !!todaySession;
  btn.onclick = () => goScreen("screenLog");
}

function renderLogHeader(ws, todayISO, todaySession, nextDay) {
  const logTitle = el("logTitle");
  const logSub = el("logSub");

  if (todaySession) {
    logTitle.textContent = "Already logged today";
    logSub.textContent = "Come back tomorrow.";
    return;
  }

  if (!ws.active) {
    const reps = getTargetReps(1);
    logTitle.textContent = PLAN.days[1].title;
    logSub.textContent = `Week not started. Day 1 starts the timer. Target reps: ${reps}.`;
    return;
  }

  if (isWeekComplete(ws)) {
    const dayN = daysDiff(ws.startDate, todayISO) + 1;
    logTitle.textContent = "Week complete";
    logSub.textContent = `Week Day ${dayN}/7 · You hit 5 workouts + 2 rests.`;
    return;
  }

  const dayN = daysDiff(ws.startDate, todayISO) + 1;
  const safeDay = safeWorkoutDay(nextDay, ws);
  if (!safeDay) {
    logTitle.textContent = "All workouts completed";
    logSub.textContent = `Week Day ${dayN}/7 · Use remaining day(s) for rest.`;
    return;
  }
  const reps = getTargetReps(safeDay);
  logTitle.textContent = PLAN.days[safeDay].title;
  logSub.textContent = `Week Day ${dayN}/7 · Workouts ${ws.completedWorkoutDays.length}/5 · Rest ${ws.restDaysUsed}/2 · Target reps: ${reps}`;
}

async function renderRecent(db) {
  const box = el("recentLogs");
  const sessions = await listRecentSessions(db, 30);
  box.innerHTML = "";

  if (sessions.length === 0) {
    box.innerHTML = `<div class="small">No sessions logged yet.</div>`;
    return;
  }

  for (const s of sessions) {
    const div = document.createElement("div");
    div.className = "logItem";
    div.innerHTML = `
      <div style="font-weight:800">${formatSessionLabel(s)}</div>
      <div class="small">${s.type === "WORKOUT" ? "Workout day" : "Rest day"} • saved</div>
    `;
    box.appendChild(div);
  }
}

/* -----------------------------
   History: Charts + BMI + Calories (placeholder-first)
----------------------------- */

const HEIGHT_IN = 71.5; // 5'11.5" (change later if you want)

function calcBMI(weightLb, heightIn) {
  const w = Number(weightLb || 0);
  const h = Number(heightIn || 0);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(h) || h <= 0) return null;
  return (w / (h * h)) * 703;
}

function fmt1(n) {
  return Math.round(n * 10) / 10;
}

function buildPlaceholderSeries(todayISO, days = 14) {
  const labels = [];
  const weights = [];
  const calories = [];

  const baseW = 256;     // your current weight baseline
  const baseC = 2600;    // placeholder calories baseline

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayISO + "T00:00:00");
    d.setDate(d.getDate() - i);
    const iso = isoDateLocal(d);

    labels.push(iso.slice(5)); // "MM-DD" looks clean

    // gentle trend + noise
    const w = baseW - (days - 1 - i) * 0.2 + (Math.random() - 0.5) * 0.6;
    const c = baseC + (Math.random() - 0.5) * 400;

    weights.push(fmt1(w));
    calories.push(Math.round(c));
  }

  return { labels, weights, calories };
}

let weightChartInstance = null;
let calChartInstance = null;

function renderCharts({ labels, weights, calories }) {
  // guard if Chart.js didn’t load
  if (!window.Chart) return;

  const wCtx = el("weightChart").getContext("2d");
  const cCtx = el("calChart").getContext("2d");

  // destroy previous if re-rendering
  if (weightChartInstance) weightChartInstance.destroy();
  if (calChartInstance) calChartInstance.destroy();

  weightChartInstance = new Chart(wCtx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Bodyweight (lb)", data: weights, tension: 0.3 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { precision: 0 } } }
    }
  });

  calChartInstance = new Chart(cCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Calories", data: calories }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  // range labels
  // range labels (ignore nulls)
  const wVals = weights.filter((v) => Number.isFinite(v));
  const cVals = calories.filter((v) => Number.isFinite(v));

  const wMin = wVals.length ? Math.min(...wVals) : 0;
  const wMax = wVals.length ? Math.max(...wVals) : 0;

  const cMin = cVals.length ? Math.min(...cVals) : 0;
  const cMax = cVals.length ? Math.max(...cVals) : 0;

  el("weightRangeLabel").textContent = `${wMin}–${wMax} lb (last ${labels.length} days)`;
  el("calRangeLabel").textContent = `${cMin}–${cMax} kcal (last ${labels.length} days)`;
}

function enableQuickTrackUI(enabled) {
  const bw = elOpt("bwInput");
  const cal = elOpt("calInput");
  const sBW = elOpt("btnSaveBW");
  const sCal = elOpt("btnSaveCal");

  if (bw) bw.disabled = !enabled;
  if (cal) cal.disabled = !enabled;
  if (sBW) sBW.disabled = !enabled;
  if (sCal) sCal.disabled = !enabled;
}

function wireBMI() {
  const bw = elOpt("bwInput");
  const height = elOpt("heightInput");
  const bmiLabel = elOpt("bmiLabel");
  if (!bw || !height || !bmiLabel) return;

  const update = () => {
    const bmi = calcBMI(bw.value, height.value || 71.5);
    bmiLabel.textContent = bmi ? `BMI: ${fmt1(bmi)}` : "BMI: —";
  };

  bw.addEventListener("input", update);
  height.addEventListener("input", update);
  update();
}

/* -----------------------------
   Main
----------------------------- */

async function main() {
  await registerSW();
  const db = await openDB();

  const todayISO = isoDateLocal(new Date());

  const btnSaveBW = elOpt("btnSaveBW");
  if (btnSaveBW) {
    btnSaveBW.onclick = async () => {
      const bw = elOpt("bwInput");
      if (!bw) return;

      const val = Number(bw.value);
      if (!Number.isFinite(val) || val <= 0) {
        alert("Enter a valid bodyweight.");
        return;
      }

      const prev = (await getMetricByDate(db, todayISO)) || { date: todayISO };
      await upsertMetric(db, {
        ...prev,
        date: todayISO,
        bodyweightLb: val,
        updatedAt: Date.now()
      });
      el("navHistory").click(); // re-loads charts from DB

      alert("Bodyweight saved.");
    };
  }

  const btnSaveCal = elOpt("btnSaveCal");
  if (btnSaveCal) {
    btnSaveCal.onclick = async () => {
      const cal = elOpt("calInput");
      if (!cal) return;

      const val = Number(cal.value);
      if (!Number.isFinite(val) || val <= 0) {
        alert("Enter a valid calorie number.");
        return;
      }

      const prev = (await getMetricByDate(db, todayISO)) || { date: todayISO };
      await upsertMetric(db, {
        ...prev,
        date: todayISO,
        calories: val,
        updatedAt: Date.now()
      });
      el("navHistory").click(); // re-loads charts from DB
      alert("Calories saved.");
    };
  }

  // nav wiring
  el("navHome").onclick = () => goScreen("screenHome");
  el("navStats").onclick = async () => {
  goScreen("screenStats");
  await renderStats(db, todayISO);
};

  el("navHistory").onclick = async () => {
    goScreen("screenHistory");
    renderRecent(db).catch(() => { });

    const startD = new Date(todayISO + "T00:00:00");
    startD.setDate(startD.getDate() - 13);
    const startISO = isoDateLocal(startD);

    const metrics = await listMetricsInRange(db, startISO, todayISO);

    if (metrics.length === 0) {
      renderCharts(buildPlaceholderSeries(todayISO, 14));
    } else {
      const byDate = new Map(metrics.map((m) => [m.date, m]));

      const labels = [];
      const weights = [];
      const calories = [];

      for (let i = 13; i >= 0; i--) {
        const d = new Date(todayISO + "T00:00:00");
        d.setDate(d.getDate() - i);
        const iso = isoDateLocal(d);

        labels.push(iso.slice(5));
        const m = byDate.get(iso);

        weights.push(m?.bodyweightLb ?? null);
        calories.push(m?.calories ?? null);
      }

      renderCharts({ labels, weights, calories });
    }

    enableQuickTrackUI(true);
    wireBMI();
  };

  el("btnLogBackHome").onclick = () => goScreen("screenHome");

  el("btnSummaryDone").onclick = () => {
    hide("summaryCard");
    show("logCard");
    goScreen("screenHome");
  };

  el("btnHistoryRefresh").onclick = () => el("navHistory").click();

  // quick track toggle (History)
  const btnToggle = elOpt("btnToggleQuickTrack");
  const quickBody = elOpt("quickTrackBody");
  if (btnToggle && quickBody) {
    btnToggle.onclick = () => {
      const open = quickBody.style.display !== "none";
      quickBody.style.display = open ? "none" : "";
      btnToggle.textContent = open ? "Expand" : "Collapse";
    };
  }



  // History: placeholder button
  const btnUsePlaceholder = elOpt("btnUsePlaceholder");
  if (btnUsePlaceholder) {
    btnUsePlaceholder.onclick = () => {
      const series = buildPlaceholderSeries(todayISO, 14);
      renderCharts(series);
      enableQuickTrackUI(true);
      wireBMI();
    };
  }

  // weekly state
  let ws = await ensureWeekState(db);
  ws = await maybeExpireWeek(db, ws, todayISO);
  ws.completedWorkoutDays = normalizeCompletedWorkoutDays(ws);
  await setWeekState(db, ws);

  // today session
  const todaySession = await getSessionByDate(db, todayISO);
  const dayN = ws.active ? daysDiff(ws.startDate, todayISO) + 1 : null;
  debugLog("main:init", {
    startDate: ws.startDate,
    todayISO,
    dayN,
    completedWorkoutDays: ws.completedWorkoutDays,
    restDaysUsed: ws.restDaysUsed,
    todaySessionType: todaySession?.type || null
  });

  el("todayBadge").textContent = `Today: ${todayISO}`;
  el("statusBadge").textContent = todaySession ? "Status: Logged" : "Status: Not logged";

  // HOME
  renderHome(ws, todayISO, todaySession);
  await renderStreakOnly(db);

  // LOG setup
  const listEl = el("exerciseList");
  const btnRest = el("btnMarkRest");
  const btnFinish = el("btnFinishDay");

  listEl.innerHTML = "";

  // If already tracked today -> lock log screen actions
  if (todaySession) {
    btnRest.disabled = true;
    btnFinish.disabled = true;
    renderLogHeader(ws, todayISO, todaySession, 1);
    goScreen("screenHome");
    await renderRecent(db);
    return;
  }

  // determine next workout day
  const nextDay = ws.active ? computeNextWorkoutDay(ws) : 1;
  const safeNextDay = safeWorkoutDay(nextDay, ws);
  debugLog("main:nextDay", {
    startDate: ws.startDate,
    todayISO,
    dayN,
    completedWorkoutDays: ws.completedWorkoutDays,
    restDaysUsed: ws.restDaysUsed,
    nextDay,
    safeNextDay,
    todaySessionType: todaySession?.type || null
  });
  renderLogHeader(ws, todayISO, todaySession, nextDay);


  // rest button rules
  btnRest.disabled = !ws.active || isWeekComplete(ws) || ws.restDaysUsed >= 2;

  if (ws.active && isWeekComplete(ws)) {
    btnRest.disabled = true;
    btnFinish.disabled = true;
    listEl.innerHTML = "";
    await renderRecent(db);
    goScreen("screenHome");
    return;
  }

  btnRest.onclick = async () => {
    if (!ws.active) {
      alert("You cannot rest before Day 1 starts the week.");
      return;
    }
    if (isWeekComplete(ws)) {
      alert("Week complete. No more logs can be added.");
      return;
    }
    if (ws.restDaysUsed >= 2) {
      alert("Rest limit reached (2/2).");
      return;
    }

    const session = {
      id: uid("session"),
      date: todayISO,
      type: "REST",
      dayNumber: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await upsertSession(db, session);

    ws.restDaysUsed += 1;
    await setWeekState(db, ws);
    debugLog("log:rest", {
      startDate: ws.startDate,
      todayISO,
      dayN: daysDiff(ws.startDate, todayISO) + 1,
      completedWorkoutDays: ws.completedWorkoutDays,
      restDaysUsed: ws.restDaysUsed,
      nextDay: computeNextWorkoutDay(ws),
      todaySessionType: session.type
    });

    el("statusBadge").textContent = "Status: Logged";
    btnRest.disabled = true;
    btnFinish.disabled = true;

    alert("Rest logged. Today is finished.");

    await renderStreakOnly(db);
    await renderRecent(db);
    renderHome(ws, todayISO, session);
    goScreen("screenHome");
  };

  // build exercises
  const dayPlan = safeNextDay ? PLAN.days[safeNextDay] : null;
  if (dayPlan) {
    for (const ex of dayPlan.exercises) {
      listEl.appendChild(buildExerciseCard(ex, safeNextDay));
    }
  }

  // finish enabled only when weights filled
  function syncFinishEnabled() {
    if (!dayPlan) {
      btnFinish.disabled = true;
      return;
    }
    btnFinish.disabled = !allWorkoutWeightsFilled();
  }

  // initial state (after inputs exist)
  syncFinishEnabled();

  // AUTO-FILL LAST TIME'S WEIGHTS
  if (dayPlan) {
    const didFill = await autofillWeightsForDay(db, safeNextDay, dayPlan, todayISO);
    if (didFill) syncFinishEnabled();
  }

  // live validation
  listEl.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.matches && t.matches("input[data-field='weight']")) {
      syncFinishEnabled();
    }
  });

  btnFinish.onclick = async () => {
    if (isWeekComplete(ws)) {
      alert("Week complete. No more logs can be added.");
      return;
    }
    if (!dayPlan) {
      alert("All workout days are already completed this week.");
      return;
    }

    const dayToSave = ws.active ? safeNextDay : 1;

    if (ws.active && ws.completedWorkoutDays.includes(dayToSave)) {
      alert(`Day ${dayToSave} already completed this week.`);
      return;
    }

    if (!allWorkoutWeightsFilled()) {
      alert("Enter weights for all sets before finishing.");
      return;
    }

    const session = {
      id: uid("session"),
      date: todayISO,
      type: "WORKOUT",
      dayNumber: dayToSave,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await upsertSession(db, session);

    await deleteSetLogsForSession(db, session.id);
    await persistSetLogsWeightsOnly(db, session);

    if (!ws.active) {
      // start week now
      ws.active = true;
      ws.startDate = todayISO;
      ws.completedWorkoutDays = [1];
      ws.restDaysUsed = 0;
      await setWeekState(db, ws);

      alert("Day 1 saved. Week started.");
    } else {
      ws.completedWorkoutDays = Array.from(new Set([...ws.completedWorkoutDays, dayToSave])).sort((a, b) => a - b);
      await setWeekState(db, ws);

      if (isWeekComplete(ws)) {
        alert("Workout saved. Week complete: 5 workouts + 2 rests.");
      } else {
        alert(`Workout saved. Remaining: Workouts ${5 - ws.completedWorkoutDays.length}, Rest ${2 - ws.restDaysUsed}.`);
      }
    }
    debugLog("log:workout", {
      startDate: ws.startDate,
      todayISO,
      dayN: daysDiff(ws.startDate, todayISO) + 1,
      completedWorkoutDays: ws.completedWorkoutDays,
      restDaysUsed: ws.restDaysUsed,
      nextDay: computeNextWorkoutDay(ws),
      todaySessionType: session.type
    });

    el("statusBadge").textContent = "Status: Logged";
    btnRest.disabled = true;
    btnFinish.disabled = true;

    await renderStreakOnly(db);
    await renderRecent(db);

    const freshToday = await getSessionByDate(db, todayISO);
    renderHome(ws, todayISO, freshToday);

    goScreen("screenHome");
  };

  // default route
  goScreen("screenHome");
  await renderRecent(db);
}

main().catch((e) => {
  console.error(e);
  alert("App failed to load. Check console.");
});
