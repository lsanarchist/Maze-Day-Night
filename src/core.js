import {WorldClock} from './day-night.js';
/**
 * Maze Lab · graph model and algorithms · v1.0.0 · 2026-10-15
 * Pure JavaScript: no DOM, WebGL, network or external dependencies.
 * Author field for the submitted assignment is configured in src/config.js.
 */
export const DIRS = Object.freeze([
  Object.freeze({name: 'N', dx: 0, dy: -1, bit: 1, opposite: 4}),
  Object.freeze({name: 'E', dx: 1, dy: 0, bit: 2, opposite: 8}),
  Object.freeze({name: 'S', dx: 0, dy: 1, bit: 4, opposite: 1}),
  Object.freeze({name: 'W', dx: -1, dy: 0, bit: 8, opposite: 2})
]);
export const MAX_SIZE = 40;
export const ALGORITHMS = Object.freeze(['bfs', 'astar', 'dfs']);

/** Reproducible FNV-1a hash followed by Mulberry32. Never use for cryptography. */
export function seededRandom(seed) {
  let a = 2166136261;
  for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 16777619);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dimensions(width, height) {
  if (![width, height].every(n => Number.isInteger(n) && n >= 4 && n <= MAX_SIZE)) {
    throw new Error(`Розмір лабіринту має бути цілим числом від 4 до ${MAX_SIZE}.`);
  }
}

/** O(V) iterative randomized DFS; optional loops add extra open edges. */
export function generateMaze(width = 16, height = 16, seed = 'TUKE-2026', loops = 0.08) {
  dimensions(width, height);
  if (typeof seed !== 'string' || seed.length > 64) throw new Error('Seed: максимум 64 символи.');
  if (!Number.isFinite(loops) || loops < 0 || loops > 1) throw new Error('Частка циклів: від 0 до 1.');
  const maze = {width, height, seed, loops, edited: false,
    walls: new Uint8Array(width * height).fill(15), start: 0, goal: width * height - 1};
  const rand = seededRandom(`${width}:${height}:${seed}`);
  const seen = new Uint8Array(width * height);
  const stack = [0]; seen[0] = 1;
  while (stack.length) {
    const current = stack[stack.length - 1];
    const candidates = [];
    for (let d = 0; d < 4; d++) {
      const next = adjacent(maze, current, d);
      if (next !== -1 && !seen[next]) candidates.push([next, d]);
    }
    if (!candidates.length) {stack.pop(); continue;}
    const [next, d] = candidates[Math.floor(rand() * candidates.length)];
    setWall(maze, current, d, false);
    seen[next] = 1; stack.push(next);
  }
  if (loops > 0) {
    for (let i = 0; i < maze.walls.length; i++) {
      // Every internal edge is considered once; no boundary can be removed.
      for (const d of [1, 2]) {
        if (adjacent(maze, i, d) !== -1 && (maze.walls[i] & DIRS[d].bit) && rand() < loops) {
          setWall(maze, i, d, false);
        }
      }
    }
  }
  return maze;
}

/** Index of a grid neighbor, ignoring walls. -1 means outside the board. */
export function adjacent(maze, index, direction) {
  if (!Number.isInteger(index) || index < 0 || index >= maze.walls.length || !DIRS[direction]) return -1;
  const {dx, dy} = DIRS[direction];
  const x = index % maze.width + dx;
  const y = Math.floor(index / maze.width) + dy;
  return x < 0 || y < 0 || x >= maze.width || y >= maze.height ? -1 : y * maze.width + x;
}

/** Changes BOTH sides of an edge. Exterior boundaries are intentionally immutable. */
export function setWall(maze, index, direction, closed) {
  const next = adjacent(maze, index, direction);
  if (next === -1) return false;
  const d = DIRS[direction];
  if (closed) {maze.walls[index] |= d.bit; maze.walls[next] |= d.opposite;}
  else {maze.walls[index] &= ~d.bit; maze.walls[next] &= ~d.opposite;}
  return true;
}

/** Returns all traversable neighbors in stable N/E/S/W order. */
export function neighbors(maze, index) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    if (maze.walls[index] & DIRS[d].bit) continue;
    const next = adjacent(maze, index, d);
    if (next !== -1) out.push(next);
  }
  return out;
}

export function canMove(maze, index, direction) {
  const next = adjacent(maze, index, direction);
  return next !== -1 && !(maze.walls[index] & DIRS[direction].bit) ? next : -1;
}

export function cloneMaze(maze) {
  return {...maze, walls: new Uint8Array(maze.walls)};
}

export function serializeMaze(maze) {
  return JSON.stringify({schema: 'maze-lab', version: 1,
    width: maze.width, height: maze.height, seed: maze.seed,
    loops: maze.loops ?? 0, edited: Boolean(maze.edited),
    start: maze.start, goal: maze.goal, walls: [...maze.walls]}, null, 2);
}

