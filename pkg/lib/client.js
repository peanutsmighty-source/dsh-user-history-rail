// dsh-user-history-rail — browser half (prebuilt bundle, hand-written).
// Pure client, snapshot-driven. One additive slot entry:
//   - conversation.session.header.utilities: the right-edge history fence rail.
// Jump strategy: query the product's own `data-chat-anchor-key` element; if the
// target is not rendered yet, progressively load older history (session
// loadOlder, bounded) and retry; finally fall back to the nearest rendered
// message. List and jump targets share one source of truth (the chat snapshot).
window.__ModuleLoader__.load({
	id: "dsh-user-history-rail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");

		var sessionsService = null; // captured in apply

		// ---- text extraction ----
		function extractText(blocks) {
			if (!Array.isArray(blocks)) return "";
			var out = "";
			for (var i = 0; i < blocks.length; i++) {
				var block = blocks[i];
				if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string" && block.text) {
					out += (out ? "\n" : "") + block.text;
				}
			}
			return out.trim();
		}

		function extractAssistantText(blocks) {
			if (!Array.isArray(blocks)) return "";
			var out = "";
			for (var i = 0; i < blocks.length; i++) {
				var block = blocks[i];
				if (block && typeof block === "object" && block.kind === "text" && typeof block.text === "string" && block.text) {
					out += (out ? "\n" : "") + block.text;
				}
			}
			return out.trim();
		}

		// ---- derive user inputs + following visible answer + node key from the chat snapshot ----
		function deriveItems(snapshot) {
			if (!snapshot || !snapshot.chat || !snapshot.chat.order || !snapshot.chat.nodes) return [];
			var order = snapshot.chat.order;
			var nodes = snapshot.chat.nodes;
			var items = [];
			var pending = [];
			for (var k = 0; k < order.length; k++) {
				var key = order[k];
				var node = null;
				try { node = nodes.get(key); } catch (e) { node = null; }
				if (!node) continue;
				if (node.kind === "user" || node.kind === "steering") {
					var data = node.data;
					var text = data && Array.isArray(data.content) ? extractText(data.content) : "";
					if (text && typeof node.anchorSeq === "number") {
						var item = {
							seq: node.anchorSeq,
							time: data && typeof data.time === "number" ? data.time : 0,
							text: text,
							answer: "",
							key: key
						};
						items.push(item);
						pending.push(item);
					}
					continue;
				}
				if (pending.length === 0) continue;
				if (node.kind === "assistant-step") {
					var d = node.data;
					var answer = d && Array.isArray(d.blocks) ? extractAssistantText(d.blocks) : "";
					if (answer) {
						if (answer.length > 200) answer = answer.slice(0, 200);
						for (var p = 0; p < pending.length; p++) {
							if (!pending[p].answer) pending[p].answer = answer;
						}
						pending = [];
					}
				}
			}
			return items;
		}

		function formatTime(ms) {
			try {
				return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			} catch (e) {
				return String(ms);
			}
		}

		// ---- right-edge fence rail (session scope: header utilities) ----
		function Rail(props) {
			var snapshot = props.useSession ? props.useSession(function (s) { return s; }) : undefined;
			var items = react.useMemo(function () { return deriveItems(snapshot); }, [snapshot]);
			var sessionId = props.sessionId;
			var hoverSeqState = react.useState(null);
			var hoverSeq = hoverSeqState[0];
			var setHoverSeq = hoverSeqState[1];

			var latestItemsRef = react.useRef(items);
			latestItemsRef.current = items;
			var latestSnapshotRef = react.useRef(snapshot);
			latestSnapshotRef.current = snapshot;

			function findEl(key) {
				if (!key) return null;
				try {
					return document.querySelector('[data-chat-anchor-key="' + String(key).replace(/["\\]/g, "") + '"]');
				} catch (e) { return null; }
			}

			function scrollTo(el) {
				try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {
					try { el.scrollIntoView(true); } catch (e2) {}
				}
			}

			function fallbackNearest(item) {
				var list = latestItemsRef.current || [];
				var best = null, bestDiff = Infinity;
				for (var i = 0; i < list.length; i++) {
					var diff = Math.abs(list[i].seq - item.seq);
					if (diff < bestDiff) { bestDiff = diff; best = list[i]; }
				}
				if (best && best.key) {
					var el = findEl(best.key);
					if (el) { scrollTo(el); console.log("[uhm] fallback to nearest rendered seq", best.seq); return; }
				}
				console.log("[uhm] no fallback target for seq", item && item.seq);
			}

			function loadAndJump(item, tries) {
				if (tries >= 5) { fallbackNearest(item); return; }
				var snap = latestSnapshotRef.current;
				if (!snap || !snap.hasMore) { fallbackNearest(item); return; }
				if (!sessionsService || !sessionId) { fallbackNearest(item); return; }
				var binding = null;
				try { binding = sessionsService.binding(sessionId); } catch (e) { binding = null; }
				if (!binding || !binding.session || typeof binding.session.loadOlder !== "function") { fallbackNearest(item); return; }
				binding.session.loadOlder().then(function () {
					setTimeout(function () {
						var el = findEl(item.key);
						if (el) { scrollTo(el); console.log("[uhm] jumped after loading older, tries", tries); }
						else { loadAndJump(item, tries + 1); }
					}, 450);
				}).catch(function () { fallbackNearest(item); });
			}

			function jumpToSeq(item) {
				if (!item) return;
				var el = findEl(item.key);
				if (el) { scrollTo(el); return; }
				loadAndJump(item, 0);
			}

			var hoveredItem = items.length === 0 ? null : items.find(function (it) { return it.seq === hoverSeq; }) || null;

			var preview = hoveredItem
				? react.createElement("div", { className: "uhm-tip" },
						react.createElement("div", { className: "uhm-tip-time" }, formatTime(hoveredItem.time)),
						react.createElement("div", { className: "uhm-tip-text" }, hoveredItem.text),
						hoveredItem.answer
							? react.createElement("div", { className: "uhm-tip-answer" }, hoveredItem.answer)
							: null
					)
				: null;

			var ticks = items.map(function (item) {
				var active = item.seq === hoverSeq;
				return react.createElement("div", {
					key: item.seq,
					className: active ? "uhm-tick uhm-tick-active" : "uhm-tick",
					onClick: function () { jumpToSeq(item); setHoverSeq(null); }
				},
					react.createElement("div", { className: "uhm-tick-bar" })
				);
			});

			var onStripMove = function (e) {
				var strip = e.currentTarget;
				var rect = strip.getBoundingClientRect();
				var y = e.clientY - rect.top;
				var index = Math.floor(y / (rect.height / items.length));
				if (index < 0) index = 0;
				if (index >= items.length) index = items.length - 1;
				var it = items[index];
				if (it && it.seq !== hoverSeq) setHoverSeq(it.seq);
			};
			var clearHover = function () { setHoverSeq(null); };

			return react.createElement("div", {
				className: "uhm-wrap",
				onMouseLeave: clearHover
			},
				preview,
				react.createElement("div", { className: "uhm-strip", onMouseMove: onStripMove }, ticks)
			);
		}

		// ---- apply ----
		var STYLE_ID = "dsh-user-history-rail";
		var CSS = [
			"@keyframes uhmFade{from{opacity:0}to{opacity:1}}",
			".uhm-wrap{position:fixed;right:20px;top:50%;transform:translateY(-50%);z-index:1200;display:flex;align-items:center;pointer-events:auto}",
			".uhm-strip{display:flex;flex-direction:column;align-items:center;gap:6px;max-height:60vh;overflow-y:auto}",
			".uhm-tick{flex:none;width:26px;height:10px;display:flex;align-items:center;justify-content:center;cursor:pointer}",
			".uhm-tick-bar{width:12px;height:2px;border-radius:1px;background:rgba(127,127,127,.55);transition:width .08s ease,background .08s ease}",
			".uhm-tick:hover .uhm-tick-bar,.uhm-tick-active .uhm-tick-bar{width:24px;background:var(--dsw-alias-label-primary,#111)}",
			".uhm-tip{position:absolute;right:calc(100% + 12px);top:50%;transform:translateY(-50%);width:280px;max-height:70vh;overflow:auto;box-sizing:border-box;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#222);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));border-radius:10px;box-shadow:0 4px 22px rgba(0,0,0,.16);padding:10px 12px;font-size:13px;line-height:1.5;animation:uhmFade .12s ease}",
			".uhm-tip-time{font-size:11px;color:var(--dsw-alias-label-secondary,#888);margin-bottom:4px;font-variant-numeric:tabular-nums}",
			".uhm-tip-text{white-space:pre-line;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;margin-bottom:4px}",
			".uhm-tip-answer{white-space:pre-line;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;color:var(--dsw-alias-label-secondary,#777);border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));padding-top:4px}"
		].join("\n");

		function apply(ctx) {
			if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"" + STYLE_ID + "\"]") === null) {
				var tag = document.createElement("style");
				tag.dataset.plugin = STYLE_ID;
				tag.dataset.pluginCss = STYLE_ID;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
			var slots = ctx.get("slots");
			if (slots === undefined) return;
			sessionsService = ctx.get("sessions") || null;

			slots.inject("conversation.session.header.utilities", function () {
				return slots.register(
					{ name: "conversation.session.header.utilities", id: "user-history-rail", order: 200 },
					function (props) { return react.createElement(Rail, props); }
				);
			});
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});
