/** Maze Lab · DOM controller / animation scheduling · v1.0.0 */
import {DIRS, generateMaze, setWall, adjacent, cloneMaze, serializeMaze, parseMaze, Session} from './core.js';
import {WorldClock, phaseAt} from './day-night.js';
import {PROJECT} from './config.js';
import {ThreeView} from './three-view.js';
import {CanvasView} from './canvas-view.js';
import {icon, fillIcons} from './icons.js';

const $ = id => document.getElementById(id);
fillIcons();
const host = $('viewport');
let session = new Session(generateMaze(16, 16, 'TUKE-2026', .08));
let view = new CanvasView(host);
let preferredCamera = '3d';
let interaction = 'play', tool = 'wall', dirty = false;
let undoStack = [], redoStack = [];
let accumulator = 0, lastFrame = performance.now(), lastMove = -Infinity;
let lastPhase = null, toastTimer = null, lastWallMessage = -Infinity;
let engineError = null, pointerDown = null;
let algorithm = 'bfs';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastClockText = '';
const descriptions = {
  bfs: 'Перевіряє клітинки шар за шаром. Знаходить найкоротший шлях.',
  astar: 'Прямує до цілі за мангеттенською евристикою. Знаходить найкоротший шлях.',
  dfs: 'Спочатку йде вглиб однієї гілки. Знайдений шлях не завжди найкоротший.'
};

function notify(message, error = false) {
  clearTimeout(toastTimer); const box = $('toast');
  box.textContent = message; box.classList.toggle('error', error); box.hidden = false;
  toastTimer = setTimeout(() => {box.hidden = true;}, error ? 4500 : 2900);
}

function updateCameraUI() {
  for (const mode of ['2d', '3d']) {
    const active = view.mode === mode;
    $(`camera-${mode}`).classList.toggle('active', active);
    $(`camera-${mode}`).setAttribute('aria-pressed', String(active));
  }
  $('camera-3d').disabled = !view.supported3D;
  $('camera-3d').title = view.supported3D ? 'Перспективна камера (V)' : '3D потребує Three.js та доступного WebGL';
  $('view-label').textContent = view.mode === '3d' ? 'ПЕРСПЕКТИВНИЙ ВИГЛЯД' : (view.supported3D ? 'ОРТОГРАФІЧНИЙ ВИГЛЯД' : '2D · РЕЗЕРВНИЙ РЕЖИМ');
  $('minimap-panel').hidden = view.mode === '2d';
  const hint = interaction === 'edit' ? 'Клік — редагування · ПКМ — зсув · колесо — масштаб'
    : view.mode === '3d' ? 'Тягни, щоб обертати · колесо — масштаб' : 'Тягни, щоб пересувати · колесо — масштаб';
  $('viewport-help').querySelector('span').textContent = hint;
}

function statusText() {
  if (interaction === 'edit') return ['Редактор лабіринту', 'Зміна карти скидає пошук і повертає гравця на старт.', 'edit'];
  const s = session;
  switch (s.phase) {
    case 'searching': return [`${algorithm === 'astar' ? 'A*' : algorithm.toUpperCase()} досліджує лабіринт`, `Перевірено ${s.expanded} · кандидатів ${s.frontier}`, 'search'];
    case 'search-paused': return ['Пошук призупинено', 'Продовжуй або виконай один крок клавішею N.', 'pause'];
    case 'solved': return ['Маршрут знайдено', `${s.pathLength} переходів до фінішу. Натисни «Пройти шлях».`, 'route'];
    case 'unreachable': return ['Шлях не існує', 'Усі доступні клітинки перевірено. Зміни стіни або фініш.', 'alert'];
    case 'walking': return ['Рух за знайденим маршрутом', `Пройдено ${s.walkIndex} із ${s.pathLength} переходів.`, 'route'];
    case 'walk-paused': return ['Проходження призупинено', 'Продовжуй або виконай один крок клавішею N.', 'pause'];
    case 'won': return ['Фініш! Лабіринт пройдено.', `Виконано ${s.moves} переходів. Створи нову карту або повернись на старт.`, 'check'];
    default: return ['Готовий до дослідження', 'Знайди вихід сам або запусти алгоритм.', 'compass'];
  }
}

