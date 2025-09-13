/**
 * Element Snatch CSS
 * Ctrl + Shift + Middle-click opens a Menu listing ancestors from <body> down to the clicked element.
 * Hovering a menu item highlights its element. Clicking generates nested CSS from that element
 * (including all descendants) and copies it to the clipboard..
 *
 * No execCommand fallback is used for clipboard.
 */

// @ts-check
const Obsidian = require("obsidian");
const { Plugin, Menu, Notice } = Obsidian;
// @ts-ignore
const Electron = require("electron");

/** @typedef {import("obsidian").MenuItem} MenuItem */


/**
 * Lightweight wrapper around Obsidian Notice with auto-disposal.
 * Tracks all active instances to allow bulk cleanup on unload.
 */
class Noticer {
	constructor() {
		this._n = null;
		this._t = null;
		Noticer._all.add(this);
	}
	/**
	 * Show a Notice for a limited time.
	 * @param {string} message
	 * @param {number} [timeout = 0] Milliseconds to show; defaults to 3000.
	 * @returns {this}
	 */
	show(message, timeout = 0) {
		const ms = Number.isFinite(timeout) ? Math.max(0, timeout | 0) : 3000;
		// do not dispose the instance here (which would drop it from _all)
		// instead, hide any existing Notice and clear the timer
		if (this._t) { try { clearTimeout(this._t); } catch { } this._t = null; }
		if (this._n && typeof this._n.hide === "function") { try { this._n.hide(); } catch { } }
		try { this._n = new Notice(String(message || ""), 0); } catch { this._n = null; }
		// ensure this instance remains tracked globally
		Noticer._all.add(this);
		if (ms > 0) this._t = setTimeout(() => { try { this.dispose(); } catch { } }, ms);
		return this;
	}
	/**
	 * Hide and dispose this Notice instance.
	 * @returns {this}
	 */
	dispose() {
		if (this._t) { try { clearTimeout(this._t); } catch { }; this._t = null; }
		if (this._n && typeof this._n.hide === "function") { try { this._n.hide(); } catch { } }
		this._n = null;
		Noticer._all.delete(this);
		return this;
	}
	/** @returns {boolean} Whether a Notice is currently visible. */
	isActive() { return !!this._n; }
	/** @returns {Noticer[]} Snapshot of all active Noticer instances. */
	static getNoticers() { return Array.from(Noticer._all); }
	/** Dispose all active Noticer instances. */
	static disposeAll() { for (const n of Array.from(Noticer._all)) { try { n.dispose(); } catch { } } }
}
Noticer._all = new Set();


/**
 * Obsidian plugin that generates nested CSS selectors for a clicked element.
 * Ctrl/Cmd+Middle opens the CSS menu; Ctrl/Cmd+Shift+Middle opens the path menu.
 */
