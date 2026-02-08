export const PLAN = {
    meta: {
      cycleDays: 5, // week/day selection is controlled by weekState in app.js
      heavyReps: 6,
      lightReps: 12
    },
  
    // classify which days are heavy/light
    dayType: {
      1: "HEAVY",
      2: "HEAVY",
      3: "HEAVY",
      4: "LIGHT",
      5: "LIGHT"
    },
  
    days: {
      1: {
        title: "Day 1 — Heavy Chest + Triceps (+ Side Delts)",
        hint: "Heavy day. Target is fixed. Log weights only.",
        exercises: [
          { name: "Barbell Bench Press", sets: 4 },
          { name: "Incline DB Press", sets: 3 },
          { name: "Weighted Dips (or Machine Dips)", sets: 3 },
          { name: "Cable Fly (mid or low-to-high)", sets: 2 },
          { name: "Close-Grip Bench OR Skull Crushers", sets: 3 },
          { name: "Rope Pushdown", sets: 2 },
          { name: "Lateral Raises", sets: 3 }
        ]
      },
  
      2: {
        title: "Day 2 — Heavy Back + Biceps (+ Rear Delts / Traps / Forearms)",
        hint: "Heavy day. Target is fixed. Log weights only.",
        exercises: [
          { name: "Weighted Pull-Ups OR Heavy Lat Pulldown", sets: 4 },
          { name: "Barbell Row OR Chest-Supported Row", sets: 3 },
          { name: "One-Arm DB Row", sets: 3 },
          { name: "Seated Cable Row", sets: 2 },
          { name: "Face Pulls", sets: 3 },
          { name: "Barbell Curl", sets: 3 },
          { name: "Hammer Curl", sets: 2 },
          { name: "Shrugs", sets: 2 }
        ]
      },
  
      3: {
        title: "Day 3 — Legs + Shoulders (+ Calves / Abs / Rotator Cuff)",
        hint: "Heavy day. Target is fixed. Log weights only.",
        exercises: [
          { name: "Back Squat OR Leg Press", sets: 4 },
          { name: "Romanian Deadlift", sets: 3 },
          { name: "Leg Curl", sets: 3 },
          { name: "Walking Lunges", sets: 2 },
          { name: "Calf Raises", sets: 4 },
          { name: "Overhead Press", sets: 3 },
          { name: "Lateral Raises", sets: 3 },
          { name: "Rear Delt Fly", sets: 3 },
          { name: "Hanging Knee Raises OR Cable Crunch", sets: 3 },
          { name: "Cable External Rotations", sets: 2 }
        ]
      },
  
      4: {
        title: "Day 4 — Light Chest + Triceps",
        hint: "Light day. Target is fixed. Log weights only.",
        exercises: [
          { name: "Incline Bench (DB or Bar)", sets: 3 },
          { name: "Machine Chest Press", sets: 3 },
          { name: "Push-Ups (weighted if needed)", sets: 2 },
          { name: "Cable Fly", sets: 3 },
          { name: "Overhead Triceps Extension", sets: 3 },
          { name: "Rope Pushdown", sets: 3 },
          { name: "Lateral Raises", sets: 3 }
        ]
      },
  
      5: {
        title: "Day 5 — Light Back + Biceps (+ Rear Delts / Forearms / Abs)",
        hint: "Light day. Target is fixed. Log weights only.",
        exercises: [
          { name: "Lat Pulldown", sets: 3 },
          { name: "Chest-Supported Row", sets: 3 },
          { name: "Cable Row (wide or close)", sets: 2 },
          { name: "Straight-Arm Pulldown", sets: 2 },
          { name: "Face Pulls", sets: 3 },
          { name: "Incline DB Curls", sets: 3 },
          { name: "Cable Curl OR Preacher Curl", sets: 2 },
          { name: "Wrist Curls OR Farmer Holds", sets: 2 },
          { name: "Plank", sets: 3 }
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