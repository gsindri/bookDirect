// =============================================
// IMMEDIATE PAGE ROUTER - Must run before anything else
// =============================================
(function immediatePageRouter() {
    const log = (...args) => console.log("bookDirect:", ...args);

    function isBookingHost() {
        return /(^|\.)booking\.com$/i.test(location.hostname);
    }

    function isSearchResultsPage() {
        // Handles: /searchresults.html, /searchresults.en-gb.html, etc.
        return isBookingHost() && /^\/searchresults(\..+)?\.html$/i.test(location.pathname);
    }

    function pad2(n) {
        return String(n).padStart(2, "0");
    }

    function ymd(y, m, d) {
        if (!y || !m || !d) return "";
        return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    function guessGlFromHotelLinks() {
        // On results pages, hotel cards usually contain links like /hotel/dk/....
        const a = document.querySelector('a[href*="/hotel/"]');
        if (!a) return "";
        const href = a.getAttribute("href") || "";
        const m = href.match(/\/hotel\/([a-z]{2})\//i);
        return m ? m[1].toLowerCase() : "";
    }

    function extractPrefetchParamsFromUrl() {
        const u = new URL(location.href);
        const sp = u.searchParams;

        const q =
            (sp.get("ss") || "").trim() ||
            (sp.get("ssne_untouched") || "").trim() ||
            (sp.get("ssne") || "").trim();

        // Booking uses either full ISO or split params
        let checkIn = sp.get("checkin") || "";
        let checkOut = sp.get("checkout") || "";

        if (!checkIn) checkIn = ymd(sp.get("checkin_year"), sp.get("checkin_month"), sp.get("checkin_monthday"));
        if (!checkOut) checkOut = ymd(sp.get("checkout_year"), sp.get("checkout_month"), sp.get("checkout_monthday"));

        const adultsRaw = sp.get("group_adults") || sp.get("adults") || "2";
        const adults = Math.max(1, Math.min(10, parseInt(adultsRaw, 10) || 2));

        const currency = (sp.get("selected_currency") || sp.get("currency") || "").trim().toUpperCase();

        // Booking commonly uses ?lang=en-us
        const hl = (sp.get("lang") || document.documentElement.lang || navigator.language || "").trim();

        // Prefer extracting from actual hotel links so it matches hotel page logic
        const gl = (guessGlFromHotelLinks() || sp.get("gl") || "").trim().toLowerCase() || "us";

        if (!q || !checkIn || !checkOut) return null;

        return { q, checkIn, checkOut, adults, currency, gl, hl };
    }

    function sendPrefetchMessage(payload) {
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
                log("PREFETCH_CTX: extension context not available");
                return;
            }
            chrome.runtime.sendMessage({ type: "PREFETCH_CTX", payload }, (resp) => {
                if (chrome.runtime.lastError) {
                    log("PREFETCH_CTX send failed:", chrome.runtime.lastError.message);
                    return;
                }
                log("PREFETCH_CTX response:", resp);
                // Store ctxId in sessionStorage for hotel page lookup
                if (resp?.ok && resp?.ctxId) {
                    const storageKey = `bookDirect_prefetch:${payload.q}:${payload.checkIn}:${payload.checkOut}:${payload.adults}:${payload.currency || 'USD'}:${payload.gl}:${payload.hl || ''}`;
                    try {
                        sessionStorage.setItem(storageKey, resp.ctxId);
                        log("Stored ctxId in sessionStorage:", storageKey, resp.ctxId);
                    } catch (e) {
                        log("Failed to store ctxId:", e);
                    }
                }
            });
        } catch (e) {
            log("PREFETCH_CTX exception:", e);
        }
    }

    // Debounced runner (Booking changes URL via SPA-ish navigation sometimes)
    let timer = null;
    let lastKey = "";

    function schedulePrefetch(reason) {
        if (!isSearchResultsPage()) return;

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            const params = extractPrefetchParamsFromUrl();
            log("Search results detected:", { reason, href: location.href, params });

            if (!params) {
                log("Prefetch skipped (missing q/checkIn/checkOut)");
                return;
            }

            // Avoid repeated sends for same parameters
            const key = JSON.stringify(params);
            if (key === lastKey) return;
            lastKey = key;

            sendPrefetchMessage(params);
        }, 500);
    }

    // ---- Hook initial load + URL changes ----
    if (isSearchResultsPage()) {
        log("Search results page detected - initiating prefetch flow");
        schedulePrefetch("initial");

        // Patch SPA navigation
        const _push = history.pushState;
        const _replace = history.replaceState;

        history.pushState = function (...args) {
            _push.apply(this, args);
            schedulePrefetch("pushState");
        };
        history.replaceState = function (...args) {
            _replace.apply(this, args);
            schedulePrefetch("replaceState");
        };

        window.addEventListener("popstate", () => schedulePrefetch("popstate"));

        // Re-run once results DOM likely exists (so gl extraction can succeed)
        setTimeout(() => schedulePrefetch("delayed-1s"), 1000);
        setTimeout(() => schedulePrefetch("delayed-3s"), 3000);

        // IMPORTANT: Set global flag to stop hotel-page IIFE from running
        // (return only exits this IIFE, not the whole file)
        window.__bookDirect_isSearchPage = true;
        log("Exiting early - search results page does not need hotel UI injection");
        return;
    }

    log("Not a search results page, continuing to hotel page logic...");
})();

