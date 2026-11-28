/**
 * Browser test: Dashboard Collapse together with Mobile Dashboard
 * (github.com/SNatangelo/ojs-mobile-dashboard), see issue #3. Not run by CI.
 *
 * Runs against OJS 3.5's own menu component in a static Storybook build of the
 * ui-library, with both plugins' files injected into the page:
 *
 *   git clone --depth 1 -b stable-3_5_0 https://github.com/pkp/ui-library
 *   (cd ui-library && npm install --ignore-scripts && npx storybook build -o ../sb-static)
 *   git clone https://github.com/SNatangelo/ojs-mobile-dashboard
 *   SB_STATIC=sb-static MD_DIR=ojs-mobile-dashboard node dev/test/mobileDashboard.browser.mjs
 *
 * Needs Playwright with Chromium. Screenshots go to SHOTS_DIR if set.
 */
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';

const STATIC = path.resolve(process.env.SB_STATIC || 'sb-static');
const DC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const MD = path.resolve(process.env.MD_DIR || 'ojs-mobile-dashboard');
const SHOTS = process.env.SHOTS_DIR;
const types = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};

let failures = 0;
function check(name, ok, extra = '') {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
	if (!ok) failures++;
}

async function open(browser, {md = 'normal', width = 1300, pinned = false} = {}) {
	const ctx = await browser.newContext({viewport: {width, height: 844}});
	const page = await ctx.newPage();
	await page.addInitScript((pinned) => {
		if (pinned) localStorage.setItem('dashboardCollapse.pinned', '1');
		window.__flash = false;
		new MutationObserver(() => {
			if (document.documentElement.classList.contains('dashboardCollapse')) window.__flash = true;
		}).observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
	}, pinned);
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.host !== 'sb.test') return route.fulfill({status: 200, contentType: 'application/json', body: '{}'});
		let file;
		if (url.pathname.startsWith('/plugins/generic/dashboardCollapse/')) file = DC + url.pathname.slice('/plugins/generic/dashboardCollapse'.length);
		else if (url.pathname.startsWith('/plugins/generic/mobileDashboard/')) file = MD + url.pathname.slice('/plugins/generic/mobileDashboard'.length);
		else if (url.pathname.startsWith('/elsewhere/')) file = MD + '/styles/' + path.basename(url.pathname);
		else file = STATIC + (url.pathname === '/' ? '/index.html' : url.pathname);
		if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
		let body = fs.readFileSync(file);
		if (url.pathname === '/iframe.html') {
			const mdBase = md === 'normal' ? '/plugins/generic/mobileDashboard/styles/' : '/elsewhere/';
			const mdTags = md === 'none' ? '' :
				`<link rel="stylesheet" href="${mdBase}mobile.css?v=1.0.0.1"><script src="${mdBase}mobile.js?v=1.0.0.1"></script>`;
			const tags = mdTags +
				`<link rel="stylesheet" href="/plugins/generic/dashboardCollapse/css/dashboardCollapse.css?v=0.1.1.0">` +
				`<script>window.dashboardCollapseConfig = {"text":{"keepOpen":"Keep open","collapse":"Collapse"}};</script>` +
				`<script src="/plugins/generic/dashboardCollapse/js/dashboardCollapse.js?v=0.1.1.0"></script>`;
			body = body.toString().replace('</head>', tags + '</head>');
		}
		return route.fulfill({status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body});
	});
	await page.goto('http://sb.test/iframe.html?id=pages-page--default&viewMode=story');
	await page.waitForSelector('#app-nav [data-pc-section="header"]', {state: 'attached'});
	await page.waitForTimeout(300);
	return {ctx, page};
}

const state = (page) => page.evaluate(() => ({
	cls: [...document.documentElement.classList].filter((c) => c.startsWith('dashboardCollapse')).join(' '),
	toggles: document.querySelectorAll('.dashboardCollapse__toggle').length,
	tooltips: document.querySelectorAll('.dashboardCollapse__tooltip').length,
	mdToggle: !!document.getElementById('mdNavToggle'),
	pinnedStored: localStorage.getItem('dashboardCollapse.pinned'),
	flash: window.__flash,
}));

async function resize(page, width) {
	await page.setViewportSize({width, height: 844});
	await page.waitForTimeout(250);
}

// Taps on the menu entries reach the menu (not a backdrop or something above it)
async function tappable(page) {
	return page.evaluate(() => {
		const heads = [...document.querySelectorAll('#app-nav [data-pc-section="header"]')];
		return heads.filter((h) => {
			const r = h.getBoundingClientRect();
			if (!r.width || !r.height) return false;
			const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			return el && h.contains(el);
		}).length + '/' + heads.length;
	});
}

const browser = await chromium.launch();

