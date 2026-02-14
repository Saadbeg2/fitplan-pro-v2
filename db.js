const DB_NAME = "fitplan_pro_v2";
const DB_VERSION = 4;

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // sessions: one per calendar day (workout or rest)
      if (!db.objectStoreNames.contains("sessions")) {
        const store = db.createObjectStore("sessions", { keyPath: "id" });
        store.createIndex("byDate", "date", { unique: true });
        store.createIndex("byCreatedAt", "createdAt", { unique: false });
        store.createIndex("byType", "type", { unique: false });
      }

      // setLogs: one per set
      if (!db.objectStoreNames.contains("setLogs")) {
        const store = db.createObjectStore("setLogs", { keyPath: "id" });
        store.createIndex("bySessionId", "sessionId", { unique: false });
        store.createIndex("byDayExercise", ["dayNumber", "exerciseName"], { unique: false });
        store.createIndex("byCreatedAt", "createdAt", { unique: false });
      }

      // weekState: single record holding current active-week state
      if (!db.objectStoreNames.contains("weekState")) {
        db.createObjectStore("weekState", { keyPath: "id" });
      }

      // metrics: one per calendar day (bodyweight/calories)
      if (!db.objectStoreNames.contains("metrics")) {
        const store = db.createObjectStore("metrics", { keyPath: "date" }); // date is unique key
        store.createIndex("byDate", "date", { unique: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function getSessionByDate(db, date) {
  const store = tx(db, "sessions", "readonly");
  const idx = store.index("byDate");
  const req = idx.get(date);
  return promisifyRequest(req);
}

export async function upsertSession(db, session) {
  const store = tx(db, "sessions", "readwrite");
  const req = store.put(session);
  return promisifyRequest(req);
}

export async function deleteSetLogsForSession(db, sessionId) {
  // brute force by index scan (fine for v1 scale)
  const store = tx(db, "setLogs", "readwrite");
  const idx = store.index("bySessionId");
  const req = idx.openCursor(IDBKeyRange.only(sessionId));

  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return resolve(true);
      cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addSetLog(db, setLog) {
  const store = tx(db, "setLogs", "readwrite");
  const req = store.add(setLog);
  return promisifyRequest(req);
}

export async function listRecentSessions(db, limit = 10) {
  const store = tx(db, "sessions", "readonly");
  const idx = store.index("byCreatedAt");
  const req = idx.openCursor(null, "prev");

  const out = [];
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor || out.length >= limit) return resolve(out);
      out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listSessionsInRange(db, fromDate, toDate) {
  // sessions stored by date string; we’ll scan byCreatedAt and filter (fine for v1)
  const store = tx(db, "sessions", "readonly");
  const idx = store.index("byCreatedAt");
  const req = idx.openCursor(null, "prev");

  const out = [];
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return resolve(out);

      const s = cursor.value;
      if (s.date >= fromDate && s.date <= toDate) out.push(s);

      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** -----------------------------
 *  Weekly state helpers
 *  ----------------------------- */
export async function getWeekState(db) {
  const store = tx(db, "weekState", "readonly");
  const req = store.get("current");
  return promisifyRequest(req);
}

export async function setWeekState(db, state) {
  const store = tx(db, "weekState", "readwrite");
  const req = store.put(state);
  return promisifyRequest(req);
}

export async function clearWeekState(db) {
  const store = tx(db, "weekState", "readwrite");
  const req = store.delete("current");
  return promisifyRequest(req);
}

/**
 * HARD RESET helper:
 * Deletes all sessions whose session.date is within [fromDate, toDate]
 * and deletes all setLogs belonging to those sessions.
 */
export async function deleteSessionsAndLogsInDateRange(db, fromDate, toDate) {
  // 1) Collect sessionIds to delete (scan sessions)
  const sessionStore = db.transaction("sessions", "readonly").objectStore("sessions");
  const cursorReq = sessionStore.openCursor();

  const sessionIds = [];

  return new Promise((resolve, reject) => {
    cursorReq.onsuccess = async (e) => {
      const cursor = e.target.result;

      if (!cursor) {
        // 2) Delete setLogs for each sessionId
        try {
          for (const sid of sessionIds) {
            await deleteSetLogsForSession(db, sid);
          }

          // 3) Delete the sessions themselves
          const delTx = db.transaction("sessions", "readwrite");
          const store = delTx.objectStore("sessions");
          for (const sid of sessionIds) store.delete(sid);

          delTx.oncomplete = () => resolve(true);
          delTx.onerror = () => reject(delTx.error);
        } catch (err) {
          reject(err);
        }
        return;
      }

      const s = cursor.value;
      if (s.date >= fromDate && s.date <= toDate) {
        sessionIds.push(s.id);
      }
      cursor.continue();
    };

    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

export async function listSetLogsForSession(db, sessionId) {
  const store = db.transaction("setLogs", "readonly").objectStore("setLogs");
  const idx = store.index("bySessionId");
  const req = idx.openCursor(IDBKeyRange.only(sessionId));

  const out = [];
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return resolve(out);
      out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// Returns a Map: setNumber -> weight (latest before beforeDateISO)
export async function getLatestWeightsForExercise(db, dayNumber, exerciseName, beforeDateISO) {
  const store = db.transaction("setLogs", "readonly").objectStore("setLogs");
  const idx = store.index("byDayExercise");
  const req = idx.openCursor(IDBKeyRange.only([dayNumber, exerciseName]));

  const bestBySet = new Map(); // setNumber -> { weight, date, createdAt }

  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        const out = new Map();
        for (const [setNumber, rec] of bestBySet.entries()) out.set(setNumber, rec.weight);
        return resolve(out);
      }

      const log = cursor.value;

      // Only use logs from BEFORE today
      if (!beforeDateISO || (log.date && log.date < beforeDateISO)) {
        const setNumber = Number(log.setNumber);
        const prev = bestBySet.get(setNumber);

        const prevDate = prev?.date || "";
        const prevCreated = prev?.createdAt || 0;

        const isNewer =
          (log.date || "") > prevDate ||
          ((log.date || "") === prevDate && (log.createdAt || 0) > prevCreated);

        if (!prev || isNewer) {
          bestBySet.set(setNumber, {
            weight: Number(log.weight || 0),
            date: log.date || "",
            createdAt: Number(log.createdAt || 0)
          });
        }
      }

      cursor.continue();
    };

    req.onerror = () => reject(req.error);
  });
}


export async function upsertMetric(db, metric) {
  const store = tx(db, "metrics", "readwrite");
  const req = store.put(metric); // { date, bodyweightLb?, calories?, updatedAt }
  return promisifyRequest(req);
}

export async function getMetricByDate(db, date) {
  const store = tx(db, "metrics", "readonly");
  const req = store.get(date);
  return promisifyRequest(req);
}

export async function listMetricsInRange(db, fromDate, toDate) {
  const store = tx(db, "metrics", "readonly");
  const req = store.openCursor();

  const out = [];
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return resolve(out);

      const m = cursor.value;
      if (m.date >= fromDate && m.date <= toDate) out.push(m);

      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function listAllFromStore(db, storeName) {
  const store = tx(db, storeName, "readonly");
  const req = store.openCursor();
  const out = [];
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return resolve(out);
      out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listAllSessions(db) {
  return listAllFromStore(db, "sessions");
}

export async function listAllSetLogs(db) {
  return listAllFromStore(db, "setLogs");
}

export async function listAllMetrics(db) {
  return listAllFromStore(db, "metrics");
}

export async function clearAllData(db) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(["sessions", "setLogs", "metrics", "weekState"], "readwrite");
    t.objectStore("sessions").clear();
    t.objectStore("setLogs").clear();
    t.objectStore("metrics").clear();
    t.objectStore("weekState").clear();
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function bulkUpsertSessions(db, sessions = []) {
  return new Promise((resolve, reject) => {
    const t = db.transaction("sessions", "readwrite");
    const store = t.objectStore("sessions");
    for (const row of sessions) store.put(row);
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function bulkUpsertSetLogs(db, setLogs = []) {
  return new Promise((resolve, reject) => {
    const t = db.transaction("setLogs", "readwrite");
    const store = t.objectStore("setLogs");
    for (const row of setLogs) store.put(row);
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function bulkUpsertMetrics(db, metrics = []) {
  return new Promise((resolve, reject) => {
    const t = db.transaction("metrics", "readwrite");
    const store = t.objectStore("metrics");
    for (const row of metrics) store.put(row);
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}