// =============================================
// HOTEL PAGE LOGIC - Only runs if not a search results page
// =============================================
(function () {
    console.log('[bookDirect][IIFE] Hotel page IIFE starting. Current state:', {
        isSearchPage: window.__bookDirect_isSearchPage,
        hasBookDirectInjected: window.hasBookDirectInjected,
        BookDirectExists: !!window.BookDirect
    });

    // Guard: don't run hotel-page logic on search results pages
    if (window.__bookDirect_isSearchPage) {
        console.log('bookDirect: Skipping hotel page flow (on search results page)');
        return;
    }

    console.log('bookDirect: Content script started (hotel page flow)');

    // Global reference to our UI app
    let app = null;
    let reserveButton = null; // Current best visible reserve button (anchor)

    // ========================================
    // STABLE DOCK SLOT (prevents random sizing from different containers)
    // ========================================
    let dockScope = null;     // The container we're docked into
    let dockSlot = null;      // The persistent slot element
    const DOCK_SLOT_ID = 'bd-dock-slot';

    // ========================================
    // PORTAL DOCKING: "ghost" placeholder + floating UI positioned over it
    // ========================================
    const DOCK_GHOST_ID = 'bd-dock-ghost';
    let dockGhost = null;
    let ghostRO = null;

    // ========================================
    // PLACEMENT STATE MACHINE (stable dock/float with hysteresis)
    // ========================================
    const PLACEMENT = {
        mode: null,            // 'button' | 'rail' | 'overlay'
        pendingMode: null,     // candidate mode waiting to commit
        pendingSince: 0,
        lastSwitchAt: 0,
        animating: false,
        lastDockLeft: null,    // for keeping float aligned to dock position
        lastDockWidth: null,   // cached dock zone width for portal positioning
    };

    const SWITCH_DWELL_MS = 120;       // require desired mode to persist (snappier)
    const SWITCH_COOLDOWN_MS = 350;    // minimum time between commits (snappier)
    const EXIT_PADDING_PX = 16;        // dock -> float threshold
    const ENTER_PADDING_PX = 80;       // float -> dock threshold (hysteresis)
    const ANCHOR_STICKY_MARGIN = 1200; // keep current anchor if close to best

    // ========================================
    // LAYOUT REPAIR SYSTEM (fixes gap after refresh/scroll)
    // ========================================
    let didFirstScrollRepair = false;
    let lastRepairAt = 0;
    let roomsXScroller = null;
    let roomsXScrollerStart = 0;
    let didHiddenRedock = false;

    /**
     * Find a horizontal scroller element (often causes "gap" when it drifts)
     */
    function findXScroller(startEl) {
        for (let el = startEl; el && el !== document.documentElement; el = el.parentElement) {
            const cs = getComputedStyle(el);
            const ox = cs.overflowX;
            if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
                return el;
            }
        }
        return null;
    }

    /**
     * Repair Booking's layout by locking scrollLeft and dispatching resize
     */
    function repairBookingLayout(reason) {
        if (!app) return;

        const now = performance.now();
        // Don't spam this
        if (now - lastRepairAt < 400) return;
        lastRepairAt = now;

        console.log(`[bookDirect][repair] Running layout repair: ${reason}`);

        // 1) Kill "room table gap" caused by scrollLeft drift (desktop only)
        if (roomsXScroller && window.innerWidth >= 1024) {
            const drift = roomsXScroller.scrollLeft - roomsXScrollerStart;
            if (Math.abs(drift) > 0.5) {
                roomsXScroller.scrollLeft = roomsXScrollerStart;
                console.log(`[bookDirect][repair] Reset scrollLeft drift: ${drift}px`);
            }
        }

        // 2) Force Booking to re-measure sticky widths/offsets
        requestAnimationFrame(() => {
            document.body.getBoundingClientRect(); // force reflow read
            window.dispatchEvent(new Event('resize'));
        });
        setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
    }

    /**
     * Initialize the repair system after injection
     */
    function initRepairSystem() {
        // Find the room table / availability region and its x-scroller
        const table =
            document.querySelector('.hprt-table') ||
            document.querySelector('#hprt-table') ||
            reserveButton?.closest('table') ||
            null;

        roomsXScroller = findXScroller(table || reserveButton);
        roomsXScrollerStart = roomsXScroller ? roomsXScroller.scrollLeft : 0;

        // Repair shortly after injection/hydration settles
        setTimeout(() => repairBookingLayout('post-inject-0'), 0);
        setTimeout(() => repairBookingLayout('post-inject-500'), 500);
        setTimeout(() => repairBookingLayout('post-inject-1500'), 1500);
    }

    /**
     * Hidden redock nudge - mimics "float then dock fixes it" behavior
     */
    function hiddenRedockNudge() {
        if (!app || !reserveButton || didHiddenRedock) return;
        didHiddenRedock = true;

        const prevOpacity = app.style.opacity;
        app.style.opacity = '0';

        // Move out and back in on consecutive frames
        const floatHost = getOrCreateFloatingHost();
        floatHost.appendChild(app);

        requestAnimationFrame(() => {
            // Re-place using the 3-tier system
            placeUI(app, { animate: false, force: true });
            app.style.opacity = prevOpacity || '1';
            repairBookingLayout('hidden-redock');
        });
    }

    // ========================================
    // ROOM SELECT STABILIZER (prevents gap after room dropdown change)
    // ========================================
    let __bdRoomSelectStabilizerArmed = false;

    function armRoomSelectStabilizer() {
        if (__bdRoomSelectStabilizerArmed) return;
        __bdRoomSelectStabilizerArmed = true;

        const SNAPSHOTS = new WeakMap(); // HTMLSelectElement -> snapshot[]
        const ROOM_SELECT_SELECTOR = '.hprt-nos-select, .hprt-table select';

        function isRoomSelect(el) {
            return el && el.matches && el.matches(ROOM_SELECT_SELECTOR);
        }

        function captureScrollableAncestors(fromEl) {
            const snap = [];

            // Capture scrollingElement too, just in case
            const se = document.scrollingElement;
            if (se && se.scrollWidth > se.clientWidth + 1) {
                snap.push({ el: se, scrollLeft: se.scrollLeft });
            }

            for (let p = fromEl; p && p !== document.documentElement; p = p.parentElement) {
                const cs = getComputedStyle(p);
                const ox = cs.overflowX;

                // Only elements that can actually scroll horizontally
                const canScroll = (ox === 'auto' || ox === 'scroll');
                if (!canScroll) continue;

                if (p.scrollWidth > p.clientWidth + 1) {
                    snap.push({ el: p, scrollLeft: p.scrollLeft });
                }
            }
            return snap;
        }

        function restoreSnapshot(snapshot) {
            if (!snapshot || !snapshot.length) return;

            // Root horizontal reset
            try { document.documentElement.scrollLeft = 0; } catch (_) { }
            try { document.body.scrollLeft = 0; } catch (_) { }

            snapshot.forEach(({ el, scrollLeft }) => {
                try {
                    if (el && typeof el.scrollLeft === 'number' && el.scrollLeft !== scrollLeft) {
                        el.scrollLeft = scrollLeft;
                    }
                } catch (_) { }
            });
        }

        function nudgeLayout(reason) {
            // Force style/layout flush
            try { void document.documentElement.offsetWidth; } catch (_) { }

            // Fire resize events (Booking listens to these)
            try { window.dispatchEvent(new Event('resize')); } catch (_) { }
            requestAnimationFrame(() => {
                try { window.dispatchEvent(new Event('resize')); } catch (_) { }
            });
        }

        function scheduleRepair(selectEl, reason) {
            const snapshot =
                (selectEl && SNAPSHOTS.get(selectEl)) ||
                (selectEl ? captureScrollableAncestors(selectEl) : null);

            const run = (label) => {
                restoreSnapshot(snapshot);
                nudgeLayout(`${reason}:${label}`);

                // Re-check placement without forcing a mode switch
                try { checkPlacementThrottled(); } catch (_) { }
            };

            // Hit several timings (Booking updates across multiple ticks)
            run('immediate');
            requestAnimationFrame(() => run('rAF1'));
            requestAnimationFrame(() => requestAnimationFrame(() => run('rAF2')));
            setTimeout(() => run('t150'), 150);
            setTimeout(() => run('t400'), 400);
            setTimeout(() => run('t900'), 900);

            if (selectEl) SNAPSHOTS.delete(selectEl);
        }

        // Capture scrollLeft BEFORE Booking mutates anything
        document.addEventListener('pointerdown', (e) => {
            const t = e.target;
            const sel = t && t.closest ? t.closest('select') : null;
            if (!isRoomSelect(sel)) return;

            SNAPSHOTS.set(sel, captureScrollableAncestors(sel));
        }, true);

        // Repair AFTER selection
        document.addEventListener('change', (e) => {
            const sel = e.target;
            if (!isRoomSelect(sel)) return;

            scheduleRepair(sel, 'room-select-change');
        }, true);

        console.log('[bookDirect][stabilizer] Armed room select stabilizer');
    }

    // ========================================
    // PORTAL DOCKING HELPERS
    // ========================================

    function getOrCreateDockGhost() {
        if (dockGhost && dockGhost.isConnected) return dockGhost;

        let g = document.getElementById(DOCK_GHOST_ID);
        if (!g) {
            g = document.createElement('div');
            g.id = DOCK_GHOST_ID;
            g.style.cssText = `
                display: block;
                width: 100%;
                max-width: 100%;
                min-width: 0;
                box-sizing: border-box;
                align-self: stretch;
                justify-self: stretch;
                height: 0px;
                margin: 0;
                padding: 0;
                pointer-events: none;
            `;
        }
        dockGhost = g;
        return g;
    }

    function syncGhostHeight(uiRoot) {
        const g = dockGhost;
        if (!g || !g.isConnected || !uiRoot) return;

        // When floating overlay, collapse placeholder
        if (PLACEMENT.mode === 'overlay') {
            g.style.height = '0px';
            return;
        }

        const r = uiRoot.getBoundingClientRect();
        const cs = getComputedStyle(uiRoot);
        const mt = parseFloat(cs.marginTop) || 0;
        const mb = parseFloat(cs.marginBottom) || 0;

        const h = Math.max(0, Math.round(r.height + mt + mb));
        g.style.height = `${h}px`;
    }

    function ensureGhostResizeObserver(uiRoot) {
        if (ghostRO || !uiRoot) return;
        ghostRO = new ResizeObserver(() => syncGhostHeight(uiRoot));
        ghostRO.observe(uiRoot);
    }

    // Host positioning: overlay (bottom-right, highest z-index)
    function applyHostOverlay(host) {
        if (!host) return;
        host.style.position = 'fixed';
        host.style.right = '16px';
        host.style.bottom = '16px';
        host.style.left = 'auto';
        host.style.top = 'auto';
        host.style.width = '320px';
        host.style.maxWidth = 'calc(100vw - 32px)';
        host.style.maxHeight = 'calc(100vh - 32px)';
        host.style.overflow = 'auto';
        host.style.zIndex = '2147483647'; // Max z-index for overlay
        host.style.clipPath = 'none';   // Critical: remove dock clipping
    }

    // Host positioning: docked (positioned over ghost placeholder)
    // Uses ghost rect as single source of truth - no min-width clamp
    function applyHostDocked(host, ghostEl) {
        if (!host || !ghostEl) return;

        const r = ghostEl.getBoundingClientRect();

        // Use ghost as the single source of truth
        let left = r.left;
        let top = r.top;
        let width = r.width;

        // Safety clamps (don't let it go offscreen)
        width = Math.max(1, Math.min(width, window.innerWidth));
        left = Math.max(0, Math.min(left, window.innerWidth - width));

        // Booking's sticky header is typically 48-64px tall
        const HEADER_HEIGHT = 64;

        host.style.position = 'fixed';
        host.style.top = `${top}px`;
        host.style.left = `${left}px`;
        host.style.width = `${width}px`;

        // Clear overlay anchors so they don't fight dock positioning
        host.style.right = 'auto';
        host.style.bottom = 'auto';

        // Don't constrain docked mode
        host.style.maxWidth = 'none';
        host.style.maxHeight = 'none';
        host.style.overflow = 'visible';
        host.style.zIndex = '2147483647'; // High z-index for clickability

        // Clip any part that would appear above the header
        // This creates a "window" that starts at HEADER_HEIGHT from the viewport top
        const clipTop = Math.max(0, HEADER_HEIGHT - top);
        if (clipTop > 0) {
            host.style.clipPath = `inset(${clipTop}px 0 0 0)`;
        } else {
            host.style.clipPath = 'none';
        }
    }

    // ========================================
    // DOCK/FLOAT PLACEMENT SYSTEM
    // ========================================

    /**
     * Get all reserve buttons from the page (Booking may have multiple)
     */
    function getAllReserveButtons() {
        const selectors = [
            '.js-reservation-button',
            'button[type="submit"].hprt-reservation-cta__book',
            '.hprt-reservation-cta button[type="submit"]',
            'button.bui-button--primary[type="submit"]'
        ];

        const set = new Set();
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(el => set.add(el));
        }
        return [...set];
    }

    /**
     * Score a reserve button based on visibility, position, container scope, and usability
     * Higher score = better candidate for docking
     */
    function scoreReserveButton(btn) {
        if (!btn || !btn.isConnected) return -Infinity;

        const cs = getComputedStyle(btn);
        if (cs.display === 'none' || cs.visibility === 'hidden') return -Infinity;
        if (btn.getClientRects().length === 0) return -Infinity;

        const r = btn.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return -Infinity;

        // Hard reject: teleported far above or far below viewport
        if (r.bottom < -200) return -Infinity;
        if (r.top > window.innerHeight + 200) return -Infinity;

        // Find the containing scope (this determines our card's max width)
        const scope =
            btn.closest('.hprt-block') ||
            btn.closest('aside') ||
            btn.closest('.hprt-reservation-cta') ||
            btn.parentElement;

        const scopeRect = scope ? scope.getBoundingClientRect() : r;

        // Score: prefer right side + wider containers (avoids sticky mini-clones)
        const rightBias = (scopeRect.left > window.innerWidth * 0.55) ? 1000 : 0;
        const widthScore = Math.round(scopeRect.width);

        // In-viewport bonus
        const inViewportBonus = (r.bottom > 0 && r.top < window.innerHeight) ? 200 : 0;

        // Visible area (tiebreaker)
        const vx = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
        const vy = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        const visibleArea = (vx * vy) / 1000; // Scale down to not dominate

        return rightBias + widthScore + inViewportBonus + visibleArea;
    }

    /**
     * Get the containing scope for a button (used for dock slot placement)
     */
    function getButtonScope(btn) {
        if (!btn) return null;
        return (
            btn.closest('.hprt-block') ||
            btn.closest('aside') ||
            btn.closest('.hprt-reservation-cta') ||
            btn.parentElement
        );
    }

    /**
     * Ensure we have a persistent dock slot in the correct scope
     * This prevents random sizing from docking into different containers
     */
    function ensureDockSlot(anchorBtn) {
        if (!anchorBtn) return null;

        const scope = getButtonScope(anchorBtn);
        if (!scope) return null;

        // Recreate if scope changed or slot was lost
        if (!dockSlot || !dockSlot.isConnected || dockScope !== scope) {
            dockScope = scope;

            // Try to find existing slot in this scope
            dockSlot = scope.querySelector(`#${DOCK_SLOT_ID}`) || document.createElement('div');
            dockSlot.id = DOCK_SLOT_ID;

            // Make the slot stretch in flex/grid contexts
            dockSlot.style.cssText = `
                display: block;
                width: 100%;
                max-width: 100%;
                min-width: 0;
                box-sizing: border-box;
                align-self: stretch;
                justify-self: stretch;
                margin-top: 10px;
                margin-bottom: 10px;
            `;

            // Insert slot right before the anchor button
            anchorBtn.insertAdjacentElement('beforebegin', dockSlot);
            console.log('[bookDirect][dockSlot] Created/updated dock slot in scope:', scope.className || scope.tagName);
        }

        return dockSlot;
    }

    /**
     * Find the best (most visible, properly positioned) reserve button
     */
    function findBestReserveButton(preferEl) {
        const buttons = getAllReserveButtons();
        let best = null;
        let bestScore = -Infinity;

        for (const b of buttons) {
            const s = scoreReserveButton(b);
            if (s > bestScore) {
                bestScore = s;
                best = b;
            }
        }

        // Anchor stickiness: keep the current anchor if it's still "good enough"
        // This prevents button ping-pong between competing candidates
        if (preferEl && preferEl.isConnected) {
            const ps = scoreReserveButton(preferEl);
            if (ps > -Infinity && ps >= bestScore - ANCHOR_STICKY_MARGIN) {
                return preferEl;
            }
        }

        if (best) {
            console.log('[bookDirect][placement] Found best button, score:', bestScore);
        }
        return best;
    }

    /**
     * Creates or returns the floating host container (for portal docking)
     * Position is now controlled dynamically via applyHostOverlay/applyHostDocked
     */
    function getOrCreateFloatingHost() {
        let host = document.getElementById('bd-float-host');
        if (host) return host;

        host = document.createElement('div');
        host.id = 'bd-float-host';
        host.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            pointer-events: auto;
            box-sizing: border-box;
        `;
        document.documentElement.appendChild(host);

        // Default to overlay position
        applyHostOverlay(host);

        console.log('[bookDirect][placement] Created floating host (portal)');
        return host;
    }

    // ========================================
    // RIGHT RAIL HELPERS (Tier B placement)
    // ========================================

    /**
     * Find the right rail/sidebar container on the page
     */
    function findRightRail() {
        return (
            document.querySelector('[data-testid*="right-rail" i]') ||
            document.querySelector('[data-testid*="property-sidebar" i]') ||
            document.querySelector('[data-testid="PropertyHeaderContainer"]')?.closest('div[class]')?.parentElement?.lastElementChild ||
            document.querySelector('#right') ||
            document.querySelector('aside[class*="sidebar"]') ||
            document.querySelector('aside') // fallback
        );
    }

    /**
     * Get or create a slot in the right rail for our UI
     */
    function getOrCreateRailSlot(rail) {
        if (!rail) return null;

        let slot = rail.querySelector('#bd-rail-slot');
        if (slot) return slot;

        slot = document.createElement('div');
        slot.id = 'bd-rail-slot';
        slot.style.cssText = `
            display: block;
            margin-top: 12px;
            margin-bottom: 12px;
            min-width: 0;
        `;

        // Insert near top but AFTER the rating widget if present
        const ratingCard =
            rail.querySelector('[data-testid*="review-score" i]') ||
            rail.querySelector('[data-testid*="review" i]') ||
            rail.querySelector('[class*="review"]');

        if (ratingCard && ratingCard.parentElement === rail) {
            ratingCard.insertAdjacentElement('afterend', slot);
        } else {
            rail.prepend(slot);
        }

        console.log('[bookDirect][placement] Created rail slot');
        return slot;
    }

    /**
     * Check if the right rail is usable (visible and in viewport)
     */
    function isUsableRail(rail) {
        if (!rail) return false;

        const cs = getComputedStyle(rail);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;

        const r = rail.getBoundingClientRect();

        // Reject if Booking teleported it far above viewport
        if (r.bottom < -200) return false;

        return true;
    }

    /**
     * Check if a rect is within the visible viewport band (with configurable padding)
     */
    function isRectInViewportBand(rect, padTop = 80, padBottom = 80) {
        return rect.bottom > padTop && rect.top < (window.innerHeight - padBottom);
    }

    /**
     * Check if anchor is in the visible viewport band (not just "connected")
     */
    function isAnchorInViewportBand(anchorEl) {
        if (!anchorEl) return false;
        const r = anchorEl.getBoundingClientRect();
        const bandTop = 80;
        const bandBottom = window.innerHeight - 80;
        return r.bottom > bandTop && r.top < bandBottom;
    }

    /**
     * Determines if an anchor element is suitable for docking
     * Returns false if element is hidden, off-screen, or has hidden ancestors
     */
    function isUsableAnchor(anchorEl) {
        // Debug: force floating mode to test if docking causes layout issues
        const FLAGS = window.BookDirect?.DEBUG_FLAGS || {};
        if (FLAGS.FORCE_FLOATING) {
            console.log('[bookDirect][placement] FORCE_FLOATING enabled, bypassing dock');
            return false;
        }

        // Immediately reject disconnected or null nodes
        if (!anchorEl || !anchorEl.isConnected) return false;

        const cs = getComputedStyle(anchorEl);
        if (cs.display === 'none' || cs.visibility === 'hidden') {
            return false;
        }

        const rect = anchorEl.getBoundingClientRect();

        // Two-threshold hysteresis: harder to undock than to dock
        // Once docked, only undock if REALLY offscreen; once floating, allow docking earlier
        const undockThreshold = -320;
        const dockThreshold = -120;
        // "button" is the only mode where we're actually docked to the reserve button
        const threshold = (PLACEMENT.mode === 'button') ? undockThreshold : dockThreshold;

        if (rect.bottom < threshold) {
            return false;
        }

        // Also check if dock zone is scrolled BELOW viewport (past bottom of dock area)
        // Switch to overlay when user scrolls past the dock zone
        const belowThreshold = (PLACEMENT.mode === 'button') ? 400 : 200;
        if (rect.top > window.innerHeight + belowThreshold) {
            return false;
        }

        // Check if any sticky/fixed ancestor is far above viewport
        let parent = anchorEl.parentElement;
        while (parent && parent !== document.documentElement) {
            const pcs = getComputedStyle(parent);
            if (pcs.position === 'sticky' || pcs.position === 'fixed') {
                const pRect = parent.getBoundingClientRect();
                if (pRect.bottom < -200) {
                    return false;
                }
            }
            if (pcs.visibility === 'hidden') {
                return false;
            }
            parent = parent.parentElement;
        }

        return true;
    }

    /**
     * Get UI height for threshold calculations
     */
    function getUiHeight(uiRoot) {
        if (!uiRoot) return 300;
        const r = uiRoot.getBoundingClientRect();
        return Math.max(120, Math.round(r.height || 300));
    }

    // ========================================
    // 3-TIER PLACEMENT SYSTEM
    // ========================================

    /**
     * Determine and execute placement using 3-tier strategy:
     * Tier A: Dock to reserve button (when button is usable AND in viewport band)
     * Tier B: Dock to right rail (in-flow, no overlap)
     * Tier C: Fixed overlay fallback (bottom-right)
     */
    function placeUI(uiRoot, options = {}) {
        if (!uiRoot) return null;

        const { animate = true, force = false } = options;
        const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        const doAnim = animate && !prefersReduced && !PLACEMENT.animating;

        // Re-find best button with stickiness
        reserveButton = findBestReserveButton(reserveButton);

        const rail = findRightRail();
        const railSlot = rail ? getOrCreateRailSlot(rail) : null;

        // Determine tier
        let newMode = 'overlay';
        let targetContainer = null;
        let insertMethod = 'appendChild';

        // Tier A: Button docking
        // - Require viewport band ONLY when entering (prevents accidental dock at edges)
        // - If already docked, stay docked as long as anchor is usable (stickiness)
        // - Also check ghost position when already docked
        const ghost = getOrCreateDockGhost();
        const HEADER_HEIGHT = 64; // Keep consistent with applyHostDocked
        const ghostRect = (ghost && ghost.isConnected) ? ghost.getBoundingClientRect() : null;

        // When docked, check if ghost is still visible (not scrolled into clipping region)
        // Prevents staying "docked" once the ghost moves into the region where clipPath erases the UI
        // NOTE: Only apply this check when already docked; when in overlay, ghost is collapsed
        const ghostStillVisible = !ghostRect || (
            ghostRect.bottom > (HEADER_HEIGHT + 8) &&
            ghostRect.top < (window.innerHeight - 8)
        );

        // Decide if we want button dock:
        // - If already docked ('button' mode): stay docked as long as ghost is visible AND anchor is usable
        // - If not docked yet (overlay/rail): only dock if reserve button is in viewport band
        const wantButtonDock =
            isUsableAnchor(reserveButton) &&
            (
                (PLACEMENT.mode === 'button' && ghostStillVisible) ||  // already docked -> check ghost visibility
                (PLACEMENT.mode !== 'button' && isAnchorInViewportBand(reserveButton))  // not docked -> check button position
            );

        // Tier B: Rail docking - only choose rail mode when the rail slot itself is visible
        const railSlotRect = railSlot?.getBoundingClientRect?.();
        const railSlotVisible = !!railSlotRect && isRectInViewportBand(railSlotRect);

        if (wantButtonDock) {
            newMode = 'button';
            targetContainer = reserveButton;
            insertMethod = 'beforebegin';
        }
        // Tier B: Rail docking (in-flow, avoids overlap)
        else if (railSlot && isUsableRail(rail) && railSlotVisible) {
            newMode = 'rail';
            targetContainer = railSlot;
            insertMethod = 'appendChild';
        }
        // Tier C: Overlay fallback
        else {
            newMode = 'overlay';
            targetContainer = getOrCreateFloatingHost();
            insertMethod = 'appendChild';
        }

        // Check if already in correct location (use dockSlot for button mode)
        const currentParent = uiRoot.parentNode;
        const buttonScope = reserveButton ? getButtonScope(reserveButton) : null;
        // ghost already declared above
        const ghostParent = ghost ? ghost.parentNode : null;
        const alreadyPlaced =
            PLACEMENT.mode === newMode && (
                (newMode === 'button' && dockSlot && dockSlot.isConnected && dockScope === buttonScope && ghostParent === dockSlot) ||
                (newMode === 'rail' && ghostParent === railSlot) ||
                (newMode === 'overlay')
            );

        if (alreadyPlaced && !force) {
            // Overlay mode is self-healing: reassert position + clear clipPath
            if (newMode === 'overlay') {
                applyHostOverlay(getOrCreateFloatingHost());
            } else {
                scheduleDockSync();
            }
            return newMode;
        }

        // Check cooldown (don't switch rapidly)
        const now = performance.now();
        if (!force && PLACEMENT.mode && newMode !== PLACEMENT.mode) {
            if (now - PLACEMENT.lastSwitchAt < SWITCH_COOLDOWN_MS) {
                return PLACEMENT.mode;
            }

            // Dwell check
            if (PLACEMENT.pendingMode !== newMode) {
                PLACEMENT.pendingMode = newMode;
                PLACEMENT.pendingSince = now;
                return PLACEMENT.mode;
            }
            if (now - PLACEMENT.pendingSince < SWITCH_DWELL_MS) {
                return PLACEMENT.mode;
            }
        }

        // Commit the placement
        const first = doAnim ? uiRoot.getBoundingClientRect() : null;
        const oldMode = PLACEMENT.mode;

        console.log(`[bookDirect][placement] ${oldMode || 'init'} → ${newMode}`);

        // ========================================
        // PORTAL DOCKING: UI always in floating host, ghost in dock zones
        // ========================================
        const floatHost = getOrCreateFloatingHost();
        if (uiRoot.parentNode !== floatHost) floatHost.appendChild(uiRoot);

        ensureGhostResizeObserver(uiRoot);
        // ghost already declared above in alreadyPlaced check

        uiRoot.style.pointerEvents = 'auto';

        if (newMode === 'button') {
            // Put the GHOST in the dock slot (not the UI)
            const slot = ensureDockSlot(targetContainer);
            if (slot && ghost.parentNode !== slot) slot.appendChild(ghost);

            // Size placeholder and position floating host over it
            syncGhostHeight(uiRoot);
            applyHostDocked(floatHost, ghost);

            const r = uiRoot.getBoundingClientRect();
            PLACEMENT.lastDockLeft = r.left;
        }
        else if (newMode === 'rail') {
            // Put ghost in rail slot
            if (railSlot && ghost.parentNode !== railSlot) railSlot.appendChild(ghost);

            syncGhostHeight(uiRoot);
            applyHostDocked(floatHost, ghost);

            const r = uiRoot.getBoundingClientRect();
            PLACEMENT.lastDockLeft = r.left;
        }
        else {
            // Overlay fallback - collapse ghost
            if (ghost && ghost.isConnected) ghost.style.height = '0px';
            applyHostOverlay(floatHost);
        }

        PLACEMENT.mode = newMode;
        PLACEMENT.lastSwitchAt = now;
        PLACEMENT.pendingMode = null;

        // Repair layout after mode change (fixes gap issues)
        if (oldMode && oldMode !== newMode) {
            repairBookingLayout(`mode-change:${oldMode}->${newMode}`);
        }

        // Layout nudge
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));

        // FLIP animation
        if (doAnim && first && oldMode && oldMode !== newMode) {
            const last = uiRoot.getBoundingClientRect();
            const dx = first.left - last.left;
            const dy = first.top - last.top;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                PLACEMENT.animating = true;

                uiRoot.style.transition = 'none';
                uiRoot.style.transform = `translate(${dx}px, ${dy}px)`;
                uiRoot.getBoundingClientRect(); // force reflow

                uiRoot.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
                uiRoot.style.transform = 'translate(0px, 0px)';

                const finish = () => {
                    PLACEMENT.animating = false;
                    uiRoot.style.transition = '';
                    uiRoot.style.transform = '';
                };

                uiRoot.addEventListener('transitionend', finish, { once: true });
                setTimeout(finish, 260);
            }
        }

        // Visibility seatbelt: if we docked but landed offscreen, force overlay
        if (newMode !== 'overlay') {
            requestAnimationFrame(() => {
                const r = uiRoot.getBoundingClientRect();
                const isOnScreen = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
                if (!isOnScreen) {
                    console.log('[bookDirect][placement] dock landed offscreen -> forcing overlay');
                    placeUI(uiRoot, { force: true, animate: false });
                }
            });
        }

        return newMode;
    }

    // ========================================
    // SCROLL-IDLE GATING + PORTAL DOCK SYNC
    // ========================================
    let scrolling = false;
    let scrollIdleTimer = null;
    let dockSyncRAF = false;

    /**
     * Keep floating host aligned over ghost while scrolling (portal docking)
     */
    function scheduleDockSync() {
        if (dockSyncRAF) return;
        dockSyncRAF = true;

        requestAnimationFrame(() => {
            dockSyncRAF = false;
            if (!app) return;
            if (PLACEMENT.mode === 'overlay') return;

            const floatHost = getOrCreateFloatingHost();
            const ghost = getOrCreateDockGhost();
            if (!ghost.isConnected) return;

            syncGhostHeight(app);
            applyHostDocked(floatHost, ghost);
        });
    }

    /**
     * Throttled placement check with scroll-idle gating
     */
    let placementThrottled = false;
    function checkPlacementThrottled() {
        if (placementThrottled || !app) return;
        placementThrottled = true;

        requestAnimationFrame(() => {
            // Don't switch while actively scrolling (unless container is gone)
            if (scrolling && document.documentElement.contains(app)) {
                placementThrottled = false;
                return;
            }
            placeUI(app);
            placementThrottled = false;
        });
    }

    // Scroll event with idle detection + first-scroll repair + dock sync
    window.addEventListener('scroll', () => {
        scrolling = true;
        clearTimeout(scrollIdleTimer);

        // Keep docked host aligned while scrolling (portal docking)
        if (app && PLACEMENT.mode !== 'overlay') {
            scheduleDockSync();
        }

        // First-scroll repair (matches reproduction: refresh at top → scroll down → gap)
        if (!didFirstScrollRepair && app) {
            didFirstScrollRepair = true;
            setTimeout(() => {
                repairBookingLayout('first-scroll');
                hiddenRedockNudge();
            }, 0);
        }

        scrollIdleTimer = setTimeout(() => {
            scrolling = false;
            // Now safe to commit placement change
            if (app) placeUI(app);
        }, 150);
    }, { passive: true });

    window.addEventListener('resize', () => {
        checkPlacementThrottled();
        scheduleDockSync();
    }, { passive: true });

    const SELECTORS = {
        search: {
            hotelName: [
                'h2.pp-header__title',
                '[data-testid="header-title"]',
                '.hp__hotel-name',
                'h2.d2fee87262'
            ],
            price: [
                '[data-testid="price-and-discounted-price"]',
                '.bui-price-display__value',
                '.prco-valign-middle-helper',
                '.prco-text-nowrap-helper',
                '[class*="price_display"]'
            ]
        },
        details: {
            hotelName: [
                '#hp_hotel_name h2',           // Most specific: h2 inside the name container
                '#hp_hotel_name_header',
                '.pp-header__title',
                '.hp__hotel-name',
                '[data-testid="header-title"]',
                'h2.d2fee87262',
                '#hp_hotel_name'               // Fallback: full container (needs cleaning)
            ],
            // 2. The DYNAMIC Grand Total (Priority)
            totalPrice: [
                '.js-reservation-total-price',
                '.hprt-reservation-total__price',
                '.hprt-price-price',
                '[data-component="hotel/new-rooms-table/reservation-cta"] .bui-price-display__value',
                '.bui-price-display__value',
                '[data-testid="price-and-discounted-price"]',
                '.bui-heading--large',
                'span[class*="total_price"]',
                '.hprt-reservation-total-price' // One more variation
            ],
            // 3. Fallback / "Cheapest" Price
            fallbackPrice: [
                '.prco-valign-middle-helper',
                '.bui-price-display__value',
                '.prco-text-nowrap-helper'
            ]
        }
    };

    function findElement(selectorList, context = document) {
        for (const selector of selectorList) {
            const el = context.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function isVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    // Helper: Clean hotel name by removing badges/certifications
    function cleanHotelName(rawName) {
        if (!rawName) return null;

        let name = rawName.trim();

        // Remove common badge prefixes (Booking.com adds these as sibling text)
        const badgePrefixes = [
            /^sustainability\s+certification\s*/i,
            /^eco-certified\s*/i,
            /^verified\s*/i,
            /^promoted\s*/i,
            /^sponsored\s*/i,
            /^new\s+to\s+booking\.com\s*/i,
            /^genius\s*/i,
            /^\d+\s*star\s*(hotel)?\s*/i,  // "3 star hotel"
            /^★+\s*/,                       // Star symbols
        ];

        for (const pattern of badgePrefixes) {
            name = name.replace(pattern, '');
        }

        // Remove double "Hotel Hotel" if present
        name = name.replace(/Hotel\s+Hotel/i, 'Hotel');

        // Clean up whitespace
        name = name.replace(/\s+/g, ' ').trim();

        return name || null;
    }

    // --- ITINERARY EXTRACTION ---
    // Extracts stay parameters from Booking.com URL and DOM for /compare API
    function extractItinerary() {
        const url = new URL(window.location.href);
        const params = url.searchParams;

        // Helper: Convert various date formats to YYYY-MM-DD
        function normalizeDate(dateStr) {
            if (!dateStr) return null;

            // Already YYYY-MM-DD?
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

            // Try parsing as Date
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
            return null;
        }

        // Helper: Parse date from DOM text like "Fri, Dec 12, 2024"
        function parseDomDate(text) {
            if (!text) return null;
            const cleaned = text.trim();

            // Try direct parse
            const d = new Date(cleaned);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }

            // Handle "Mon, Dec 12" format (add current/next year)
            const monthMatch = cleaned.match(/([A-Z][a-z]{2})\s+(\d{1,2})/i);
            if (monthMatch) {
                const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
                const monthIdx = months[monthMatch[1]];
                const day = parseInt(monthMatch[2], 10);

                if (monthIdx !== undefined && day) {
                    const now = new Date();
                    let year = now.getFullYear();

                    // If month is in the past, assume next year
                    if (monthIdx < now.getMonth() || (monthIdx === now.getMonth() && day < now.getDate())) {
                        year++;
                    }

                    const result = new Date(year, monthIdx, day);
                    return result.toISOString().split('T')[0];
                }
            }

            return null;
        }

        // 1. Extract dates from URL params (priority)
        // Check for direct date params first (most common)
        let checkIn = params.get('checkin') || params.get('check_in');
        let checkOut = params.get('checkout') || params.get('check_out');

        // Fallback to component date params (checkin_year, checkin_month, checkin_monthday)
        if (!checkIn && params.get('checkin_year')) {
            checkIn = `${params.get('checkin_year')}-${params.get('checkin_month')}-${params.get('checkin_monthday')}`;
        }
        if (!checkOut && params.get('checkout_year')) {
            checkOut = `${params.get('checkout_year')}-${params.get('checkout_month')}-${params.get('checkout_monthday')}`;
        }

        // Normalize to YYYY-MM-DD
        checkIn = normalizeDate(checkIn);
        checkOut = normalizeDate(checkOut);

        // 2. Fallback: Extract dates from DOM
        if (!checkIn || !checkOut) {
            const dateEl = document.querySelector('[data-testid="searchbox-dates-container"]') ||
                document.querySelector('.sb-date-field__display') ||
                document.querySelector('[data-testid="date-display-field-start"]');

            if (dateEl) {
                const raw = dateEl.innerText.replace(/\n/g, ' ');
                const parts = raw.split(/—|-/);

                if (parts.length >= 2) {
                    if (!checkIn) checkIn = parseDomDate(parts[0]);
                    if (!checkOut) checkOut = parseDomDate(parts[1]);
                }
            }
        }

        // 3. Extract adults from URL (default: 2)
        const adultsRaw = params.get('group_adults') || params.get('adults') || params.get('no_rooms');
        const adults = parseInt(adultsRaw, 10) || 2;

        // 4. Extract currency from URL or price element (MUST be ISO 3-letter code)
        // Symbol to ISO mapping
        const SYMBOL_TO_ISO = {
            '€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
            '₩': 'KRW', '₽': 'RUB', '₪': 'ILS', '฿': 'THB', '₫': 'VND',
            'kr': 'SEK', 'kr.': 'ISK', 'ISK': 'ISK', 'DKK': 'DKK', 'NOK': 'NOK', 'SEK': 'SEK'
        };

        // Helper: Validate/normalize currency to ISO 3-letter
        function normalizeCurrency(raw) {
            if (!raw) return null;
            const s = raw.trim().toUpperCase();

            // Already a valid 3-letter ISO code?
            if (/^[A-Z]{3}$/.test(s)) return s;

            // Try symbol mapping
            const mapped = SYMBOL_TO_ISO[raw.trim()] || SYMBOL_TO_ISO[s];
            if (mapped) return mapped;

            return null; // Not a valid currency
        }

        // Try URL params first (most reliable)
        let currency = normalizeCurrency(
            params.get('selected_currency') ||
            params.get('selected_currency_code') ||
            params.get('currency')
        );

        // Fallback: extract from price display
        if (!currency) {
            const priceEl = findElement(SELECTORS.details.totalPrice) || findElement(SELECTORS.details.fallbackPrice);
            if (priceEl) {
                const priceText = priceEl.innerText.trim();

                // Try to match 3-letter code at start (e.g., "EUR 123")
                const codeMatch = priceText.match(/^([A-Z]{3})\s/i);
                if (codeMatch) {
                    currency = codeMatch[1].toUpperCase();
                } else {
                    // Try to match currency symbol
                    const symbolMatch = priceText.match(/^([€$£¥₹₩₽₪฿₫]|kr\.?)/i);
                    if (symbolMatch) {
                        currency = normalizeCurrency(symbolMatch[1]);
                    }
                }
            }
        }

        // Final fallback: null (let Worker decide default)
        // Don't send invalid currencies like "€" or empty strings

        // 5. Get current OTA price (already displayed in UI)
        let currentOtaPriceTotal = null;
        const totalPriceEl = findElement(SELECTORS.details.totalPrice);
        if (totalPriceEl && isVisible(totalPriceEl)) {
            // Extract just the numeric part
            const priceText = totalPriceEl.innerText.trim();
            const numMatch = priceText.replace(/[^\d.,]/g, '');
            if (numMatch) currentOtaPriceTotal = numMatch;
        }

        // 6. Get hotel name (clean badges/certifications)
        const nameEl = findElement(SELECTORS.details.hotelName);
        const hotelName = cleanHotelName(nameEl ? nameEl.innerText : null);

        // 7. Current host
        const currentHost = window.location.hostname;

        // 8. Geo/language hints
        // gl = country code (2-letter ISO 3166-1), hl = language
        // Try to extract country from URL path: /hotel/is/hotelname -> "is" (Iceland)
        const pathMatch = window.location.pathname.match(/\/hotel\/([a-z]{2})\//i);
        let gl = pathMatch ? pathMatch[1].toLowerCase() : null;

        // Fallback: try URL params
        if (!gl) {
            gl = params.get('dest_cc') || params.get('cc1') || params.get('country');
        }

        // Final fallback: default to 'us'
        gl = gl ? gl.toLowerCase() : 'us';

        // Fix #4: Extract hl same way as prefetch (URL lang param first)
        // This ensures ctx key matching between prefetch and hotel page
        const hl = (
            params.get('lang') ||
            document.documentElement.lang ||
            navigator.language ||
            ''
        ).trim();

        return {
            hotelName,
            checkIn,
            checkOut,
            adults,
            currency: currency || null, // null = let Worker decide default
            currentHost,
            currentOtaPriceTotal,
            gl,
            hl
        };
    }

    // Send page context to background (for /compare calls)
    function sendPageContext() {
        const itinerary = extractItinerary();

        // Only send if we have hotel name
        if (!itinerary.hotelName) return;

        // Note: ctx is now managed by background.js using chrome.storage.session
        // The old sessionStorage lookup was loose and could select wrong ctxId
        // Background.js handles ctx lookup based on tabId + itinerary key

        console.log('bookDirect: Sending page context', itinerary);
        console.log('bookDirect: Dates extracted:', itinerary.checkIn, '->', itinerary.checkOut);

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'BOOKDIRECT_PAGE_CONTEXT',
                payload: itinerary
            });
        }
    }

    // Listen for messages from background to resend page context
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'RESEND_PAGE_CONTEXT') {
                console.log('bookDirect: Resending page context on request');
                sendPageContext();
                sendResponse({ sent: true });
            }
        });
    }

    // --- STRATEGY 1: SEARCH PAGE (Floating UI) ---
    function handleSearchPage() {
        if (document.getElementById('hp_hotel_name')) return false;

        const nameEl = findElement(SELECTORS.search.hotelName);
        const priceEl = findElement(SELECTORS.search.price);

        if (nameEl && priceEl) {
            const data = {
                hotelName: nameEl.innerText.trim(),
                price: priceEl.innerText.trim()
            };
            if (!app && window.BookDirect) {
                app = window.BookDirect.createUI(data.hotelName, data.price, false);
                document.body.appendChild(app);
            }
            return true;
        }
        return false;
    }

    // --- STRATEGY 2: DETAILS PAGE (Sidebar Injection) ---
    function handleDetailsPage() {
        console.log('[bookDirect][handleDetailsPage] Starting detection...');

        // First check: Are we on a hotel detail page?
        // Look for elements that only exist on hotel detail pages (not search results)
        const roomTable = document.querySelector('.hprt-table') ||
            document.querySelector('[data-block-id]') ||
            document.querySelector('.roomstable') ||
            document.querySelector('#hprt-table') ||
            document.getElementById('hp_hotel_name');

        // Also check URL pattern for hotel pages
        const isHotelUrl = window.location.pathname.includes('/hotel/');

        console.log('[bookDirect][handleDetailsPage] Detection:', {
            roomTableFound: !!roomTable,
            isHotelUrl,
            pathname: window.location.pathname
        });

        if (!roomTable && !isHotelUrl) {
            console.log('[bookDirect][handleDetailsPage] FAILED: Not a hotel detail page');
            return false;
        }

        // 1. ANCHOR: The "I'll Reserve" Button (specific selectors only, no generic submit)
        const button = document.querySelector('.js-reservation-button') ||
            document.querySelector('button[type="submit"].hprt-reservation-cta__book') ||
            document.querySelector('.hprt-reservation-cta button[type="submit"]') ||
            document.querySelector('button.bui-button--primary[type="submit"]');

        console.log('[bookDirect][handleDetailsPage] Button search:', {
            found: !!button,
            buttonText: button?.innerText?.slice(0, 30) || 'N/A'
        });

        if (!button) {
            console.log('[bookDirect][handleDetailsPage] FAILED: Reserve button not found');
            return false;
        }

        // Traverse UP to find the main sidebar block
        // We look for a parent that contains the whole right-side reservation block
        // .hprt-reservation-cta is usually the small box. We want the parent .hprt-block or similar.
        let scope = button.closest('.hprt-block') ||
            button.closest('.hprt-reservation-cta') ||
            button.closest('aside') ||
            button.parentNode.parentNode; // Fallback

        if (!scope) {
            console.log('bookDirect: Scope not found, using body');
            scope = document.body;
        }

        // DEBUG: Visualize the Scope
        // scope.style.border = '2px dashed blue'; // REMOVED FOR PRODUCTION

        const nameEl = findElement(SELECTORS.details.hotelName);
        const hotelName = cleanHotelName(nameEl ? nameEl.innerText : null) || 'Hotel';

        function getBestPrice() {
            // Search inside the expanded SCOPE
            let totalEl = findElement(SELECTORS.details.totalPrice, scope);

            // Validation: Must be visible and have numbers
            if (totalEl && isVisible(totalEl) && /\d/.test(totalEl.innerText)) {
                // SUCCESS
                // totalEl.style.border = '3px solid #00FF00'; // REMOVED FOR PRODUCTION

                // Clear fallback
                const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
                if (fallbackEl) fallbackEl.style.outline = '';

                return totalEl.innerText.trim();
            }

            // FALLBACK
            const fallbackEl = findElement(SELECTORS.details.fallbackPrice);
            if (fallbackEl) {
                // fallbackEl.style.outline = '3px solid #FF0000'; // REMOVED FOR PRODUCTION
                if (totalEl) totalEl.style.border = '';
                return fallbackEl.innerText.trim();
            }

            return 'Select Room';
        }

        const initialPrice = getBestPrice();

        if (!app && window.BookDirect) {
            app = window.BookDirect.createUI(hotelName, initialPrice, true);

            // Store the button we found as initial anchor
            reserveButton = button;

            console.log('[bookDirect][handleDetailsPage] UI created, using dock/float placement');

            // Initial placement using dock/float system
            placeUI(app);

            // Initialize repair system to fix layout issues after injection
            initRepairSystem();

            // Watch for Booking.com hydration removing our element
            // This happens on page refresh when Booking re-renders the sidebar
            let hydrationCheckCount = 0;
            const maxHydrationChecks = 10;

            const checkHydrationAndPlace = () => {
                hydrationCheckCount++;

                // Re-find best visible button (Booking may have swapped DOM)
                reserveButton = findBestReserveButton(reserveButton);

                // Check if app still in DOM (use documentElement for floating mode)
                if (!document.documentElement.contains(app)) {
                    console.log(`[bookDirect][hydration-guard] ⚠️ App removed, re-placing (check ${hydrationCheckCount}/${maxHydrationChecks})`);
                }

                // Always go through dock/float logic (handles both re-injection and mode switching)
                placeUI(app);

                // Schedule more checks during hydration window
                if (hydrationCheckCount < maxHydrationChecks) {
                    setTimeout(checkHydrationAndPlace, 500);
                }
            };

            // Check frequently during first few seconds to catch hydration
            setTimeout(checkHydrationAndPlace, 300);
            setTimeout(checkHydrationAndPlace, 600);
            setTimeout(checkHydrationAndPlace, 1000);
            setTimeout(checkHydrationAndPlace, 2000);
            setTimeout(checkHydrationAndPlace, 3000);

        } else if (app && app.updatePrice) {
            app.updatePrice(initialPrice);
            // Ensure placement is correct on update too
            placeUI(app);
        }

        function getRoomDetails() {
            const selects = document.querySelectorAll('.hprt-nos-select, select');
            let details = [];

            selects.forEach(sel => {
                if (sel.value && parseInt(sel.value) > 0) {
                    const count = sel.value;
                    const row = sel.closest('tr');
                    let roomName = '';

                    if (row) {
                        // HELPER: Find Room Name (handle rowspan)
                        let current = row;
                        while (current) {
                            const nameLink = current.querySelector('.hprt-roomtype-icon-link') ||
                                current.querySelector('.hprt-roomtype-name');
                            if (nameLink) {
                                roomName = nameLink.innerText.trim();
                                break;
                            }
                            // Move up to find the parent row that 'spans' down
                            current = current.previousElementSibling;
                        }

                        // EXTRA: Check for "Breakfast included" to differentiate
                        // Look in the current row's conditions column
                        const conditions = row.innerText;
                        if (conditions.toLowerCase().includes('breakfast included')) {
                            roomName += ' (Breakfast included)';
                        }

                        // EXTRA: Capture Price for this specific row
                        // Price is usually in the "Price for X nights" column
                        const priceEl = row.querySelector('.bui-price-display__value') ||
                            row.querySelector('.prco-valign-middle-helper') ||
                            row.querySelector('[data-testid="price-and-discounted-price"]');

                        if (priceEl) {
                            roomName += ` (~${priceEl.innerText.trim()})`;
                        }
                    }

                    // Fallback check (if empty)
                    if (!roomName) return;

                    // FILTER: Remove garbage
                    // 1. Discard if it contains "Max. people" (occupancy info)
                    if (roomName.includes('Max. people')) return;

                    // 2. Discard if it starts with a number (likely a date row if table structure is weird)
                    if (/^\d/.test(roomName)) return;

                    details.push(`${count}x ${roomName}`);
                }
            });

            return details.join('\n');
        }

        // Observer on the SCOPE (Broader watch)
        if (app && app.updatePrice) {
            const observer = new MutationObserver(() => {
                const currentPrice = getBestPrice();
                app.updatePrice(currentPrice);

                // ALSO Update Details
                const currentDetails = getRoomDetails();
                if (app.updateDetails) app.updateDetails(currentDetails);
            });
            observer.observe(scope, { subtree: true, childList: true, characterData: true, attributes: true });

            // Initial Call
            const initialDetails = getRoomDetails();
            if (app.updateDetails) app.updateDetails(initialDetails);
        }

        return true;
    }

    function inject() {
        console.log('[bookDirect][inject] Called. State:', {
            hasBookDirectInjected: window.hasBookDirectInjected,
            appExists: !!app,
            appInDOM: app ? document.documentElement.contains(app) : 'N/A',
            BookDirectExists: !!window.BookDirect
        });

        // Handle bfcache (back/forward navigation) - if app exists but is not in DOM, reset
        // Use documentElement.contains because floating mode appends to documentElement
        if (app && !document.documentElement.contains(app)) {
            console.log('[bookDirect][inject] App reference stale (not in DOM), resetting');
            app = null;
            window.hasBookDirectInjected = false;
        }

        if (window.hasBookDirectInjected && app) {
            console.log('[bookDirect][inject] BLOCKED: Already injected and app exists');
            return;
        }
        if (!window.BookDirect) {
            console.log('[bookDirect][inject] BLOCKED: window.BookDirect not available');
            return;
        }

        // NOTE: Search results prefetch is handled by the immediate page router IIFE
        // which runs before this hotel-page IIFE and sets window.__bookDirect_isSearchPage

        console.log('[bookDirect][inject] Calling handleDetailsPage()...');
        if (handleDetailsPage()) {
            window.hasBookDirectInjected = true;
            // Send page context to background for price comparison
            sendPageContext();

            const FLAGS = window.BookDirect?.DEBUG_FLAGS || {};

            // ✅ NUCLEAR FIX: Prevent horizontal scroll drift caused by Booking.com's layout quirk
            // (Booking's carousel/grid elements can be a few pixels wider than viewport)
            // DEBUG: Skip if disabled
            if (FLAGS.ENABLE_OVERFLOW_FIX !== false) {
                document.documentElement.style.overflowX = 'hidden';
                document.body.style.overflowX = 'hidden';
                // Keep Booking's sticky measurements in sync after overflow change
                requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
            } else {
                console.log('[bookDirect][debug] overflow-x:hidden disabled via DEBUG_FLAGS');
            }

            // 🔍 OVERFLOW DIAGNOSTICS: Hook room select and scrollX watcher for debugging
            // Filter console by [bookDirect][overflow] to see metrics and offender elements
            // DEBUG: Skip if disabled
            if (FLAGS.ENABLE_DIAGNOSTICS !== false && window.bookDirectOverflowDiagnostics) {
                window.bookDirectOverflowDiagnostics.hookRoomSelect();
                window.bookDirectOverflowDiagnostics.hookScrollXWatcher();
            } else if (FLAGS.ENABLE_DIAGNOSTICS === false) {
                console.log('[bookDirect][debug] Diagnostics disabled via DEBUG_FLAGS');
            }

            // ✅ ROOM SELECT STABILIZER: fixes the "gap" that appears after changing room dropdowns
            // DEBUG: Skip if disabled
            if (FLAGS.ENABLE_ROOM_SELECT_STABILIZER !== false) {
                armRoomSelectStabilizer();
            } else {
                console.log('[bookDirect][debug] Room select stabilizer disabled via DEBUG_FLAGS');
            }

            return;
        }

        // NOTE: Search page handler disabled - the negotiation UI only makes sense
        // when viewing a specific hotel, not when browsing search results.
        // if (handleSearchPage()) {
        //     window.hasBookDirectInjected = true;
        //     return;
        // }
    }

    // --- INITIALIZATION: MutationObserver Pattern ---
    // Watch for DOM changes until hotel title element exists
    function waitForHotelElement() {
        console.log('[bookDirect][waitForHotelElement] Called. hasBookDirectInjected:', window.hasBookDirectInjected);

        // Already injected? Done.
        if (window.hasBookDirectInjected) {
            console.log('[bookDirect][waitForHotelElement] BLOCKED: Already injected');
            return;
        }

        // Check if BookDirect UI factory is available
        if (!window.BookDirect) {
            console.log('[bookDirect][waitForHotelElement] Waiting for BookDirect factory...');
            // Factory not loaded yet, retry shortly
            requestAnimationFrame(waitForHotelElement);
            return;
        }

        // Check for hotel name element (the anchor we need)
        const hotelNameSelectors = [
            ...SELECTORS.details.hotelName,
            ...SELECTORS.search.hotelName
        ];

        const hotelNameEl = findElement(hotelNameSelectors);

        if (hotelNameEl) {
            // Hotel element found! Attempt injection
            console.log('bookDirect: Hotel element found, attempting injection');
            inject();
            return;
        }

        // Element not found yet - set up observer to watch for it
        console.log('bookDirect: Waiting for hotel element...');

        const observer = new MutationObserver((mutations, obs) => {
            // Already injected? Stop observing.
            if (window.hasBookDirectInjected) {
                obs.disconnect();
                return;
            }

            // Check again for hotel name element
            const el = findElement(hotelNameSelectors);
            if (el) {
                console.log('bookDirect: Hotel element appeared, triggering injection');
                obs.disconnect();
                inject();
            }
        });

        // Observe the entire document body for new nodes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Safety timeout: Stop observing after 30 seconds to avoid memory leaks
        setTimeout(() => {
            if (!window.hasBookDirectInjected) {
                console.log('bookDirect: Timeout - stopping observer');
                observer.disconnect();
            }
        }, 30000);
    }

    // Handle bfcache (back-forward cache) restores
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            console.log('bookDirect: Page restored from bfcache, re-checking injection');
            // Reset injection flag if app is not in DOM (use documentElement for floating mode)
            if (app && !document.documentElement.contains(app)) {
                app = null;
                window.hasBookDirectInjected = false;
            }
            inject();
        }
    });

    // Start watching once DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForHotelElement);
    } else {
        // DOM already loaded - check immediately
        waitForHotelElement();
    }

})();
