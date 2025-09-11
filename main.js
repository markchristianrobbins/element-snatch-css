/**
 * Element Snatch CSS
 * Ctrl + Middle-click opens a Menu listing ancestors from <body> down to the clicked element.
 * Hovering a menu item highlights its element. Clicking generates nested CSS from that element
 * (including all descendants) and copies it to the clipboard..
 *
 * No execCommand fallback is used for clipboard.
 */

const { Plugin, Menu, Notice } = require("obsidian");

module.exports = class ElementSnatchCssPlugin extends Plugin {
	onload() {
		this._onMouseDown = this._onMouseDown.bind(this);
		this.registerDomEvent(document, "mousedown", this._onMouseDown, { capture: true });
		console.log("[element-snatch-css] loaded");
	}

	onunload() {
		console.log("[element-snatch-css] unloaded");
	}

	// Handle Ctrl + Middle click
	_onMouseDown(e) {
		try {
			const isMiddle = e.button === 1;
			const wantMod = e.ctrlKey || e.metaKey;
			if (isMiddle && e.ctrlKey && !e.altKey && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				const target = (e.target && e.target.closest && e.target.closest("*")) || e.target || document.body;
				this._openMenuFor(target, e);
			}

		} catch (err) {
			console.error("[element-snatch-css] onMouseDown error:", err);
		}
	}

	// Build ancestry array body -> ... -> node
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

	// Apply or remove highlight on a DOM element
	_highlight(el, on) {
		if (!el || el.nodeType !== 1) return;
		if (on) {
			if (!Object.prototype.hasOwnProperty.call(el, "__esc_prevBoxShadow")) {
				el.__esc_prevBoxShadow = el.style.boxShadow || "";
			}
			el.style.boxShadow = "inset 0 0 0 2px var(--interactive-accent)";
		} else {
			if (Object.prototype.hasOwnProperty.call(el, "__esc_prevBoxShadow")) {
				el.style.boxShadow = el.__esc_prevBoxShadow;
				delete el.__esc_prevBoxShadow;
			}
		}
	}

	// Show Menu at mouse position with body at top and target at bottom
	_openMenuFor(targetEl, mouseEvt) {
		const chain = this._buildAncestry(targetEl, document.body);
		if (!chain.length) return;

		const menu = new Menu(this.app);

		const clearAll = () => chain.forEach((n) => this._highlight(n, false));

		for (const el of chain) {
			const label = this._labelFor(el, 3, true);
			menu.addItem((item) => {
				item.setTitle(label);
				item.setIcon("chevrons-right");
				item.onClick(async () => {
					clearAll();
					await this._css(el, {
						includeNthChild: false,
						indent: "  ",
						maxDepth: Infinity,
						maxNodes: 5000
					});
				});

				const dom = item.dom || item.domEl || item._dom || item.buttonEl || item.containerEl;
				if (dom) {
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
					try { obs.disconnect(); } catch { }
					clearAll();
				}
			});
			obs.observe(document.body, { childList: true, subtree: true });
		}, 0);
	}

	// Copy helper: Electron first, then modern Web Clipboard API
	async _copyText(s) {
		const text = String(s == null ? "" : s);
		try {
			const { clipboard } = require("electron");
			if (clipboard && typeof clipboard.writeText === "function") {
				clipboard.writeText(text);
				return true;
			}
		} catch { }
		try {
			if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
				await navigator.clipboard.writeText(text);
				return true;
			}
		} catch { }
		return false;
	}

	// CSS.escape with basic fallback
	_cssEscape(str) {
		if (window.CSS && typeof window.CSS.escape === "function") return CSS.escape(str);
		return String(str).replace(/[^a-zA-Z0-9_-]/g, function (c) {
			return "\\" + c.charCodeAt(0).toString(16) + " ";
		});
	}

	// Choose a selector for a node
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

		let out = "";
		let nodeCount = 0;
		let truncated = false;

		const selectorFor = (n) => this._selectorFor(n, opts);

		/**
		 * @param {Element} node
		 * @param {number} depth
		 * @param {string[]} pathSelectors - selectors from root -> this node
		 */
		const walk = (node, depth, pathSelectors) => {
			if (depth > opts.maxDepth) return;
			if (++nodeCount > opts.maxNodes) { truncated = true; return; }

			const curSel = pathSelectors[pathSelectors.length - 1];

			// Open current block with the short selector (nested style)
			out += opts.indent.repeat(depth) + curSel + " {\n";

			// Emit content lines for both descendant and child chains
			const descPath = pathSelectors.join(" ");
			const childPath = pathSelectors.join(" > ");
			out += opts.indent.repeat(depth + 1) + 'content: "' + descPath + '";\n';
			out += opts.indent.repeat(depth + 1) + 'content: "' + childPath + '";\n';

			// Recurse into element children
			for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
				if (opts.skipTags && opts.skipTags.has(child.tagName)) continue;
				const childSel = selectorFor(child);
				walk(child, depth + 1, pathSelectors.concat(childSel));
				if (truncated) break;
			}

			// Close block
			out += opts.indent.repeat(depth) + "}\n";
		};

		// Kick off from root
		const rootSel = selectorFor(root);
		walk(root, 0, [rootSel]);

		if (truncated) out += "/* truncated: reached maxNodes limit */\n";

		const ok = await this._copyText(out);
		try { new Notice(ok ? "Nested CSS copied" : "Copy failed", ok ? 1200 : 2000); } catch { }
		if (!ok) console.log(out);
		return out;
	}

	/**
	 * Build a nested CSS tree starting at root and including all descendants.
	 * Copies the result to clipboard, shows a Notice, and returns the text.
	 */
	async _css_(root, options) {
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

		let out = "";
		let nodeCount = 0;
		let truncated = false;

		const walk = (node, depth) => {
			if (depth > opts.maxDepth) return;
			if (++nodeCount > opts.maxNodes) { truncated = true; return; }

			out += opts.indent.repeat(depth) + this._selectorFor(node, opts) + " {\n";
			for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
				if (opts.skipTags && opts.skipTags.has(child.tagName)) continue;
				walk(child, depth + 1);
				if (truncated) break;
			}
			out += opts.indent.repeat(depth) + "}\n";
		};

		walk(root, 0);
		if (truncated) out += "/* truncated: reached maxNodes limit */\n";

		const ok = await this._copyText(out);
		try { new Notice(ok ? "Nested CSS copied" : "Copy failed", ok ? 1200 : 2000); } catch { }
		if (!ok) console.log(out);
		return out;
	}
};