/** Validate untrusted JSON before allocating the scene or changing the existing map. */
export function parseMaze(text) {
  if (typeof text !== 'string' || text.length > 100_000) throw new Error('Файл карти надто великий (максимум 100 КБ).');
  let m;
  try {m = JSON.parse(text);} catch {throw new Error('Файл не містить коректного JSON.');}
  if (!m || m.schema !== 'maze-lab' || m.version !== 1) throw new Error('Невідомий формат карти. Потрібен Maze Lab JSON v1.');
  dimensions(m.width, m.height);
  const count = m.width * m.height;
  if (!Array.isArray(m.walls) || m.walls.length !== count || !m.walls.every(n => Number.isInteger(n) && n >= 0 && n <= 15)) {
    throw new Error('Пошкоджений масив стін.');
  }
  if (![m.start, m.goal].every(n => Number.isInteger(n) && n >= 0 && n < count) || m.start === m.goal) {
    throw new Error('Старт і фініш мають бути різними клітинками всередині лабіринту.');
  }
  if (typeof m.seed !== 'string' || m.seed.length > 64) throw new Error('Некоректний seed.');
  if (!Number.isFinite(m.loops) || m.loops < 0 || m.loops > 1) throw new Error('Некоректна частка циклів.');
  const maze = {width: m.width, height: m.height, seed: m.seed, loops: m.loops,
    edited: Boolean(m.edited), start: m.start, goal: m.goal, walls: Uint8Array.from(m.walls)};
  for (let i = 0; i < count; i++) {
    for (let d = 0; d < 4; d++) {
      const next = adjacent(maze, i, d), closed = Boolean(maze.walls[i] & DIRS[d].bit);
      if (next === -1 && !closed) throw new Error('Зовнішня межа лабіринту повинна бути закритою.');
      if (next !== -1 && closed !== Boolean(maze.walls[next] & DIRS[d].opposite)) {
        throw new Error('Стіни суміжних клітинок не узгоджені.');
      }
    }
  }
  // A disconnected map is VALID: the application visualizes "no path".
  return maze;
}

/** Binary min-heap. Equal priorities preserve insertion order for reproducibility. */
class MinHeap {
  constructor() {this.items = []; this.serial = 0;}
  less(a, b) {return a.priority < b.priority || (a.priority === b.priority && a.serial < b.serial);}
  push(value, priority, g) {
    const node = {value, priority, g, serial: this.serial++};
    this.items.push(node); let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(node, this.items[p])) break;
      this.items[i] = this.items[p]; i = p;
    }
    this.items[i] = node;
  }
  pop() {
    if (!this.items.length) return null;
    const root = this.items[0], last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.less(this.items[child + 1], this.items[child])) child++;
        if (!this.less(this.items[child], last)) break;
        this.items[i] = this.items[child]; i = child;
      }
      this.items[i] = last;
    }
    return root;
  }
}

/**
 * Incremental BFS, DFS and A*. One step expands at most ONE actual vertex.
 * BFS uses an O(1) queue head (not Array.shift); A* uses a binary heap.
 * All edges cost 1; Manhattan distance is admissible and consistent here.
 */
export class Search {
  constructor(maze, algorithm = 'bfs', source = maze.start, target = maze.goal) {
    if (!ALGORITHMS.includes(algorithm)) throw new Error('Невідомий алгоритм.');
    if (![source, target].every(i => Number.isInteger(i) && i >= 0 && i < maze.walls.length)) throw new Error('Некоректна початкова або кінцева клітинка.');
    this.maze = maze; this.algorithm = algorithm; this.source = source; this.target = target;
    const n = maze.walls.length;
    this.parent = new Int32Array(n).fill(-1);
    this.g = new Float64Array(n).fill(Infinity);
    this.seen = new Uint8Array(n); this.closed = new Uint8Array(n);
    this.frontier = 1; this.expanded = 0; this.done = false; this.found = false; this.path = [];
    this.queue = [source]; this.head = 0; this.heap = new MinHeap();
    this.g[source] = 0; this.seen[source] = 1;
    this.heap.push(source, this.heuristic(source), 0);
  }
  heuristic(i) {
    const w = this.maze.width;
    return Math.abs(i % w - this.target % w) + Math.abs(Math.floor(i / w) - Math.floor(this.target / w));
  }
  reconstruct(node) {
    const path = [];
    while (node !== -1) {path.push(node); node = this.parent[node];}
    return path.reverse();
  }
  step() {
    if (this.done) return {done: true, found: this.found, node: -1, discovered: [], path: this.path};
    let current = -1;
    if (this.algorithm === 'astar') {
      let entry;
      while ((entry = this.heap.pop())) {
        if (!this.closed[entry.value] && entry.g === this.g[entry.value]) {current = entry.value; break;}
      }
    } else if (this.algorithm === 'dfs') {
      current = this.queue.length ? this.queue.pop() : -1;
    } else if (this.head < this.queue.length) current = this.queue[this.head++];
    if (current === -1) {
      this.done = true; this.frontier = 0;
      return {done: true, found: false, node: -1, discovered: [], path: []};
    }
    this.closed[current] = 1; this.frontier--; this.expanded++;
    if (current === this.target) {
      this.done = true; this.found = true; this.path = this.reconstruct(current);
      return {done: true, found: true, node: current, discovered: [], path: this.path};
    }
    const discovered = [];
    for (const next of neighbors(this.maze, current)) {
      if (this.closed[next]) continue;
      if (this.algorithm === 'astar') {
        const tentative = this.g[current] + 1;
        if (tentative >= this.g[next]) continue;
        this.g[next] = tentative; this.parent[next] = current;
        this.heap.push(next, tentative + this.heuristic(next), tentative);
        if (!this.seen[next]) {this.seen[next] = 1; this.frontier++; discovered.push(next);}
      } else if (!this.seen[next]) {
        this.seen[next] = 1; this.parent[next] = current;
        this.queue.push(next); this.frontier++; discovered.push(next);
      }
    }
    if (!this.frontier) this.done = true;
    return {done: this.done, found: false, node: current, discovered, path: []};
  }
}

