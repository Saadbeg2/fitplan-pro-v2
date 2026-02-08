const DB_NAME = "fitplan_pro_v2";
const DB_VERSION = 2;

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