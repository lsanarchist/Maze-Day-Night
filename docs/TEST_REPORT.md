# Звіт перевірок · Maze Lab 1.1.0

Дата: 15.10.2026. Середовище: Node.js v22.16.0, Python / Playwright, Chromium, Linux.

## Фактично виконано

| Перевірка | Результат |
|---|---|
| `npm test` | 145 / 145, нуль помилок. 82 регресійні + 63 нові. |
| `npm run check` | Синтаксис усіх власних JS/MJS пройдено. |
| `npm run build` без npm-залежності | Створено dist/index.html із зовнішнім CDN import map. |
| `tests/browser_smoke.py` у резервному Canvas 2D | 32 / 32, нуль необроблених JavaScript-помилок. |
| `tests/day-night-browser.py` у резервному Canvas 2D | 31 / 31, нуль необроблених JavaScript-помилок. |
| Зміна освітлення в Canvas | Фактичні PNG canvas полудня та півночі різні; перевірено також зміни стану й годинника. |
| Desktop 1440×1000 / mobile 390×844 | Немає горизонтального переповнення; годинник і поповер доступні. |

Новий браузерний тест перевіряє blocked/successful input, приріст за ручний і автоматичний рух, північ і день 2, відсутність витрат часу на solver, камеру, збереження часу після R, випадкові межі, кнопку ліхтаря, JSON roundtrip, атомарну відмову неправильного імпорту, точне поле часу, повзунок, ручне скидання та адаптивність.

Machine-readable результати: `browser-report.json`, `day-night-browser-report.json`. Node TAP: `node-test-results.txt`.

## Не підтверджено запуском

Завантаження офіційної Three.js через npm/CDN у цьому середовищі недоступне. Тому реальний Three.js / WebGL-рендер, вигляд рухомих 3D-сфер, апаратні тіні, GLSL небо, GPU-навантаження та offline-HTML з вбудованою бібліотекою тут НЕ перевірені. Усі прикладені скріншоти зроблені у явно позначеному резервному Canvas 2D. Вони не є 3D-скріншотами.

Триєва реалізація входить до коду, але ці перевірки не доводять її візуальну коректність. Для приймання саме WebGL треба виконати наведений нижче сценарій після npm install. Підміна Canvas у цьому режимі завершує новий тест помилкою.

## Повторний запуск

```bash
npm test
npm run check
npm run build
python tests/browser_smoke.py --browser /path/to/chromium
python tests/day-night-browser.py --browser /path/to/chromium
```

Для справжнього WebGL, перший термінал:

```bash
npm install
npm start
```

Другий термінал:

```bash
python tests/day-night-browser.py --url http://localhost:5173 --browser /path/to/chromium
python tests/browser_smoke.py --url http://localhost:5173 --browser /path/to/chromium
```

Playwright є лише засобом тестування й не потрібний для звичайного запуску застосунку. Потребує встановлених Python, пакета playwright та Chromium. Типовий шлях браузера Linux — /usr/bin/chromium; на інших системах треба вказати власний шлях.
