/**
 * @file plugins/generic/dashboardCollapse/js/dashboardCollapse.js
 *
 * Distributed under the GNU GPL v3. For full terms see the file LICENSE.
 *
 * Collapses OJS's left menu (<nav id="app-nav">, the PrimeVue PanelMenu of the
 * ui-library's SideNav) to a column of icons and opens it as a drawer over the
 * page. The menu itself stays OJS's: this script only sets classes on <html> and
 * data attributes on the menu, the styles in css/dashboardCollapse.css do the rest.
 *
 * States, as classes on <html>:
 *   dashboardCollapse            the plugin is active (menu collapsed unless pinned)
 *   dashboardCollapse--open      the drawer is open
 *   dashboardCollapse--pinned    the user keeps the menu open (localStorage)
 *
 * The drawer opens with a click on an icon that has a submenu (an icon with a
 * link just follows it), or when the keyboard focus enters the menu. It closes
 * when a link in it is chosen, the mouse leaves it, on a click outside or Escape,
 * or when the focus moves elsewhere on the page.
 *
 * While collapsed, hovering an icon (or the toggle button) shows its name in a
 * tooltip beside it (one element in <body>, so the menu's overflow doesn't clip
 * it), instead of the browser's small title tooltip.
 */
(function () {
	'use strict';

	const root = document.documentElement;
	const config = window.dashboardCollapseConfig || {};
	const text = Object.assign({keepOpen: 'Keep the menu open', collapse: 'Collapse the menu to icons'}, config.text);
	const STORAGE_KEY = 'dashboardCollapse.pinned';
	const CLOSE_DELAY = 400; // ms after the mouse left the drawer

	const NAV = '#app-nav';
	const MENU = '[data-pc-name="panelmenu"]';
	const PANEL = '[data-pc-section="panel"]';
	const HEADER = '[data-pc-section="header"]';

	function readPinned() {
		try {
			return window.localStorage.getItem(STORAGE_KEY) === '1';
		} catch (e) {
			return false;
		}
	}

	function writePinned(pinned) {
		try {
			if (pinned) {
				window.localStorage.setItem(STORAGE_KEY, '1');
			} else {
				window.localStorage.removeItem(STORAGE_KEY);
			}
		} catch (e) {
			// Private mode or storage blocked: the choice lasts until the next page
		}
	}

	// Set the classes before the page is drawn, so that the menu doesn't jump
	root.classList.add('dashboardCollapse');
	root.classList.toggle('dashboardCollapse--pinned', readPinned());

	const isCollapsed = () => !root.classList.contains('dashboardCollapse--pinned');
	const isOpen = () => root.classList.contains('dashboardCollapse--open');
	const nav = () => document.querySelector(NAV);
	const TOOLTIP_ATTR = 'data-dashboard-collapse-tooltip';

	let closeTimer = null;
	let pointerDown = false;

	function cancelClose() {
		clearTimeout(closeTimer);
		closeTimer = null;
	}

	function open() {
		cancelClose();
		if (isCollapsed()) {
			root.classList.add('dashboardCollapse--open');
		}
		hideTooltip();
	}

	function close() {
		cancelClose();
		root.classList.remove('dashboardCollapse--open');
	}

	let tooltip = null;
	let tooltipFor = null;

	function showTooltip(target) {
		const label = target.getAttribute(TOOLTIP_ATTR);
		if (!label) {
			hideTooltip();
			return;
		}
		if (!tooltip) {
			tooltip = document.createElement('div');
			tooltip.className = 'dashboardCollapse__tooltip';
			tooltip.setAttribute('aria-hidden', 'true'); // the names are in the menu for screen readers
			document.body.appendChild(tooltip);
		}
		tooltipFor = target;
		tooltip.textContent = label;
		const rect = target.getBoundingClientRect();
		const rtl = getComputedStyle(target).direction === 'rtl';
		tooltip.classList.toggle('dashboardCollapse__tooltip--rtl', rtl);
		tooltip.style.top = `${rect.top + rect.height / 2}px`;
		tooltip.style.left = rtl ? '' : `${rect.right + 8}px`;
		tooltip.style.right = rtl ? `${document.documentElement.clientWidth - rect.left + 8}px` : '';
		tooltip.classList.add('dashboardCollapse__tooltip--visible');
	}

	function hideTooltip() {
		tooltipFor = null;
		if (tooltip) {
			tooltip.classList.remove('dashboardCollapse__tooltip--visible');
		}
	}

	function setPinned(pinned) {
		writePinned(pinned);
		close();
		root.classList.toggle('dashboardCollapse--pinned', pinned);
		hideTooltip();
		decorate();
	}

	/** The panel's header has a submenu (Dashboards, Settings, …), not just a link. */
	function hasSubmenu(panel) {
		return !!panel && !!panel.querySelector('[data-pc-section="content"]');
	}

	/**
	 * Data attributes for the styles, a tooltip with the name for each icon, the
	 * first letter of the name for entries without an icon, the section of the
	 * current page, and the button that keeps the menu open. Runs again whenever
	 * Vue redraws the menu.
	 */
	function decorate() {
		const el = nav();
		if (!el) {
			return;
		}
		el.querySelectorAll(PANEL).forEach((panel) => {
			const header = panel.querySelector(HEADER);
			const link = header && header.querySelector('a');
			if (!link) {
				return;
			}
			const label = Array.from(link.children).find((child) => child.tagName === 'SPAN' && !child.hasAttribute('class'));
			const name = (label ? label.textContent : header.getAttribute('aria-label') || '').trim();
			const badge = link.querySelector(':scope > span[slot]');
			const tooltip = badge ? `${name} (${badge.textContent.trim()})` : name;
			if (header.getAttribute(TOOLTIP_ATTR) !== tooltip) {
				header.setAttribute(TOOLTIP_ATTR, tooltip);
			}
			// An icon that is missing or unknown to OJS (empty): show the first letter instead
			const icon = Array.from(link.children).find((child) => child !== label && child !== badge && child.tagName === 'SPAN' && child.nextElementSibling === label);
			const hasIcon = !!(icon && icon.querySelector('svg'));
			const initial = hasIcon ? '' : Array.from(name)[0] || '';
			if ((link.getAttribute('data-dashboard-collapse-initial') || '') !== initial) {
				if (initial) {
					link.setAttribute('data-dashboard-collapse-initial', initial.toLocaleUpperCase());
				} else {
					link.removeAttribute('data-dashboard-collapse-initial');
				}
			}
			const current = !!panel.querySelector('[data-pc-section="content"] a.bg-selection-dark');
			header.toggleAttribute('data-dashboard-collapse-current', current);
		});
		addToggle(el);
	}

	function addToggle(el) {
		let button = el.querySelector(':scope > .dashboardCollapse__toggle');
		if (!button) {
			button = document.createElement('button');
			button.type = 'button';
			button.className = 'dashboardCollapse__toggle';
			button.innerHTML =
				'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
				'<path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
			el.insertBefore(button, el.firstChild);
		}
		const label = isCollapsed() ? text.keepOpen : text.collapse;
		if (button.getAttribute('aria-label') !== label) {
			button.setAttribute('aria-label', label);
			button.setAttribute(TOOLTIP_ATTR, label);
			button.setAttribute('aria-pressed', isCollapsed() ? 'false' : 'true');
		}
	}

	document.addEventListener(
		'click',
		(event) => {
			const el = nav();
			const target = event.target;
			if (!el || !(target instanceof Element)) {
				return;
			}
			if (target.closest('.dashboardCollapse__toggle')) {
				setPinned(isCollapsed());
				return;
			}
			if (!isCollapsed() || !el.contains(target)) {
				return;
			}
			const header = target.closest(HEADER);
			if (!isOpen()) {
				const panel = header && header.closest(PANEL);
				if (hasSubmenu(panel)) {
					open();
					// Already expanded (e.g. the section of the current page): keep it so
					if (header.getAttribute('aria-expanded') === 'true') {
						event.preventDefault();
						event.stopPropagation();
					}
				}
				return;
			}
			// A link in the drawer: close after the menu handled the click (OJS
			// either loads the page or, on the dashboards, only changes the view)
			const link = target.closest('a[href]');
			if (link && link.getAttribute('href') !== '#') {
				setTimeout(close, 0);
			}
		},
		true
	);

	document.addEventListener(
		'pointerdown',
		(event) => {
			const el = nav();
			pointerDown = !!el && el.contains(event.target);
			if (isOpen() && !pointerDown) {
				close();
			}
		},
		true
	);

	document.addEventListener('pointerup', () => {
		setTimeout(() => {
			pointerDown = false;
		}, 0);
	});

	// Keyboard: the drawer opens when the focus enters the menu and closes when it leaves
	document.addEventListener('focusin', (event) => {
		const el = nav();
		if (!el || !isCollapsed()) {
			return;
		}
		const target = event.target;
		if (el.contains(target)) {
			if (!pointerDown && !(target instanceof Element && target.closest('.dashboardCollapse__toggle'))) {
				open();
			}
		} else if (isOpen()) {
			close();
		}
	});

	document.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || !isOpen()) {
			return;
		}
		const el = nav();
		close();
		const header = el && document.activeElement && document.activeElement.closest(PANEL);
		const focus = header && header.querySelector(HEADER);
		if (focus) {
			// Back to the icon of the section, without opening the drawer again
			pointerDown = true;
			focus.focus();
			pointerDown = false;
		}
	});

	// Mouse: close shortly after the pointer left the drawer
	document.addEventListener('pointerout', (event) => {
		const el = nav();
		if (!el || !isOpen() || event.pointerType !== 'mouse' || !el.contains(event.target)) {
			return;
		}
		if (!event.relatedTarget || !el.contains(event.relatedTarget)) {
			cancelClose();
			closeTimer = setTimeout(close, CLOSE_DELAY);
		}
	});

	document.addEventListener('pointerover', (event) => {
		const el = nav();
		if (closeTimer && el && el.contains(event.target)) {
			cancelClose();
		}
		// Tooltip: only while the menu is collapsed to icons, and only for the mouse
		const target = event.target instanceof Element && el && el.contains(event.target) ? event.target.closest(`[${TOOLTIP_ATTR}]`) : null;
		if (target && event.pointerType === 'mouse' && isCollapsed() && !isOpen()) {
			if (target !== tooltipFor) {
				showTooltip(target);
			}
		} else if (tooltipFor) {
			hideTooltip();
		}
	});

	document.addEventListener('pointerout', (event) => {
		if (tooltipFor && (!event.relatedTarget || !tooltipFor.contains(event.relatedTarget))) {
			hideTooltip();
		}
	});

	window.addEventListener('scroll', hideTooltip, true);
	window.addEventListener('blur', hideTooltip);

	// Vue draws the menu after this script ran, and redraws it when it changes
	let scheduled = false;
	const observer = new MutationObserver(() => {
		if (!scheduled) {
			scheduled = true;
			window.requestAnimationFrame(() => {
				scheduled = false;
				decorate();
			});
		}
	});

	function start() {
		observer.observe(document.body, {childList: true, subtree: true, characterData: true});
		decorate();
	}

	if (document.body) {
		start();
	} else {
		document.addEventListener('DOMContentLoaded', start);
	}
})();