function updateUI() {
  const s = session, m = s.maze;
  $('scene-title').firstChild.textContent = `Лабіринт ${m.width} × ${m.height} `;
  $('dirty-marker').hidden = !dirty;
  $('seed-chip').textContent = `SEED / ${m.seed || '∅'}${m.edited ? ' · EDITED' : ''}`;
  $('stat-size').innerHTML = `${m.walls.length}<small>клітинок</small>`;
  $('stat-visited').innerHTML = `${s.expanded}<small>/ ${m.walls.length}</small>`;
  $('stat-path').innerHTML = `${s.pathLength === null ? '—' : s.pathLength}<small>кроків</small>`;
  $('stat-moves').innerHTML = `${s.moves}<small>кроків</small>`;
  $('path-note').textContent = s.phase === 'unreachable' ? 'Фініш недосяжний' : s.pathLength === null ? 'Ще не знайдено' : algorithm === 'dfs' ? 'Маршрут DFS' : 'Найкоротший маршрут';
  $('frontier-note').textContent = s.search ? `У черзі кандидатів: ${s.frontier}` : `Позиція ${s.player % m.width + 1} : ${Math.floor(s.player / m.width) + 1}`;
  $('search-progress').style.width = `${s.expanded / m.walls.length * 100}%`;
  $('coordinate').textContent = `X ${String(s.player % m.width + 1).padStart(2, '0')} · Y ${String(Math.floor(s.player / m.width) + 1).padStart(2, '0')}`;
  const running = ['searching', 'walking'].includes(s.phase), paused = ['search-paused', 'walk-paused'].includes(s.phase);
  $('run-btn').innerHTML = `<i data-icon="${running ? 'pause' : 'play'}">${icon(running ? 'pause' : 'play')}</i><span>${running ? 'Пауза' : paused ? 'Продовжити' : 'Почати пошук'}</span>`;
  $('run-btn').disabled = interaction === 'edit'; $('step-btn').disabled = interaction === 'edit';
  $('walk-btn').disabled = s.phase !== 'solved' || interaction === 'edit';
  $('algorithm').disabled = running || paused;
  $('undo-btn').disabled = !undoStack.length; $('redo-btn').disabled = !redoStack.length;
  const [title, detail, symbol] = statusText();
  $('status-title').textContent = title; $('status-detail').textContent = detail;
  $('status-symbol').innerHTML = `<i data-icon="${symbol}">${icon(symbol)}</i>`;
  $('status-card').dataset.state = s.phase;
  if (s.phase === 'won' && lastPhase !== 'won') notify('Фініш! Чудова робота.');
  lastPhase = s.phase;
  drawMinimap(); updateClockUI();
}

