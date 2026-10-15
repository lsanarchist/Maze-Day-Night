"""Browser checks of the real application (no mock app/graph).

Default: loads the generated HTML into an isolated page with external requests
blocked. This deliberately tests the Canvas fallback and DOM/controller, NOT
WebGL. Pass --url http://localhost:5173 for the installed-Three.js variant.
Requires: pip install playwright; playwright install chromium
"""
from pathlib import Path
import argparse
import json
import os
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--url')
parser.add_argument('--browser', default=os.environ.get('CHROMIUM_PATH'))
parser.add_argument('--output', default=str(ROOT / 'test-results'))
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
results = []
errors = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    results.append(name)
    print('PASS:', name)

with sync_playwright() as p:
    options = {'headless': True, 'args': ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage']}
    if args.browser:
        options['executable_path'] = args.browser
    browser = p.chromium.launch(**options)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    if args.url:
        page.goto(args.url, wait_until='networkidle')
    else:
        page.route('https://**/*', lambda route: route.abort())
        page.set_content((ROOT / 'dist/index.html').read_text(), wait_until='load')
    page.wait_for_function('window.mazeLab !== undefined')
    page.wait_for_timeout(300)
    state = lambda: page.evaluate('mazeLab.snapshot()')
    check('Initial generated maze and idle controller', state()['phase'] == 'idle' and len(state()['maze']['walls']) == 256)
    check('No startup JavaScript exceptions', not errors)
    if not args.url:
        check('Fallback is explicitly labelled; 3D is disabled, not simulated', state()['engine'] == 'canvas2d' and page.locator('#camera-3d').is_disabled())

    page.locator('#width').fill('4')
    page.locator('#height').fill('4')
    page.locator('#seed').fill('UI-OPEN')
    page.locator('#loops').evaluate("e => {e.value='100'; e.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.locator('#generate-btn').click()
    saved = state()['maze']
    check('UI generator uses dimensions, seed and loop setting', saved['width'] == 4 and saved['height'] == 4 and saved['loops'] == 1)
    page.locator('#width').fill('99')
    page.locator('#generate-btn').click()
    check('Invalid size does not replace the current map', state()['maze'] == saved)
    page.locator('#width').fill('4')
    page.locator('#step-btn').click()
    check('Single-step expands exactly one vertex and stays paused', state()['expanded'] == 1 and state()['phase'] == 'search-paused')
    page.wait_for_timeout(250)
    check('Paused search does not advance with animation frames', state()['expanded'] == 1)
    page.locator('#speed').evaluate("e => {e.value='120'; e.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.locator('#run-btn').click()
    page.wait_for_function("mazeLab.snapshot().phase === 'solved'")
    check('BFS finds the expected shortest route', len(state()['path']) - 1 == 6 and not page.locator('#walk-btn').is_disabled())
    page.locator('#walk-btn').click()
    page.wait_for_function("mazeLab.snapshot().phase === 'won'")
    check('Animated automatic traversal reaches goal without crossing walls', state()['player'] == 15 and state()['moves'] == 6)
    page.locator('#viewport').focus()
    page.keyboard.press('r')
    check('Reset keyboard shortcut resets position and counter', state()['player'] == 0 and state()['moves'] == 0)
    page.keyboard.press('d')
    page.wait_for_timeout(170)
    page.keyboard.press('w')
    check('Keyboard movement and exterior-wall collision', state()['player'] == 1 and state()['moves'] == 1)
    page.locator('#seed').focus()
    page.keyboard.type('wasd')
    check('Typing into a form does not move the player', state()['player'] == 1)
    page.locator('#clear-btn').click()
    check('Clear visualization preserves player position', state()['player'] == 1 and state()['expanded'] == 0)
    page.locator('#help-btn').click()
    check('Help dialog opens', page.locator('#help-dialog').evaluate('e=>e.open'))
    page.keyboard.press('Escape')
    page.locator('#about-btn').click()
    check('About contains university and configurable author field', 'Technická univerzita' in page.locator('#about-details').inner_text() and 'Doplňte meno autora' in page.locator('#about-details').inner_text())
    page.keyboard.press('Escape')
    page.locator('#camera-2d').click()
    page.locator('#edit-mode').click()
    check('Editor disables running the solver', state()['interaction'] == 'edit' and page.locator('#run-btn').is_disabled())

    def point(index, dx=0, dy=0):
        # The offline test uses the fallback's documented orthographic screen layout.
        # Three.js picking is tested separately below when --url enables the real renderer.
        m = state()['maze']
        r = page.locator('.scene-canvas').bounding_box()
        k = min((r['width'] - 80) / m['width'], (r['height'] - 110) / m['height'])
        ox = (r['width'] - m['width'] * k) / 2
        oy = (r['height'] - m['height'] * k) / 2 + 10
        return r['x'] + ox + (index % m['width'] + .5 + dx) * k, r['y'] + oy + (index // m['width'] + .5 + dy) * k

    if state()['engine'] == 'canvas2d':
        original = state()['maze']['walls']
        page.mouse.click(*point(0, .48, 0))
        check('Wall editor updates both adjacent cells', state()['maze']['walls'][0] & 2 and state()['maze']['walls'][1] & 8)
        check('Map edit invalidates simulation and marks unsaved changes', state()['player'] == state()['maze']['start'] and state()['dirty'])
        page.locator('#undo-btn').click()
        check('Undo restores previous wall topology', state()['maze']['walls'] == original)
        page.locator('#redo-btn').click()
        check('Redo restores the edited wall', state()['maze']['walls'][0] & 2)
        page.locator('[data-tool="start"]').click()
        page.mouse.click(*point(5))
        check('Move start in editor', state()['maze']['start'] == 5 and state()['player'] == 5)
        page.locator('[data-tool="goal"]').click()
        page.mouse.click(*point(10))
        check('Move goal in editor', state()['maze']['goal'] == 10)
        page.locator('[data-tool="start"]').click()
        page.mouse.click(*point(10))
        check('Reject overlapping start and goal', state()['maze']['start'] == 5)

    before = state()['maze']
    page.locator('#import-file').set_input_files({'name': 'invalid.json', 'mimeType': 'application/json', 'buffer': b'{bad'})
    page.wait_for_timeout(150)
    check('Malformed import preserves the current map', state()['maze'] == before)
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('#import-file').set_input_files(str(ROOT / 'examples/no-path-8x8.json'))
    page.wait_for_function('mazeLab.snapshot().maze.width === 8')
    check('Valid JSON import replaces map and clears dirty/history', not state()['dirty'] and state()['undoCount'] == 0)
    page.locator('#play-mode').click()
    page.locator('#run-btn').click()
    page.wait_for_function("mazeLab.snapshot().phase === 'unreachable'")
    check('Unreachable goal displays failure and disables autoplay', state()['expanded'] == 1 and page.locator('#walk-btn').is_disabled())

    # Observe real Blob contents before the browser's download UI; this also runs in
    # locked-down environments where writing browser downloads is disallowed.
    page.evaluate("""() => { window.__blobs=[]; const original=URL.createObjectURL; URL.createObjectURL=function(blob){window.__blobs.push(blob); return original.call(URL,blob)}; }""")
    page.locator('#export-btn').click()
    exported = page.evaluate('async () => JSON.parse(await window.__blobs.at(-1).text())')
    world = exported.pop('world')
    check('JSON export preserves exact wall map and endpoints', exported == state()['maze'])
    check('JSON export also preserves clock and lighting preferences', world['totalMinutes'] == state()['clock']['totalMinutes'] and world['stepMode'] == state()['clock']['stepMode'])
    page.locator('#screenshot-btn').click()
    page.wait_for_function("window.__blobs.some(b=>b.type==='image/png')")
    check('Screenshot creates a real PNG blob', page.evaluate("window.__blobs.find(b=>b.type==='image/png').size > 1000"))

    if state()['engine'] == 'three':
        before = state()
        page.locator('#camera-3d').click()
        page.wait_for_timeout(200)
        after = state()
        check('Real perspective camera rendered', after['cameraType'] == 'PerspectiveCamera' and after['drawCalls'] > 0)
        check('2D/3D camera switch preserves map, player and algorithm', before['maze'] == after['maze'] and before['player'] == after['player'] and before['visual'] == after['visual'])
        page.locator('#camera-2d').click()
        check('Real orthographic camera rendered', state()['cameraType'] == 'OrthographicCamera')

    page.screenshot(path=str(out / 'desktop.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(200)
    check('Mobile layout does not overflow horizontally', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    check('Mobile directional controls remain visible', page.locator('.dpad').is_visible())
    page.screenshot(path=str(out / 'mobile.png'), full_page=True)
    check('No uncaught JavaScript exceptions throughout the workflow', not errors)
    report = {'passed': len(results), 'checks': results, 'uncaught_errors': errors, 'engine': state()['engine'], 'webgl_tested': state()['engine'] == 'three'}
    (out / 'browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False))
    browser.close()
