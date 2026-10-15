/** Small inline SVG icons; no icon font or external request. */
const ICONS = {
  folder: '<path d="M3 7V5h6l2 2h10v12H3Z"/><path d="M3 10h18"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  shuffle: '<path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>',
  refresh: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 4v16M16 4v16" stroke-width="3"/>',
  step: '<path d="m5 4 10 8-10 8ZM19 4v16"/>',
  route: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h8a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h8"/>',
  erase: '<path d="m3 13 9-10 9 8-9 10H9Zm6-7 9 8M12 21h9"/>',
  gamepad: '<path d="M7 6h10c3 0 5 10 3 12-2 2-5-3-5-3H9s-3 5-5 3C2 16 4 6 7 6Z"/><path d="M7 9v5m-2-2.5h4m6-1.5h.01m3 3h.01"/>',
  edit: '<path d="m15 3 6 6-12 12H3v-6Zm-3 3 6 6M3 15l6 6"/>',
  rewind: '<path d="M3 11 9 5m-6 6 6 6M3 11h10a7 7 0 0 1 7 7"/>',
  wall: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M12 4v6M8 10v5m8-5v5m-4 0v5"/>',
  undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5m-5 5 5 5"/>',
  redo: '<path d="M21 10H10a6 6 0 0 0 0 12m11-12-5-5m5 5-5 5"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5M7.5 4.5l9 5"/>',
  fit: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7m-6 1h12"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  alert: '<path d="m12 3 10 18H2Zm0 6v5m0 3h.01"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>'
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.compass}</svg>`;
}
export function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {el.innerHTML = icon(el.dataset.icon);});
}