/** The numeric clock shows committed game time; the orbit/lighting ease towards it. */
function updateClockUI() {
  const c = session.clock, phase = phaseAt(c.totalMinutes);
  const signature = `${c.totalMinutes}|${c.stepMode}|${c.lastStep}|${c.lantern}`;
  if (signature !== lastClockText) {
    lastClockText = signature;
    $('world-time').textContent = c.text;
    $('world-day').textContent = `ДЕНЬ ${String(c.day).padStart(2,'0')}`;
    $('world-phase').textContent = phase.label; $('world-icon').textContent = phase.icon;
    $('world-bar').dataset.phase = phase.id;
    $('last-time-step').textContent = c.lastStep ? `+${c.lastStep} хв за крок` : 'Час іде лише під час руху';
    $('step-minutes').value = c.stepMode;
    $('lantern-btn').classList.toggle('active', c.lantern);
    $('lantern-btn').setAttribute('aria-pressed', String(c.lantern));
    $('lantern-btn').title = c.lantern ? 'Ліхтар увімкнений: засвітиться вночі' : 'Увімкнути нічний ліхтар';
    if (document.activeElement !== $('time-input')) $('time-input').value = c.text;
    $('time-scrubber').value = c.timeOfDay;
    $('time-scrubber').setAttribute('aria-valuetext', c.text);
  }
  const angle = c.sky.angle;
  // East on the left, west on the right: the upper half is above the horizon.
  for (const [id, offset] of [['orbit-sun',0], ['orbit-moon',Math.PI]]) {
    const a = angle+offset, x = 84-68*Math.cos(a), y = 45-31*Math.sin(a);
    $(id).setAttribute('transform',`translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    $(id).setAttribute('opacity', Math.sin(a)>=0 ? '1' : '.18');
  }
}
function applyWorldTime(minutes) {
  try {session.pause(); accumulator = 0; session.clock.setTimeOfDay(minutes); sync();}
  catch(error) {notify(error.message,true);}
}
$('step-minutes').addEventListener('change', () => {session.clock.setStepMode($('step-minutes').value);updateClockUI();});
$('lantern-btn').addEventListener('click', () => {session.clock.lantern = !session.clock.lantern;updateClockUI();});
document.querySelectorAll('[data-world-time]').forEach(button => button.addEventListener('click', () => applyWorldTime(Number(button.dataset.worldTime))));
$('time-apply').addEventListener('click', () => {
  const match = /^(\d{2}):(\d{2})$/.exec($('time-input').value);
  if (!match) {notify('Вкажи час у форматі ГГ:ХХ.',true);return;}
  applyWorldTime(Number(match[1])*60+Number(match[2]));
});
$('time-scrubber').addEventListener('input', () => applyWorldTime(Number($('time-scrubber').value)));
$('time-reset').addEventListener('click', () => {session.pause();accumulator=0;session.clock.reset();sync();});
$('time-settings').addEventListener('toggle', () => {if($('time-settings').open){session.pause();accumulator=0;sync();}});
document.addEventListener('pointerdown', event => {if (!$('time-settings').contains(event.target)) $('time-settings').open=false;});

function sync({rebuild = false, immediate = false} = {}) {
  view.sync(session, rebuild, immediate); updateUI();
}

function drawMinimap() {
  const canvas = $('minimap'), ctx = canvas.getContext('2d'), s = session, m = s.maze;
  const k = 174 / Math.max(m.width, m.height), ox = (180 - m.width * k) / 2, oy = (180 - m.height * k) / 2;
  ctx.clearRect(0, 0, 180, 180); ctx.fillStyle = '#15222d'; ctx.fillRect(0, 0, 180, 180);
  for (let i = 0; i < m.walls.length; i++) {
    if (!s.visual[i]) continue;
    ctx.fillStyle = s.visual[i] === 3 ? '#b08851' : s.visual[i] === 1 ? '#6ce5c0' : '#356c8d';
    ctx.fillRect(ox + i % m.width * k, oy + Math.floor(i / m.width) * k, k, k);
  }
  ctx.strokeStyle = '#718897'; ctx.lineWidth = .8; ctx.beginPath();
  for (let i = 0; i < m.walls.length; i++) {
    const x = ox + (i % m.width) * k, y = oy + Math.floor(i / m.width) * k;
    if (m.walls[i] & 1) {ctx.moveTo(x, y); ctx.lineTo(x + k, y);}
    if (m.walls[i] & 8) {ctx.moveTo(x, y); ctx.lineTo(x, y + k);}
    if (i % m.width === m.width - 1 && m.walls[i] & 2) {ctx.moveTo(x + k, y); ctx.lineTo(x + k, y + k);}
    if (Math.floor(i / m.width) === m.height - 1 && m.walls[i] & 4) {ctx.moveTo(x, y + k); ctx.lineTo(x + k, y + k);}
  }
  ctx.stroke();
  for (const [index, color] of [[m.start, '#6ce5c0'], [m.goal, '#f1b96c'], [s.player, '#fff6d5']]) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.arc(ox + (index % m.width + .5) * k, oy + (Math.floor(index / m.width) + .5) * k, Math.max(2.1, k * .26), 0, Math.PI * 2); ctx.fill();
  }
}

function setCamera(mode) {
  preferredCamera = mode;
  if (mode === '3d' && !view.supported3D) {notify('3D недоступне: потрібні Three.js та WebGL. Деталі в README.', true); return;}
  view.setMode(mode); updateCameraUI();
}

function setInteraction(mode) {
  interaction = mode;
  if (mode === 'edit') {session.clearSearch(); accumulator = 0;}
  for (const name of ['play', 'edit']) {
    const active = name === mode;
    $(`${name}-mode`).classList.toggle('active', active); $(`${name}-mode`).setAttribute('aria-pressed', String(active));
    $(`${name === 'play' ? 'play' : 'editor'}-controls`).hidden = !active;
  }
  view.setEditing(mode === 'edit', tool); updateCameraUI(); sync();
}

function selectTool(name) {
  tool = name; view.setEditing(interaction === 'edit', tool);
  document.querySelectorAll('[data-tool]').forEach(btn => {btn.classList.toggle('active', btn.dataset.tool === tool); btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool));});
  $('edit-hint').textContent = tool === 'wall' ? 'Клік біля краю клітинки додає або прибирає стіну. Зовнішня межа захищена.'
    : `Натисни на клітинку, щоб встановити ${tool === 'start' ? 'старт' : 'фініш'}. Старт і фініш не можуть збігатися.`;
}

function remember() {
  undoStack.push(cloneMaze(session.maze)); if (undoStack.length > 50) undoStack.shift(); redoStack = [];
}

function editAt(pick) {
  if (!pick || interaction !== 'edit') return;
  const m = session.maze;
  if (tool === 'wall' && adjacent(m, pick.index, pick.direction) === -1) {notify('Зовнішня межа захищена.', true); return;}
  if (tool === 'start' && pick.index === m.goal || tool === 'goal' && pick.index === m.start) {notify('Старт і фініш мають бути різними.', true); return;}
  if (tool !== 'wall' && m[tool] === pick.index) return;
  remember(); const next = cloneMaze(m);
  if (tool === 'wall') setWall(next, pick.index, pick.direction, !(next.walls[pick.index] & DIRS[pick.direction].bit));
  else next[tool] = pick.index;
  next.edited = true; session.load(next, {resetClock: false}); dirty = true; accumulator = 0;
  sync({rebuild: true, immediate: true}); view.setHover(pick);
}

function historyMove(redo = false) {
  if (interaction !== 'edit') return;
  const source = redo ? redoStack : undoStack, dest = redo ? undoStack : redoStack;
  if (!source.length) return;
  dest.push(cloneMaze(session.maze)); session.load(source.pop(), {resetClock: false}); dirty = true; accumulator = 0;
  sync({rebuild: true, immediate: true});
}

function bindCanvas() {
  view.canvas.addEventListener('pointerdown', e => {
    pointerDown = {x: e.clientX, y: e.clientY, id: e.pointerId, button: e.button};
    host.focus({preventScroll: true});
  });
  view.canvas.addEventListener('pointermove', e => {
    if (interaction === 'edit') view.setHover(view.getPick(e.clientX, e.clientY));
  });
  view.canvas.addEventListener('pointerup', e => {
    if (pointerDown?.id === e.pointerId && pointerDown.button === 0 && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) < 6) {
      editAt(view.getPick(e.clientX, e.clientY));
    }
    pointerDown = null;
  });
  view.canvas.addEventListener('pointercancel', () => {pointerDown = null;});
  view.canvas.addEventListener('pointerleave', () => view.setHover(null));
}

function toggleRun() {
  if (interaction !== 'play') return;
  if (['searching', 'walking'].includes(session.phase)) session.pause();
  else if (['search-paused', 'walk-paused'].includes(session.phase)) session.resume();
  else session.beginSearch(algorithm);
  accumulator = 0; sync();
}

function move(direction) {
  if (interaction !== 'play') return;
  const now = performance.now(); if (now - lastMove < 145) return;
  lastMove = now;
  const result = session.move(direction);
  if (result === 'moved') {accumulator = 0; sync();}
  else if (now - lastWallMessage > 1700) {
    lastWallMessage = now;
    notify(result === 'wall' ? 'Тут стіна. Спробуй інший напрямок.' : 'Спочатку постав автоматичний рух або пошук на паузу.');
  }
}

function confirmReplace() {return !dirty || window.confirm('Карта має незбережені зміни. Замінити її?');}
function updateInputs() {
  const m = session.maze; $('width').value = m.width; $('height').value = m.height;
  $('seed').value = m.seed; $('loops').value = Math.round(m.loops * 100); $('loops-value').textContent = `${$('loops').value}%`;
}
function generate() {
  try {
    const next = generateMaze(Number($('width').value), Number($('height').value), $('seed').value, Number($('loops').value) / 100);
    if (!confirmReplace()) return;
    session.load(next); undoStack = []; redoStack = []; dirty = false; accumulator = 0;
    sync({rebuild: true, immediate: true}); view.fit(true); notify('Новий лабіринт згенеровано.');
  } catch (error) {notify(error.message, true);}
}
function downloadBlob(blob, name) {
  if (!blob) throw new Error('Не вдалося підготувати файл.');
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function fileName(extension) {
  const m = session.maze, seed = m.seed.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'custom';
  return `maze-${m.width}x${m.height}-${seed}.${extension}`;
}

$('brand-home').addEventListener('click', e => {e.preventDefault(); view.fit();});
$('camera-2d').addEventListener('click', () => setCamera('2d'));
$('camera-3d').addEventListener('click', () => setCamera('3d'));
$('fit-btn').addEventListener('click', () => view.fit());
$('play-mode').addEventListener('click', () => setInteraction('play'));
$('edit-mode').addEventListener('click', () => setInteraction('edit'));
document.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => selectTool(btn.dataset.tool)));
document.querySelectorAll('[data-move]').forEach(btn => btn.addEventListener('click', () => move(Number(btn.dataset.move))));
$('undo-btn').addEventListener('click', () => historyMove());
$('redo-btn').addEventListener('click', () => historyMove(true));
$('generate-btn').addEventListener('click', generate);
$('random-seed').addEventListener('click', () => {
  const values = new Uint32Array(1); crypto.getRandomValues(values);
  $('seed').value = `MAZE-${values[0].toString(36).toUpperCase().padStart(6, '0')}`;
  notify('Новий seed готовий. Натисни «Згенерувати лабіринт».');
});
$('loops').addEventListener('input', () => {$('loops-value').textContent = `${$('loops').value}%`;});
$('speed').addEventListener('input', () => {$('speed-value').textContent = `${$('speed').value} кроків/с`;});
$('algorithm').addEventListener('change', () => {
  algorithm = $('algorithm').value; session.clearSearch(); accumulator = 0;
  $('algorithm-description').textContent = descriptions[algorithm];
  $('algorithm-badge').textContent = algorithm === 'dfs' ? 'БУДЬ-ЯКИЙ ШЛЯХ' : 'НАЙКОРОТШИЙ'; sync();
});
$('run-btn').addEventListener('click', toggleRun);
$('step-btn').addEventListener('click', () => {if (interaction === 'play') {session.singleStep(algorithm); accumulator = 0; sync();}});
$('walk-btn').addEventListener('click', () => {session.startWalking(); accumulator = 0; sync();});
$('clear-btn').addEventListener('click', () => {session.clearSearch(); accumulator = 0; sync();});
$('reset-player').addEventListener('click', () => {session.resetPlayer(); accumulator = 0; sync({immediate: true});});
$('export-btn').addEventListener('click', () => {
  try {
    const saved = JSON.parse(serializeMaze(session.maze)); saved.world = session.clock.snapshot();
    downloadBlob(new Blob([JSON.stringify(saved, null, 2)], {type: 'application/json'}), fileName('json'));
    dirty = false; updateUI(); notify('Карту експортовано у JSON.');
  } catch (error) {notify(error.message, true);}
});
$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
  try {
    if (file.size > 100_000) throw new Error('Максимальний розмір карти — 100 КБ.');
    const text = await file.text(), next = parseMaze(text), world = JSON.parse(text).world;
    if (world !== undefined) WorldClock.validate(world);
    if (!confirmReplace()) return;
    session.load(next); if (world !== undefined) session.clock.restore(world);
    dirty = false; undoStack = []; redoStack = []; accumulator = 0;
    updateInputs(); sync({rebuild: true, immediate: true}); view.fit(true); notify('Карту відкрито.');
  } catch (error) {notify(error.message, true);}
});
$('screenshot-btn').addEventListener('click', async () => {
  try {downloadBlob(await view.capture(), fileName('png')); notify('Знімок сцени збережено.');}
  catch (error) {notify(`Не вдалося створити PNG: ${error.message}`, true);}
});
$('help-btn').addEventListener('click', () => {session.pause(); sync(); $('help-dialog').showModal();});
$('about-btn').addEventListener('click', () => {session.pause(); sync(); $('about-dialog').showModal();});
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', e => {
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
});
$('about-project').textContent = PROJECT.title;
$('step-minutes').value = session.clock.stepMode;
for (const [label, text] of [['Autor', PROJECT.author], ['Univerzita', PROJECT.university], ['Fakulta', PROJECT.faculty], ['Katedra', PROJECT.department], ['Predmet', PROJECT.course], ['Školský rok', PROJECT.year], ['Verzia', PROJECT.version]]) {
  const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = text;
  $('about-details').append(dt, dd);
}

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) {
    if (interaction === 'edit') {e.preventDefault(); historyMove(e.shiftKey || e.code === 'KeyY');} return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const direction = {ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3}[e.code];
  if (direction !== undefined) {e.preventDefault(); move(direction); return;}
  if (e.repeat) return;
  if (e.code === 'Space' && !e.target.closest('button')) {e.preventDefault(); toggleRun();}
  if (e.code === 'KeyV') {e.preventDefault(); setCamera(view.mode === '2d' ? '3d' : '2d');}
  if (e.code === 'KeyF') {e.preventDefault(); view.fit();}
  if (e.code === 'KeyN' && interaction === 'play') {e.preventDefault(); session.singleStep(algorithm); accumulator = 0; sync();}
  if (e.code === 'KeyR' && interaction === 'play') {e.preventDefault(); session.resetPlayer(); accumulator = 0; sync({immediate: true});}
});
window.addEventListener('beforeunload', e => {if (dirty) {e.preventDefault(); e.returnValue = '';}});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {session.pause(); accumulator = 0; sync();}
  lastFrame = performance.now();
});

/** Read-only diagnostics for teaching and repeatable browser tests; no DOM internals. */
Object.defineProperty(window, 'mazeLab', {value: Object.freeze({version: PROJECT.version, snapshot: () => ({
  maze: JSON.parse(serializeMaze(session.maze)), player: session.player, phase: session.phase,
  expanded: session.expanded, frontier: session.frontier, path: [...session.path], visual: [...session.visual],
  moves: session.moves, camera: view.mode, engine: view.supported3D ? 'three' : 'canvas2d',
  interaction, dirty, undoCount: undoStack.length, redoCount: redoStack.length,
  cameraType: view.supported3D ? view.camera.type : 'Canvas2D',
  drawCalls: view.supported3D ? view.renderer.info.render.calls : null,
  clock: session.clock.snapshot(), visualMinutes: session.clock.visualMinutes,
  sky: session.clock.sky, lighting: view.supported3D ? view.environment.snapshot() : null
})}), writable: false});

function animate(now) {
  const dt = Math.min(.1, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  let changed = false;
  if (!document.hidden && ['searching', 'walking'].includes(session.phase)) {
    const interval = session.phase === 'searching' ? 1 / Number($('speed').value) : 1 / 6;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= interval && steps++ < 24) {
      accumulator -= interval;
      if (session.phase === 'searching') session.advanceSearch();
      else if (session.phase === 'walking') session.advanceWalk();
      else {accumulator = 0; break;}
      changed = true;
    }
  }
  if (changed) sync();
  session.clock.update(dt, reducedMotion); updateClockUI();
  view.update(dt, now / 1000);
  requestAnimationFrame(animate);
}

/** Load real Three.js; failure is visible and does not pretend that 3D works. */
async function loadThree() {
  const slowTimer = setTimeout(() => showEngineFailure(new Error('Завантаження Three.js триває надто довго.')), 9000);
  try {
    const [THREE, {OrbitControls}] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]);
    clearTimeout(slowTimer);
    const newView = new ThreeView(THREE, OrbitControls, host);
    try {newView.sync(session, true, true); newView.fit(true); newView.setMode(preferredCamera); newView.setEditing(interaction === 'edit', tool);}
    catch (error) {newView.dispose(); throw error;}
    const oldView = view; view = newView; oldView.dispose(); bindCanvas();
    $('engine-label').textContent = `Three.js r${THREE.REVISION} · WebGL`;
    $('load-note').hidden = true; updateCameraUI(); sync();
    // A lost GPU context is distinct from a network failure. Keep the graph usable.
    view.canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); session.pause();
      const lostView = view; view = new CanvasView(host); lostView.dispose(); bindCanvas();
      view.sync(session); view.setEditing(interaction === 'edit', tool); showEngineFailure(new Error('Контекст WebGL втрачено. Перезавантаж сторінку для повторної спроби.'));
    }, {once: true});
  } catch (error) {clearTimeout(slowTimer); showEngineFailure(error);}
}
function showEngineFailure(error) {
  engineError = error; $('engine-label').textContent = 'Canvas 2D · резервний';
  $('load-note').textContent = '3D недоступне. Працює резервний 2D. Для 3D потрібен WebGL; без інтернету запускай локальну збірку з Three.js (див. README).';
  host.before($('load-note'));
  $('load-note').hidden = false; updateCameraUI(); updateUI();
  console.warn('Maze Lab: Three.js/WebGL unavailable. Canvas 2D fallback is active.', error.message);
}

bindCanvas(); sync({rebuild: true, immediate: true}); updateCameraUI();
requestAnimationFrame(animate);
loadThree();
