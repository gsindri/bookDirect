// OverflowDiagnostics.js - Measurement-driven overflow detection for Booking.com
// Logs to console with [bookDirect][overflow] prefix for easy filtering
(() => {
    if (window.__bdOverflowDiagInstalled) return;
    window.__bdOverflowDiagInstalled = true;

    // Find all horizontally scrollable ancestors of an element
    function getScrollableXAncestors(el) {
        const res = [];
        for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
            const cs = getComputedStyle(p);
            const ox = cs.overflowX;
            if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) {
                res.push(p);
            }
        }
        return res;
    }

    function bdMetrics() {
        const root = document.documentElement;
        const scrollbarPx = window.innerWidth - root.clientWidth;
        // Correct overflow: compare scrollWidth to clientWidth (not innerWidth)
        const overflowPx = root.scrollWidth - root.clientWidth;

        return {
            t: new Date().toISOString(),
            scrollX: window.scrollX || 0,
            scrollY: window.scrollY || 0,
            innerWidth: window.innerWidth,
            clientWidth: root.clientWidth,
            scrollWidth: root.scrollWidth,
            scrollbarPx,
            overflowPx,
            bodyOverflowX: getComputedStyle(document.body).overflowX,
            htmlOverflowX: getComputedStyle(root).overflowX,
        };
    }

    function bdFindOverflowOffenders(max = 12) {
        const root = document.documentElement;
        const W = root.clientWidth; // Use clientWidth, not innerWidth
        const overflowPx = root.scrollWidth - W;
        const offenders = [];

        // Only scan if there's actual overflow
        if (overflowPx <= 1) {
            console.log('[bookDirect][overflow] no root overflow; skipping offender scan');
            return { overflowPx, offenders };
        }

        // Walk DOM tree looking for elements extending beyond viewport
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        let node, scanned = 0;

        while ((node = walker.nextNode()) && scanned < 12000) {
            scanned++;
            const el = /** @type {HTMLElement} */ (node);
            const st = getComputedStyle(el);
            if (st.display === "none" || st.visibility === "hidden") continue;

            const r = el.getBoundingClientRect();
            if (r.right > W + 1 || r.left < -1) {
                offenders.push({
                    el,
                    tag: el.tagName,
                    id: el.id || null,
                    cls: (el.className && String(el.className).slice(0, 120)) || null,
                    left: Math.round(r.left),
                    right: Math.round(r.right),
                    width: Math.round(r.width),
                    position: st.position,
                    overflowX: st.overflowX,
                    zIndex: st.zIndex,
                });
                if (offenders.length >= max) break;
            }
        }

        offenders.sort((a, b) => (b.right - W) - (a.right - W));
        return { overflowPx, offenders };
    }

    function bdSnapshot(label, { forceScan = false, targetEl = null } = {}) {
        const m = bdMetrics();

        // Log scrollable ancestors if we have a target element
        if (targetEl) {
            const ancestors = getScrollableXAncestors(targetEl);
            if (ancestors.length) {
                console.log(`[bookDirect][overflow][${label}] scrollable ancestors:`,
                    ancestors.map(x => ({
                        tag: x.tagName,
                        cls: (x.className && String(x.className).slice(0, 80)) || null,
                        scrollLeft: x.scrollLeft,
                        clientWidth: x.clientWidth,
                        scrollWidth: x.scrollWidth,
                    }))
                );
            }
        }

        const shouldScan = forceScan || m.overflowPx > 1 || m.scrollX > 0;

        let offenders = [];
        if (shouldScan) {
            const out = bdFindOverflowOffenders(12);
            offenders = out.offenders;

            const worst = offenders[0]?.el || null;
            if (worst) {
                console.log(`[bookDirect][overflow][${label}] worst offender element:`, worst);
            }
        }

        // Print compact summary
        console.log(`[bookDirect][overflow][${label}]`, m);
        if (offenders.length) {
            console.table(offenders.map(o => ({
                tag: o.tag, id: o.id, cls: o.cls,
                left: o.left, right: o.right, width: o.width,
                position: o.position, overflowX: o.overflowX, zIndex: o.zIndex
            })));
        }

        return { metrics: m, offenders };
    }

    function bdHookRoomSelectDiagnostics() {
        let last = 0;
        function throttled(label, opts) {
            const now = Date.now();
            if (now - last < 200) return;
            last = now;
            bdSnapshot(label, opts);
        }

        // BEFORE opening select
        document.addEventListener("pointerdown", (e) => {
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            if (t.tagName !== "SELECT") return;

            throttled("select-pointerdown:immediate", { targetEl: t });
            requestAnimationFrame(() => throttled("select-pointerdown:rAF1", { targetEl: t }));
            requestAnimationFrame(() => requestAnimationFrame(() => throttled("select-pointerdown:rAF2", { targetEl: t })));
            setTimeout(() => throttled("select-pointerdown:timeout200", { targetEl: t }), 200);
        }, true);

        // AFTER selection committed
        document.addEventListener("change", (e) => {
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            if (t.tagName !== "SELECT") return;

            throttled("select-change:immediate", { forceScan: true, targetEl: t });
            requestAnimationFrame(() => throttled("select-change:rAF1", { forceScan: true, targetEl: t }));
            requestAnimationFrame(() => requestAnimationFrame(() => throttled("select-change:rAF2", { forceScan: true, targetEl: t })));
            setTimeout(() => throttled("select-change:timeout200", { forceScan: true, targetEl: t }), 200);
        }, true);

        console.log("[bookDirect][overflow] diagnostics armed (select pointerdown/change)");
    }

    function bdHookScrollXWatcher() {
        let lastX = window.scrollX || 0;
        let lastLog = 0;

        window.addEventListener("scroll", () => {
            const x = window.scrollX || 0;
            if (x === lastX) return;
            lastX = x;

            const now = Date.now();
            if (now - lastLog < 250) return;
            lastLog = now;

            bdSnapshot(`scrollX-changed:${x}`, { forceScan: true });
        }, { passive: true });

        console.log("[bookDirect][overflow] scrollX watcher armed");
    }

    // Expose for manual console triggering and content script hookup
    window.bookDirectOverflowDiagnostics = {
        snapshot: bdSnapshot,
        metrics: bdMetrics,
        findOffenders: bdFindOverflowOffenders,
        getScrollableXAncestors,
        hookRoomSelect: bdHookRoomSelectDiagnostics,
        hookScrollXWatcher: bdHookScrollXWatcher,
    };
})();
