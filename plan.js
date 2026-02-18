export const PLAN = {
  meta: {
    cycleDays: 5, // week/day selection is controlled by weekState in app.js
    heavyReps: 6,
    lightReps: 12
  },

  // heavy days use heavy reps, moderate/hypertrophy days use light reps
  dayType: {
    1: "HEAVY",
    2: "HEAVY",
    3: "LIGHT",
    4: "LIGHT",
    5: "LIGHT"
  },

  days: {
    1: {
      title: "Day 1 — Chest + Triceps (HEAVY)",
      hint: "Heavy day. Target is fixed. Log weights only.",
      exercises: [
        { name: "Incline Barbell Press", sets: 4, restSec: 150 },
        { name: "Flat Barbell Bench Press", sets: 3, restSec: 150 },
        { name: "Dumbbell Shoulder Press", sets: 3, restSec: 150 },
        { name: "Cable Crossover", sets: 3, restSec: 90 },
        { name: "Flat Dumbbell Flys", sets: 3, restSec: 90 },
        { name: "Skull Crushers", sets: 3, restSec: 90 },
        { name: "Rope Pushdown", sets: 3, restSec: 90 },
        { name: "Cable Triceps Kickbacks", sets: 2, restSec: 60 }
      ]
    },

    2: {
      title: "Day 2 — Back + Biceps (HEAVY)",
      hint: "Heavy day. Target is fixed. Log weights only.",
      exercises: [
        { name: "Deadlift", sets: 4, restSec: 150 },
        { name: "T Bar Rows", sets: 4, restSec: 150 },
        { name: "Lat Pulldown", sets: 3, restSec: 120 },
        { name: "Seated Cable Rows", sets: 3, restSec: 120 },
        { name: "Assisted Pull Ups", sets: 3, restSec: 120 },
        { name: "Barbell Curl", sets: 3, restSec: 90 },
        { name: "Hammer Curl", sets: 2, restSec: 90 },
        { name: "Shrugs", sets: 3, restSec: 120 }
      ]
    },

    3: {
      title: "Day 3 — Legs (MODERATE) + Calves",
      hint: "Moderate day. Target is fixed. Log weights only.",
      exercises: [
        { name: "Leg Press", sets: 4, restSec: 150 },
        { name: "Hack Squat Machine", sets: 3, restSec: 150 },
        { name: "Romanian Deadlift", sets: 4, restSec: 150 },
        { name: "Leg Extension", sets: 3, restSec: 90 },
        { name: "Leg Curl", sets: 3, restSec: 90 },
        { name: "Standing Calf Raises", sets: 4, restSec: 90 }
      ]
    },

    4: {
      title: "Day 4 — Chest + Triceps (MODERATE/HYPERTROPHY)",
      hint: "Moderate day. Target is fixed. Log weights only.",
      exercises: [
        { name: "Incline Barbell Press", sets: 3, restSec: 120 },
        { name: "Machine Chest Press", sets: 3, restSec: 120 },
        { name: "Dumbbell Lateral Raises", sets: 3, restSec: 60 },
        { name: "Rear Delt Fly Machine", sets: 3, restSec: 60 },
        { name: "Cable Crossover", sets: 3, restSec: 90 },
        { name: "Flat Dumbbell Flys", sets: 3, restSec: 90 },
        { name: "Overhead Triceps Extension", sets: 3, restSec: 90 },
        { name: "Rope Pushdown", sets: 3, restSec: 90 }
      ]
    },

    5: {
      title: "Day 5 — Back + Biceps (MODERATE/HYPERTROPHY)",
      hint: "Moderate day. Target is fixed. Log weights only.",
      exercises: [
        { name: "Lat Pulldown", sets: 3, restSec: 120 },
        { name: "Seated Cable Rows", sets: 3, restSec: 120 },
        { name: "Assisted Pull Ups", sets: 3, restSec: 120 },
        { name: "T Bar Rows", sets: 3, restSec: 120 },
        { name: "Incline DB Curls", sets: 3, restSec: 90 },
        { name: "Cable Curl", sets: 3, restSec: 90 },
        { name: "Preacher Curl Machine", sets: 2, restSec: 60 },
        { name: "Shrugs", sets: 3, restSec: 120 }
      ]
    }
  }
};
  
  /**
   * Older imports might still reference this.
   * Week/day selection is controlled by app.js (weekState).
   */
  export function getTodayKey() {
    return { type: "UNKNOWN", dayNumber: 0 };
  }
  
  export function isoDateLocal(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  
  export function getTargetReps(dayNumber) {
    const type = PLAN.dayType[dayNumber] || "LIGHT";
    return type === "HEAVY" ? PLAN.meta.heavyReps : PLAN.meta.lightReps;
  }
  
  export function getDayType(dayNumber) {
    return PLAN.dayType[dayNumber] || "LIGHT";
  }