/**
 * Application state machine, independent of animation/cameras.
 * Camera switching deliberately cannot mutate this state.
 * phase: idle, searching, search-paused, solved, unreachable,
 *        walking, walk-paused, won.
 */
export class Session {
  constructor(maze) {this.clock = new WorldClock(); this.load(maze);}
  load(maze, {resetClock = true} = {}) {
    if (resetClock) this.clock.reset();
    this.maze = maze; this.player = maze.start; this.moves = 0;
    this.trail = new Set([maze.start]); this.clearSearch();
  }
  clearSearch() {
    this.phase = 'idle'; this.search = null; this.path = [];
    this.visual = new Uint8Array(this.maze.walls.length);
    this.expanded = 0; this.frontier = 0; this.pathLength = null; this.walkIndex = 0;
  }
  resetPlayer() {
    this.player = this.maze.start; this.moves = 0;
    this.trail = new Set([this.player]); this.clearSearch();
  }
  beginSearch(algorithm = 'bfs') {
    this.clearSearch();
    this.search = new Search(this.maze, algorithm, this.player, this.maze.goal);
    this.visual[this.player] = 1; this.frontier = 1; this.phase = 'searching';
  }
  advanceSearch() {
    if (!this.search || this.search.done) return;
    const event = this.search.step();
    if (event.node >= 0) this.visual[event.node] = 2;
    for (const index of event.discovered) this.visual[index] = 1;
    this.expanded = this.search.expanded; this.frontier = this.search.frontier;
    if (event.done) {
      if (event.found) {
        this.path = event.path; this.pathLength = this.path.length - 1;
        for (const index of this.path) this.visual[index] = 3;
        this.phase = 'solved';
      } else this.phase = 'unreachable';
    }
  }
  startWalking() {
    if (this.phase !== 'solved' || !this.path.length || this.path[0] !== this.player) return false;
    this.walkIndex = 0;
    this.phase = this.path.length === 1 ? 'won' : 'walking';
    return true;
  }
  advanceWalk() {
    if (!['walking', 'walk-paused'].includes(this.phase)) return;
    const next = this.path[this.walkIndex + 1];
    if (next === undefined) {this.phase = 'won'; return;}
    if (!neighbors(this.maze, this.player).includes(next)) {this.clearSearch(); return;}
    this.player = next; this.moves++; this.clock.advanceStep(); this.trail.add(next); this.walkIndex++;
    if (this.player === this.maze.goal) this.phase = 'won';
  }
  pause() {
    if (this.phase === 'searching') this.phase = 'search-paused';
    else if (this.phase === 'walking') this.phase = 'walk-paused';
  }
  resume() {
    if (this.phase === 'search-paused') this.phase = 'searching';
    else if (this.phase === 'walk-paused') this.phase = 'walking';
  }
  /** Manual input pauses nothing implicitly: active automatic tasks reject movement. */
  move(direction) {
    if (['searching', 'walking'].includes(this.phase)) return 'busy';
    const next = canMove(this.maze, this.player, direction);
    if (next === -1) return 'wall';
    this.clearSearch(); this.player = next; this.moves++; this.clock.advanceStep(); this.trail.add(next);
    if (next === this.maze.goal) this.phase = 'won';
    return 'moved';
  }
  singleStep(algorithm = 'bfs') {
    if (['walking', 'walk-paused'].includes(this.phase)) {
      this.pause(); this.advanceWalk(); return;
    }
    if (!['searching', 'search-paused'].includes(this.phase)) this.beginSearch(algorithm);
    this.pause(); this.advanceSearch();
  }
}