// 1. Without Mobile Dashboard nothing changes, also when narrow
{
	const {ctx, page} = await open(browser, {md: 'none', width: 1300});
	let s = await state(page);
	check('no MD, 1300: active with one toggle', s.cls === 'dashboardCollapse' && s.toggles === 1, JSON.stringify(s));
	await resize(page, 390);
	s = await state(page);
	check('no MD, 390: still active', s.cls === 'dashboardCollapse' && s.toggles === 1, JSON.stringify(s));
	await ctx.close();
}

// 2. With Mobile Dashboard, phone width: suspended from the first paint, MD drawer usable
for (const width of [390, 900]) {
	const {ctx, page} = await open(browser, {md: 'normal', width});
	let s = await state(page);
	check(`MD, ${width}: suspended (no classes, no toggle, MD button present)`, s.cls === '' && s.toggles === 0 && s.mdToggle, JSON.stringify(s));
	check(`MD, ${width}: no flash of the rail on load`, !s.flash);
	await page.click('#mdNavToggle');
	await page.waitForTimeout(400);
	check(`MD, ${width}: all menu entries receive taps in MD's drawer`, /^(\d+)\/\1$/.test(await tappable(page)), await tappable(page));
	const names = await page.evaluate(() => [...document.querySelectorAll('#app-nav [data-pc-section="header"] a > span:not([class])')].filter((s) => s.getBoundingClientRect().width > 20).length);
	check(`MD, ${width}: names visible in the drawer`, names > 3, String(names));
	// One tap on Settings expands it, a second on a sub-item follows it
	await page.locator('#app-nav [data-pc-section="header"]', {hasText: 'Settings'}).click();
	await page.waitForTimeout(300);
	const expanded = await page.locator('#app-nav [data-pc-section="header"]', {hasText: 'Settings'}).getAttribute('aria-expanded');
	check(`MD, ${width}: one tap expands Settings`, expanded === 'true', expanded);
	if (width === 390 && SHOTS) await page.screenshot({path: SHOTS + '/md-390-drawer.png'});
	await ctx.close();
}

// 3. 901 px is ours
{
	const {ctx, page} = await open(browser, {md: 'normal', width: 901});
	const s = await state(page);
	check('MD, 901: active', s.cls === 'dashboardCollapse' && s.toggles === 1, JSON.stringify(s));
	if (SHOTS) await page.screenshot({path: SHOTS + '/md-901.png'});
	await ctx.close();
}

// 4. Crossing the width without a reload, with the drawer open, then pinned
{
	const {ctx, page} = await open(browser, {md: 'normal', width: 1300});
	await page.locator('#app-nav [data-pc-section="header"]', {hasText: 'Settings'}).click();
	await page.waitForTimeout(200);
	let s = await state(page);
	check('MD, 1300: our drawer opens', s.cls.includes('dashboardCollapse--open'), s.cls);
	await page.mouse.move(30, 300);
	await resize(page, 390);
	s = await state(page);
	check('1300→390 with drawer open: suspended, no toggle, no tooltip', s.cls === '' && s.toggles === 0 && s.tooltips === 0, JSON.stringify(s));
	await resize(page, 1300);
	s = await state(page);
	check('→1300: active, collapsed, one toggle', s.cls === 'dashboardCollapse' && s.toggles === 1, JSON.stringify(s));
	await page.click('.dashboardCollapse__toggle');
	await page.waitForTimeout(100);
	s = await state(page);
	check('pin at 1300', s.cls.includes('--pinned') && s.pinnedStored === '1', JSON.stringify(s));
	await resize(page, 390);
	s = await state(page);
	check('→390 pinned: suspended, pinned value kept in storage', s.cls === '' && s.toggles === 0 && s.pinnedStored === '1', JSON.stringify(s));
	await page.click('#mdNavToggle');
	await page.waitForTimeout(400);
	check('→390: MD drawer entries receive taps', /^(\d+)\/\1$/.test(await tappable(page)), await tappable(page));
	await page.click('#mdNavBackdrop', {position: {x: 380, y: 400}}).catch(() => {});
	await page.waitForTimeout(300);
	await resize(page, 1300);
	s = await state(page);
	check('→1300: pinned again, one toggle', s.cls === 'dashboardCollapse dashboardCollapse--pinned' && s.toggles === 1, JSON.stringify(s));
	for (let i = 0; i < 3; i++) {
		await resize(page, 390);
		await resize(page, 1300);
	}
	s = await state(page);
	check('after 3 more round trips: exactly one toggle', s.toggles === 1 && s.cls.includes('--pinned'), JSON.stringify(s));
	await ctx.close();
}

// 5. Detection by the DOM markers only (MD's files under another path)
{
	const {ctx, page} = await open(browser, {md: 'elsewhere', width: 390});
	const s = await state(page);
	check('MD under another path, 390: suspended via its button', s.cls === '' && s.toggles === 0 && s.mdToggle, JSON.stringify(s));
	await page.click('#mdNavToggle');
	await page.waitForTimeout(400);
	check('MD under another path: entries receive taps', /^(\d+)\/\1$/.test(await tappable(page)), await tappable(page));
	await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
