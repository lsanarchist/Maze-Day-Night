/**
 * Maze Lab · step-driven world clock · v1.1.0
 * Pure, renderer-independent game time. The sun/moon orbit is deliberately a
 * stylised 24-hour model, NOT astronomy for a real location or calendar date.
 */
export const DAY_MINUTES = 1440;
export const STEP_MODES = Object.freeze(['random', '30', '45', '60']);
export const wrapDay = value => ((value % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
export const clamp01 = value => Math.max(0, Math.min(1, value));
export const smooth01 = (low, high, value) => {const t = clamp01((value - low) / (high - low)); return t * t * (3 - 2 * t);};

export function phaseAt(minutes) {
  const h = wrapDay(minutes) / 60;
  if (h >= 5 && h < 7) return {id: 'dawn', label: 'Світанок', icon: '☀'};
  if (h >= 7 && h < 17) return {id: 'day', label: 'День', icon: '☀'};
  if (h >= 17 && h < 19) return {id: 'dusk', label: 'Захід сонця', icon: '☀'};
  return {id: 'night', label: 'Ніч', icon: '☾'};
}

/** One shared pose drives the 3D bodies, directional lights and clock diagram. */
export function skyStateAt(minutes) {
  const hour = wrapDay(minutes) / 60;
  const angle = (hour - 6) / 24 * Math.PI * 2;
  const altitude = Math.sin(angle);
  // A tilted circular orbit keeps the celestial body visible behind the maze.
  const sun = [Math.cos(angle), altitude * .8, -altitude * .6];
  const moon = sun.map(v => -v);
  const daylight = smooth01(-.15, .35, altitude);
  const twilight = (1 - smooth01(.04, .38, Math.abs(altitude))) * smooth01(-.22, .05, altitude);
  const night = 1 - smooth01(-.3, .02, altitude);
  return {hour, angle, altitude, sun, moon, daylight, twilight, night,
    sunPower: 3.1 * smooth01(0, .32, altitude),
    moonPower: .85 * smooth01(0, .3, -altitude),
    phase: phaseAt(minutes)};
}

export class WorldClock {
  constructor({startMinutes = 480, stepMode = 'random', random = Math.random} = {}) {
    if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes >= DAY_MINUTES) throw new RangeError('Некоректний початковий час.');
    if (typeof random !== 'function') throw new TypeError('random має бути функцією.');
    this.startMinutes = startMinutes; this.random = random; this.setStepMode(stepMode);
    this.lantern = true; this.reset();
  }
  reset() {this.totalMinutes = this.startMinutes; this.visualMinutes = this.totalMinutes; this.lastStep = 0;}
  setStepMode(mode) {
    if (!STEP_MODES.includes(String(mode))) throw new RangeError('Крок часу: 30, 45, 60 або random.');
    this.stepMode = String(mode);
  }
  advanceStep() {
    const randomValue = this.stepMode === 'random' ? this.random() : 0;
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) throw new RangeError('random має повертати число від 0 включно до 1 виключно.');
    const delta = this.stepMode === 'random' ? 30 + Math.floor(randomValue * 31) : Number(this.stepMode);
    this.totalMinutes += delta; this.lastStep = delta;
    return delta;
  }
  /** Interpolate absolute minutes, so 23:45 -> 00:30 moves FORWARDS through midnight. */
  update(dt, reducedMotion = false) {
    if (reducedMotion) this.visualMinutes = this.totalMinutes;
    else if (Number.isFinite(dt) && dt > 0) {
      this.visualMinutes += (this.totalMinutes - this.visualMinutes) * (1 - Math.exp(-Math.min(dt, .25) * 9));
      if (Math.abs(this.totalMinutes - this.visualMinutes) < .025) this.visualMinutes = this.totalMinutes;
    }
  }
  setTimeOfDay(minutes) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes >= DAY_MINUTES) throw new RangeError('Вкажи час від 00:00 до 23:59.');
    // Explicit time selection is a preview/edit, not a player step; snap immediately.
    this.totalMinutes = Math.floor(this.totalMinutes / DAY_MINUTES) * DAY_MINUTES + minutes;
    this.visualMinutes = this.totalMinutes; this.lastStep = 0;
  }
  get timeOfDay() {return wrapDay(this.totalMinutes);}
  get day() {return Math.floor(this.totalMinutes / DAY_MINUTES) + 1;}
  get text() {return `${String(Math.floor(this.timeOfDay / 60)).padStart(2, '0')}:${String(this.timeOfDay % 60).padStart(2, '0')}`;}
  get sky() {return skyStateAt(this.visualMinutes);}
  snapshot() {return {version: 1, totalMinutes: this.totalMinutes, day: this.day, time: this.text, stepMode: this.stepMode, lastStep: this.lastStep, lantern: this.lantern, phase: phaseAt(this.totalMinutes).id};}
  static validate(data) {
    if (!data || typeof data !== 'object' || data.version !== 1 || !Number.isSafeInteger(data.totalMinutes) || data.totalMinutes < 0 || data.totalMinutes > 1_000_000_000 || !STEP_MODES.includes(data.stepMode) || typeof data.lantern !== 'boolean') throw new Error('Некоректні налаштування світла й часу у JSON.');
    return {totalMinutes: data.totalMinutes, stepMode: data.stepMode, lantern: data.lantern};
  }
  restore(data) {
    const saved = WorldClock.validate(data);
    Object.assign(this, saved); this.visualMinutes = this.totalMinutes; this.lastStep = 0;
  }
}