module.exports = class ElementSnatchCssPlugin extends Plugin {
	/** @type {Set<Noticer>} */
	_noticers = new Set();
	/** @type {boolean} */
	_debug = false;
	/** Plugin entry point: bind mouse handler and register DOM event. */
	onload() {
		this._debug = false; // set to true in dev console to enable verbose logging
		this._onMouseDown = this._onMouseDown.bind(this);
		this.registerDomEvent(document, "mousedown", this._onMouseDown, { capture: true });
		if (this._debug) console.log("[element-snatch-css] loaded");
	}

	/** Plugin teardown: dispose notices and highlighter. */
	onunload() {
		try { Noticer.disposeAll(); } catch (e) { if (this._debug) console.error(e); }
		if (this._debug) console.log("[element-snatch-css] unloaded");
		this._disposeHighlighter();
	}

	// Handle Ctrl + Middle click
	/**
	 * Handle Ctrl/Cmd + Middle mouse clicks to open menus.
	 * - Ctrl/Cmd + Middle: CSS menu
	 * - Ctrl/Cmd + Shift + Middle: Path menu
	 * @param {MouseEvent} e
	 */
	_onMouseDown(e) {
		if (this._debug) console.log("[element-snatch-css] mousedown", e);
		try {
			const isMiddle = e.button === 1;
			if (isMiddle && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
				if (this._debug) console.log("[element-snatch-css] mousedown OK _openMenuForCss", e);
				e.preventDefault();
				e.stopPropagation();
				// [ts] Property 'closest' does not exist on type 'EventTarget'.
				const target = (e.target instanceof Element ? (e.target.closest("*") || e.target) : document.body);
				this._openMenuForCss(target, e, target);
			}
			if (isMiddle && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
				if (this._debug) console.log("[element-snatch-css] mousedown OK _openMenuForPath", e);
				e.preventDefault();
				e.stopPropagation();
				const target = (e.target instanceof Element ? (e.target.closest("*") || e.target) : document.body);
				this._openMenuForPath(target, e, target);
			}

		} catch (err) {
			console.error("[element-snatch-css] onMouseDown error:", err);
		}
	}

	// Build ancestry array body -> ... -> node
	/**
	 * Build ancestors from stopAt (inclusive) down to node (inclusive).
	 * @param {Element} node
	 * @param {Element} [stopAt=document.body]
	 * @returns {Element[]}
	 */
	_buildAncestry(node, stopAt = document.body) {
		const chain = [];
		let cur = node;
		let guard = 0;
		while (cur && cur.nodeType === 1 && guard++ < 2000) {
			chain.push(cur);
			if (cur === stopAt || !cur.parentElement) break;
			cur = cur.parentElement;
		}
		chain.reverse(); // body first
		return chain;
	}

	// Human-readable label: tag#id.class1.class2 [+N]
	/**
	 * Build a compact human-readable label for a node (e.g., tag#id.cls1.cls2 [+N]).
	 * @param {Element} node
	 * @param {number} [maxClasses=3]
	 * @param {boolean} [includeTag=true]
	 * @returns {string}
	 */
	_labelFor(node, maxClasses = 3, includeTag = true) {
		const tag = includeTag ? node.tagName.toLowerCase() : "";
		const id = node.id ? "#" + node.id : "";
		const classes = node.classList ? Array.from(node.classList).filter(Boolean) : [];
		const shown = classes.slice(0, maxClasses);
		const extra = classes.length - shown.length;
		const cls = shown.length ? "." + shown.join(".") : "";
		const more = extra > 0 ? " [+" + extra + "]" : "";
		const base = (tag + id + cls) || node.tagName.toLowerCase();
		return base + more;
	}

	/**
	 * Ensure a singleton <style> for highlighter animations is present.
	 * Contains a hue-rotate keyframes animation.
	 */
	_ensureHighlighterStyle() {
		// Prefer reusing an existing style element by id to avoid duplicates across reloads
		const existing = document.getElementById("esc-hi-style");
		if (existing) { this._hiStyle = existing; return; }
		if (this._hiStyle && document.head.contains(this._hiStyle)) return;
		const style = document.createElement("style");
		style.id = "esc-hi-style";
		style.textContent = [
			"@property --escHue {",
			"  syntax: '<number>';",
			"  inherits: false;",
			"  initial-value: 0;",
			"}",
			"@keyframes escHueAnim {",
			"  from { --escHue: 0; }",
			"  to   { --escHue: 360; }",
			"}"
		].join("\n");
		document.head.appendChild(style);
		this._hiStyle = style;
	}

	/**
	 * Create (or return) the singleton highlighter div.
	 * The highlighter is positioned using getBoundingClientRect() and uses
	 * transitions for motion with ease-in-out.
	 */
	_ensureHighlighter() {
		if (this._hiDiv && document.body.contains(this._hiDiv)) return this._hiDiv;
		this._ensureHighlighterStyle();
		const d = document.createElement("div");
		d.id = "esc-hi";
		d.setAttribute("aria-hidden", "true");
		d.style.position = "fixed";
		d.style.pointerEvents = "none";
		d.style.zIndex = "999999";
		d.style.border = "2px dotted";
		d.style.borderColor = "hsl(" + ("var(--escHue)") + ", 85%, 55%)";
		d.style.background = "rgba(0,0,0,0.18)";
		d.style.borderRadius = "4px";
		d.style.transition = "top 140ms ease-in-out, left 140ms ease-in-out, width 140ms ease-in-out, height 140ms ease-in-out, background-color 140ms ease-in-out, border-color 140ms ease-in-out";
		d.style.animation = "escHueAnim 8s linear infinite";
		d.style.boxSizing = "border-box";
		d.style.display = "none";
		document.body.appendChild(d);
		this._hiDiv = d;
		return d;
	}

	/**
	 * Position and show the highlighter over a given element.
	 * @param {Element} el
	 */
	_placeHighlighter(el) {
		const d = this._ensureHighlighter();
		try {
			const r = el.getBoundingClientRect();
			d.style.display = "block";
			d.style.top = Math.max(0, r.top - 2) + "px";
			d.style.left = Math.max(0, r.left - 2) + "px";
			d.style.width = Math.max(0, r.width + 4) + "px";
			d.style.height = Math.max(0, r.height + 4) + "px";
			this._hiTarget = el;
		} catch (e) { if (this._debug) console.error(e); }
	}

	/**
	 * Remove and dispose of the highlighter and style.
	 * Used when the menu closes.
	 */
	_disposeHighlighter() {
		if (this._hiDiv) {
			try { this._hiDiv.remove(); } catch (e) { if (this._debug) console.error(e); }
			this._hiDiv = null;
		}
		if (this._hiStyle) {
			try { this._hiStyle.remove(); } catch (e) { if (this._debug) console.error(e); }
			this._hiStyle = null;
		}
		this._hiTarget = null;
	}


	// Apply or remove highlight on a DOM element
	/**
	 * Toggle the overlay highlighter and optional contrast bump on a target element.
	 * @param {Element} el
	 * @param {boolean} on
	 */
	_highlight(el, on) {
		// Overlay-based highlighter: reuse a singleton DIV instead of mutating target styles.
		if (!el || el.nodeType !== 1) return;
		if (on) {
			this._placeHighlighter(el);
			// boost contrast on the element (store previous filter)
			if (!Object.prototype.hasOwnProperty.call(el, "__esc_prevFilter")) {
				el.__esc_prevFilter = el.style.filter || "";
			}
			try {
				const cur = el.style.filter || "";
				if (!/contrast\(/.test(cur)) {
					el.style.filter = (cur ? cur + " " : "") + "contrast(1.25)";
				}
			} catch (e) { if (this._debug) console.error(e); }
		} else {
			// Only hide overlay if turning off the element we currently cover
			if (this._hiTarget === el) {
				if (this._hiDiv) this._hiDiv.style.display = "none";
				this._hiTarget = null;
			}
			// restore contrast
			if (Object.prototype.hasOwnProperty.call(el, "__esc_prevFilter")) {
				el.style.filter = el.__esc_prevFilter;
				delete el.__esc_prevFilter;
			}
		}

	}

	// Show Menu at mouse position with body at top and target at bottom
	/**
	 * Show ancestor menu that copies nested CSS for the chosen ancestor subtree.
	 * @param {Element} targetEl
	 * @param {MouseEvent} mouseEvt
	 * @param {Element} originalTargetEl
	 */
	_openMenuForCss(targetEl, mouseEvt, originalTargetEl) {
		const chain = this._buildAncestry(targetEl, document.body);
		if (!chain.length) return;

		const menu = new Menu();
		// Title label (enabled no-op so themes can't hide it)
		/** @param {import("obsidian").MenuItem} item */
		menu.addItem((item) => {
			try {
				item.setTitle("📸 CSS menu (Ctrl+Middle)");
				item.setIcon("code");
			} catch (err) {
				console.error("[element-snatch-css] addItem failed", err);
			}
		});
		const clearAll = () => { chain.forEach((n) => this._highlight(n, false)); this._disposeHighlighter(); };

		// Ancestors
		for (const el of chain) {
			menu.addItem((item) => {
				try {
					const label = this._labelFor(el, 3, true);
					item.setTitle(label);
					item.setIcon?.("chevrons-right");

					// Safe tooltip build
					let tip = "";
					try {
						const _pathsForTip = this._buildPathsBetween(el, originalTargetEl, { includeNthChild: false });
						tip = _pathsForTip.child.replace(/\s+/g, ' ').replace(/>/g, '\n>').trim();
					} catch (e) {
						if (this._debug) console.warn("[element-snatch-css] tooltip build failed", e);
					}

					item.onClick(async () => {
						clearAll();
						await this._css(el, {
							includeNthChild: false,
							indent: "\t",
							maxDepth: Infinity,
							maxNodes: 5000
						});
					});

					// @ts-ignore
					const dom = item.dom; // || item.domEl || item._dom || item.buttonEl || item.containerEl;
					if (dom) {
						if (tip) dom.setAttribute("title", tip);
						dom.addEventListener("mouseenter", () => this._highlight(el, true));
						dom.addEventListener("mouseleave", () => this._highlight(el, false));
					}
				} catch (err) {
					console.error("[element-snatch-css] addItem failed", err);
					// Fallback: show *something* so the menu isn't empty
					item.setTitle(this._labelFor(el, 1, true));
				}
			});
		}

		if (typeof menu.showAtMouseEvent === "function") {
			menu.showAtMouseEvent(mouseEvt);
		} else if (typeof menu.showAtPosition === "function") {
			menu.showAtPosition({ x: mouseEvt.clientX, y: mouseEvt.clientY });
		} else {
			menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
		}

		// Cleanup highlights when the menu disappears
		setTimeout(() => {
			const menuEl = document.querySelector(".menu");
			if (!menuEl) return;
			const obs = new MutationObserver(() => {
				if (!document.body.contains(menuEl)) {
					try { obs.disconnect(); } catch (e) { if (this._debug) console.error(e); }
					clearAll();
				}
			});
			obs.observe(document.body, { childList: true, subtree: true });
		}, 0);
	}

	// Build two selector strings between ancestorEl (inclusive) and targetEl (inclusive).
	/**
	 * Build descendant and child selector strings between ancestorEl and targetEl.
	 * @param {Element} ancestorEl
	 * @param {Element} targetEl
	 * @param {{includeNthChild?: boolean}} [options]
	 * @returns {{descendant: string, child: string}}
	 */
	_buildPathsBetween(ancestorEl, targetEl, options) {
		if (this._debug) console.log("[element-snatch-css] _buildPathsBetween2", ancestorEl, targetEl, options);
		const opts = Object.assign({ includeNthChild: false }, options || {});
		if (!ancestorEl || !targetEl) return { descendant: "", child: "" };
		// Walk up from target to ancestor
		const chain = [];
		let cur = targetEl;
		let guard = 0;
		while (cur && cur.nodeType === 1 && guard++ < 5000) {
			chain.push(cur);
			if (cur === ancestorEl) break;
			cur = cur.parentElement;
		}
		if (chain[chain.length - 1] !== ancestorEl) {
			// ancestorEl is not actually an ancestor; rebuild using ancestry from <body>
			const bodyChain = this._buildAncestry(targetEl, document.body); // body -> ... -> target
			const idx = bodyChain.indexOf(ancestorEl);
			if (idx >= 0) {
				// use slice from ancestor to target; keep local order consistent before final reverse
				const slice = bodyChain.slice(idx); // ancestor -> ... -> target
				chain.length = 0;
				for (let i = slice.length - 1; i >= 0; i--) chain.push(slice[i]); // target -> ... -> ancestor
			} else {
				// fallback to just target
				chain.length = 0;
				chain.push(targetEl);
			}
		}
		chain.reverse(); // ancestor -> ... -> target
		const sels = chain.map((n) => this._selectorFor(n, {
			useIds: true,
			useClasses: true,
			includeTagIfNoClasses: true,
			includeNthChild: !!opts.includeNthChild
		}));
		return {
			descendant: sels.join(" "),
			child: sels.join(" > ")
		};
	}

	// Show ancestor menu for PATH copying (between chosen ancestor and originalTargetEl)
	/**
	 * Show ancestor menu that copies selector paths (descendant and child forms).
	 * @param {Element} targetEl
	 * @param {MouseEvent} mouseEvt
	 * @param {Element} originalTargetEl
	 */
	_openMenuForPath(targetEl, mouseEvt, originalTargetEl) {
		const chain = this._buildAncestry(targetEl, document.body);
		if (!chain.length) return;

		const menu = new Menu();
		// Title label (enabled no-op so themes don't hide disabled items)
		menu.addItem((item) => {
			item.setTitle("🛣️ Path menu (Ctrl+Shift+Middle)");
			//item.setIcon("path");
			//item.setDisabled(true);
			// const _dom = item.dom || item.domEl || item._dom || item.buttonEl || item.containerEl;
			// if (_dom) { _dom.classList.add('esc-menu-title'); _dom.setAttribute('aria-disabled','true'); }
		});
		const clearAll = () => { chain.forEach((n) => this._highlight(n, false)); this._disposeHighlighter(); };

		for (const el of chain) {
			const label = this._labelFor(el, 3, true);
			menu.addItem((item) => {
				item.setTitle(label);
				item.setIcon("chevrons-right");
				item.onClick(async () => {
					clearAll();
					const paths = this._buildPathsBetween(el, originalTargetEl, { includeNthChild: false });
					const text = paths.descendant + '\n' + paths.child + '\n';
					const ok = await this._copyText(text);
					try { this._withNotice(ok ? "Path copied" : "Copy failed", ok ? 5000 : 10000); } catch (e) { if (this._debug) console.error(e); }
					if (!ok && this._debug) console.log(text);
				});

				// @ts-ignore
				const dom = item?.dom; // || item.domEl || item._dom || item.buttonEl || item.containerEl;
				if (dom) {
					const _pathsForTip = this._buildPathsBetween(el, originalTargetEl, { includeNthChild: false });
					const desc = _pathsForTip.descendant.replace(/\s+/g, ' ').replace(/ /g, ' \n').trim();
					const child = _pathsForTip.child.replace(/\s+/g, ' ').replace(/ >/g, ' \n>').trim();
					dom.setAttribute("title", ("== CSS SELECTORS ==\n\nDescendant form:\n" + desc + "\n\n" + "Child form:\n" + child));
					dom.addEventListener("mouseenter", () => this._highlight(el, true));
					dom.addEventListener("mouseleave", () => this._highlight(el, false));
				}
			});
		}

		if (typeof menu.showAtMouseEvent === "function") {
			menu.showAtMouseEvent(mouseEvt);
		} else if (typeof menu.showAtPosition === "function") {
			menu.showAtPosition({ x: mouseEvt.clientX, y: mouseEvt.clientY });
		} else {
			menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
		}

		// Cleanup highlights when the menu disappears
		setTimeout(() => {
			const menuEl = document.querySelector(".menu");
			if (!menuEl) return;
			const obs = new MutationObserver(() => {
				if (!document.body.contains(menuEl)) {
					try { obs.disconnect(); } catch (e) { if (this._debug) console.error(e); }
					clearAll();
				}
			});
			obs.observe(document.body, { childList: true, subtree: true });
		}, 0);
	}

	// Copy helper: Electron first, then modern Web Clipboard API
	/**
	 * Copy text to the clipboard using Electron when available, falling back to the Web Clipboard API.
	 * @param {string} s
	 * @returns {Promise<boolean>} Whether the copy succeeded.
	 */
	async _copyText(s) {
		const text = String(s == null ? "" : s);
		try {
			const { clipboard } = Electron;
			if (clipboard && typeof clipboard.writeText === "function") {
				clipboard.writeText(text);
				return true;
			}
		} catch (e) { if (this._debug) console.error(e); }
		try {
			if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
				await navigator.clipboard.writeText(text);
				return true;
			}
		} catch (e) { if (this._debug) console.error(e); }
		return false;
	}

	// CSS.escape with basic fallback
	/**
	 * Escape an arbitrary string for safe use in a CSS selector.
	 * @param {string} str
	 * @returns {string}
	 */
	_cssEscape(str) {
		if (window.CSS && typeof window.CSS.escape === "function") return CSS.escape(str);
		return String(str).replace(/[^a-zA-Z0-9_-]/g, function (c) {
			return "\\" + c.charCodeAt(0).toString(16) + " ";
		});
	}

	// Choose a selector for a node
	/**
	 * Build a selector for a node using id, classes, tag, and optional :nth-child.
	 * @param {Element} node
	 * @param {{useIds?: boolean, useClasses?: boolean, includeTagIfNoClasses?: boolean, includeNthChild?: boolean}} opts
	 * @returns {string}
	 */
	_selectorFor(node, opts) {
		if (opts.useIds && node.id) return "#" + this._cssEscape(node.id);

		if (opts.useClasses && node.classList && node.classList.length) {
			const classes = Array.from(node.classList).filter(Boolean).map((c) => this._cssEscape(c));
			if (classes.length) return "." + classes.join(".");
		}

		let sel = opts.includeTagIfNoClasses ? node.tagName.toLowerCase() : "*";

		if (opts.includeNthChild) {
			const parent = node.parentElement;
			if (parent) {
				let i = 1, sib = node;
				while ((sib = sib.previousElementSibling)) i++;
				sel += ":nth-child(" + i + ")";
			}
		}
		return sel;
	}

	/**
	 * Build a nested CSS tree starting at root and including all descendants.
	 * For each level, emit two content lines:
	 *  - descendant path: "A B C"
	 *  - child path:      "A > B > C"
	 * Copies the result to clipboard, shows a Notice, and returns the text.
	 */

	async _css(root, options) {
		const opts = Object.assign({
			useIds: true,
			useClasses: true,
			includeTagIfNoClasses: true,
			includeNthChild: false,
			indent: "  ",
			maxDepth: Infinity,
			maxNodes: 5000,
			skipTags: new Set(["SCRIPT", "STYLE", "TEMPLATE"])
		}, options || {});

		if (!root || root.nodeType !== 1) {
			console.warn("[element-snatch-css] _css called without a valid element");
			return "";
		}

		let nodeCount = 0;
		let truncated = false;

		const selectorFor = (n) => this._selectorFor(n, opts);

		/**
		 * Collect direct text nodes, normalize+trim, cut to <= 50 chars, and escape quotes/backslashes.
		 * Returns an array of strings (possibly empty).
		 */
		const textContentsFor = (node) => {
			const out = [];
			for (const ch of node.childNodes) {
				if (ch.nodeType === Node.TEXT_NODE) {
					let s = ch.nodeValue || "";
					s = s.replace(/\s+/g, " ").trim();
					if (!s) continue;
					if (s.length > 50) s = s.slice(0, 47) + "...";
					s = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
					out.push(s);
				}
			}
			return out;
		};
		/**
		 * Return the first non-empty trimmed/escaped text node content (<=50 chars) for a node.
		 */
		const primaryTextFor = (node) => {
			for (const ch of node.childNodes) {
				if (ch.nodeType === Node.TEXT_NODE) {
					let s = ch.nodeValue || "";
					s = s.replace(/\s+/g, " ").trim();
					if (!s) continue;
					if (s.length > 50) s = s.slice(0, 47) + "...";
					s = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
					return s;
				}
			}
			return "";
		};

		/**
		 * Render a node and descendants to a *canonical* string used for dedupe (structure-only).
		 * Excludes text-node content lines on purpose.
		 */
		const renderCanonical = (node, depth, pathSelectors) => {
			if (depth > opts.maxDepth) return "";
			if (++nodeCount > opts.maxNodes) { truncated = true; return ""; }

			const curSel = pathSelectors[pathSelectors.length - 1];
			let block = "";
			block += opts.indent.repeat(depth) + curSel + "{\n";

			// First two content lines only
			const descPath = pathSelectors.join(" ");
			const childPath = pathSelectors.join(" > ");
			block += opts.indent.repeat(depth + 1) + 'content: "' + descPath + '";\n';
			block += opts.indent.repeat(depth + 1) + 'content: "' + childPath + '";\n';

			// Children (canonical)
			const childTexts = [];
			for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
				if (opts.skipTags && opts.skipTags.has(child.tagName)) continue;
				const childSel = selectorFor(child);
				const c = renderCanonical(child, depth + 1, pathSelectors.concat(childSel));
				if (truncated) break;
				if (c) childTexts.push(c);
			}

			// Append children in order
			for (const t of childTexts) block += t;

			block += opts.indent.repeat(depth) + "}\n";
			return block;
		};

		/**
		 * Render a node and descendants to the *final* string (includes text-node content lines).
		 * Uses dedupe across siblings based on canonical strings.
		 */
		const renderFinal = (node, depth, pathSelectors, overrideTexts) => {
			if (depth > opts.maxDepth) return "";
			// Note: do not increment nodeCount again here; renderCanonical already accounts during grouping
			const curSel = pathSelectors[pathSelectors.length - 1];

			let block = "";
			block += opts.indent.repeat(depth) + curSel + " {\n";

			// First two content lines
			const descPath = pathSelectors.join(" ");
			const childPath = pathSelectors.join(" > ");
			block += opts.indent.repeat(depth + 1) + 'content: "' + descPath + '";\n';
			block += opts.indent.repeat(depth + 1) + 'content: "' + childPath + '";\n';

			// Text-node content lines
			const texts = (overrideTexts && Array.isArray(overrideTexts) && overrideTexts.length)
				? overrideTexts
				: textContentsFor(node);
			if (texts.length === 0) {
				block += opts.indent.repeat(depth + 1) + 'content: "";\n';
			} else {
				for (const s of texts) {
					block += opts.indent.repeat(depth + 1) + 'content: "' + s + '";\n';
				}
			}

			// Prepare children: compute canonical strings for grouping, and final strings for output
			const items = [];
			const canon = [];
			for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
				if (opts.skipTags && opts.skipTags.has(child.tagName)) continue;
				const childSel = selectorFor(child);
				const cStr = renderCanonical(child, depth + 1, pathSelectors.concat(childSel));
				if (truncated) break;
				if (!cStr) continue;
				canon.push(cStr);
				items.push({ child, sel: childSel });
			}

			// Group by canonical string (stable order by first occurrence)
			const idxByCanon = new Map();
			const groups = [];
			for (let i = 0; i < canon.length; i++) {
				const key = canon[i];
				if (!idxByCanon.has(key)) {
					idxByCanon.set(key, groups.length);
					groups.push({ key, indexList: [i] });
				} else {
					groups[idxByCanon.get(key)].indexList.push(i);
				}
			}

			// Emit one final block per group; annotate count if > 1
			for (const g of groups) {
				const repIndex = g.indexList[0];
				const count = g.indexList.length;
				const child = items[repIndex].child;
				const childSel = items[repIndex].sel;
				// Build override texts when collapsing duplicates: one text per occurrence
				let childOverrideTexts = null;
				if (count > 1) {
					childOverrideTexts = g.indexList.map((idx) => {
						const nd = items[idx].child;
						const t = primaryTextFor(nd);
						return t || "";
					});
				}
				let childFinal = renderFinal(child, depth + 1, pathSelectors.concat(childSel), childOverrideTexts);
				if (count > 1) {
					childFinal = childFinal.replace(/\{/, "{ /** " + count + " times */");
				}
				block += childFinal;
			}

			// Close current block
			block += opts.indent.repeat(depth) + "}\n";
			return block;
		};

		// Kick off
		const rootSel = selectorFor(root);
		let out = renderFinal(root, 0, [rootSel]);

		if (truncated) out += "/* truncated: reached maxNodes limit */\n";

		const ok = await this._copyText(out);
		try { this._withNotice(ok ? "Nested CSS copied" : "Copy failed", ok ? 5000 : 10000); } catch (e) { if (this._debug) console.error(e); }
		if (!ok && this._debug) console.log(out);
		return out;
	}


	/**
	 * Show a timed Notice via a fresh Noticer instance and register it in the plugin set.
	 */
	_withNotice(message, timeoutMs) {
		const n = new Noticer().show(message, timeoutMs);
		this._noticers.add(n);
		// when it disposes, remove from set (best-effort via timeout)
		setTimeout(() => { this._noticers.delete(n); }, (Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs | 0) : 3000) + 1000);
		return n;
	}
};