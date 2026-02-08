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
  getLatestWeightsForExercise // 👈 add this
} from "./db.js";

/* -----------------------------
   Helpers
----------------------------- */

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
  const ids = ["navHome", "navLog", "navHistory"];
  for (const id of ids) {
    const n = elOpt(id);
    if (!n) continue;
    n.classList.toggle("active", id === activeId);
  }
}

function goScreen(name) {
  const screens = ["screenHome", "screenLog", "screenHistory"];
  for (const s of screens) hide(s);
  show(name);

  if (name === "screenHome") setActiveNav("navHome");
  if (name === "screenLog") setActiveNav("navLog");
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

function computeNextWorkoutDay(ws) {
  for (let d = 1; d <= 5; d++) {
    if (!ws.completedWorkoutDays.includes(d)) return d;
  }
  return 1;
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
  const trackedDatesSet = new Set(sessions.map((s) => s.date));
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

  const dayN = daysDiff(ws.startDate, todayISO) + 1;
  const reps = getTargetReps(nextDay);
  logTitle.textContent = PLAN.days[nextDay].title;
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
   Main
----------------------------- */

async function main() {
  await registerSW();
  const db = await openDB();

  // nav wiring
  el("navHome").onclick = () => goScreen("screenHome");
  el("navLog").onclick = () => goScreen("screenLog");
  el("navHistory").onclick = () => {
    goScreen("screenHistory");
    renderRecent(db).catch(() => {});
  };

  el("btnLogBackHome").onclick = () => goScreen("screenHome");

  el("btnSummaryDone").onclick = () => {
    hide("summaryCard");
    show("logCard");
    goScreen("screenHome");
  };

  el("btnHistoryRefresh").onclick = () => renderRecent(db);

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

  const todayISO = isoDateLocal(new Date());

  // weekly state
  let ws = await ensureWeekState(db);
  ws = await maybeExpireWeek(db, ws, todayISO);

  // today session
  const todaySession = await getSessionByDate(db, todayISO);

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
  renderLogHeader(ws, todayISO, todaySession, nextDay);


  // rest button rules
  btnRest.disabled = !ws.active || ws.restDaysUsed >= 2;

  btnRest.onclick = async () => {
    if (!ws.active) {
      alert("You cannot rest before Day 1 starts the week.");
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
const dayPlan = PLAN.days[nextDay];
for (const ex of dayPlan.exercises) {
  listEl.appendChild(buildExerciseCard(ex, nextDay));
}

// finish enabled only when weights filled
function syncFinishEnabled() {
  btnFinish.disabled = !allWorkoutWeightsFilled();
}

// initial state (after inputs exist)
syncFinishEnabled();

// AUTO-FILL LAST TIME'S WEIGHTS
const didFill = await autofillWeightsForDay(db, nextDay, dayPlan, todayISO);
if (didFill) syncFinishEnabled();

// live validation
listEl.addEventListener("input", (e) => {
  const t = e.target;
  if (t && t.matches && t.matches("input[data-field='weight']")) {
    syncFinishEnabled();
  }
});

  btnFinish.onclick = async () => {
    const dayToSave = ws.active ? nextDay : 1;

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