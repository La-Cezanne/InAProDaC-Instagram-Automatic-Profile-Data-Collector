// content.js
// Robust SPA navigation detection + scraping for Instagram profiles.
// - Injects a small page-script to patch history.pushState/replaceState and dispatch a 'locationchange' event.
// - Listens for that event + popstate + hashchange.
// - Has a polling fallback in case injection is blocked by CSP.
// - Re-attaches a MutationObserver after each navigation to detect dynamic loading of profile DOM.

(function () {
    const DEBUG = true;
    const log = (...args) => { if (DEBUG) console.log('[InstaScraper]', ...args); };
  
    // --- Helpers ---
    function getUsernameFromUrl() {
      // pathname like "/username/" or "/username"
      const m = location.pathname.match(/^\/([^\/?#]+)\/?/);
      if (!m) return null;
      const candidate = m[1];
      // ignore known non-profile paths (basic)
      if (!candidate || ['explore', 'p', 'stories', 'accounts', 'tags'].includes(candidate)) return null;
      return candidate;
    }
  
    function parseFollowers(text) {
      if (!text) return null;
      text = text.replace(/\s+/g, '').replace(/,/g, '').trim();
      // match e.g. "1.2K", "3.4M", "1234"
      let m = text.match(/^([\d,.]+)([KMB])?$/i);
      if (!m) {
        const n = parseInt(text.replace(/[^\d]/g, ''), 10);
        return isNaN(n) ? null : n;
      }
      let num = parseFloat(m[1].replace(',', ''));
      let suf = (m[2] || '').toUpperCase();
      if (suf === 'K') return Math.round(num * 1_000);
      if (suf === 'M') return Math.round(num * 1_000_000);
      if (suf === 'B') return Math.round(num * 1_000_000_000);
      return Math.round(num);
    }
  
    function extractFollowersTextFromStatsLI(li) {
      if (!li) return null;
      const txt = li.innerText || '';
      const m = txt.match(/([\d,\.]+(?:[KMB])?)/i);
      return m ? m[1] : null;
    }

    function getBio() {
        // Outer div that wraps the name and bio; adjust selector if needed
        const outerDiv = document.querySelector('div.x7a106z');
        if (!outerDiv) return "";
      
        // Find all child elements recursively and collect visible text
        const allTextNodes = [];
      
        const walker = document.createTreeWalker(
          outerDiv,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              // Skip empty or whitespace-only nodes
              if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      
              // Skip text inside buttons (like "see more")
              const parent = node.parentElement;
              if (parent && parent.getAttribute('role') === 'button') return NodeFilter.FILTER_REJECT;
      
              return NodeFilter.FILTER_ACCEPT;
            }
          },
          false
        );
      
        let node;
        while ((node = walker.nextNode())) {
          allTextNodes.push(node.nodeValue.trim());
        }
      
        // Join all text nodes with spaces or newlines
        return allTextNodes.join(' ').replace(/\s+/g, ' ').trim();
      }
      
      
  
    // --- Scraping logic ---
    let lastUrl = location.href;
    let lastUsername = null;       // username from last observed URL
    let lastScrapedUsername = null; // username we last sent a message for (avoid duplicates while DOM mutates)
    let domObserver = null;
  
    function attemptScrape() {
      const username = getUsernameFromUrl();
      if (!username) return false;
  
      const profileName = document.querySelector('header h2, header h1')?.innerText?.trim() || null;
      const stats = document.querySelectorAll('header ul li');
      const followersText = extractFollowersTextFromStatsLI(stats[1]); // second li is usually followers
      const followers = parseFollowers(followersText);
      const bio = getBio();
  
      if (profileName && followers != null && !isNaN(followers)) {
        if (lastScrapedUsername === username) {
          log('Already scraped this username recently:', username);
          return true;
        }
  
        lastScrapedUsername = username; // prevent immediate duplicates while DOM still mutates
        const data = {
          id: username,            // stable id based on URL path
          name: profileName,
          followers: followers,
          bio: bio || "",
          url: location.href,
          timestamp: new Date().toISOString()
        };
        chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', data });
        log('Scraped and sent:', data);
        return true;
      }
      return false;
    }
  
    function attachDomObserver() {
      if (domObserver) {
        try { domObserver.disconnect(); } catch (e) { /* ignore */ }
        domObserver = null;
      }
      domObserver = new MutationObserver(() => {
        if (attemptScrape()) {
          // Disconnect to reduce noise; it will be reattached on the next nav.
          try { domObserver.disconnect(); } catch (e) {}
          domObserver = null;
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
      log('DOM observer attached');
    }
  
    function onUrlChangeDetected() {
      const username = getUsernameFromUrl();
      log('URL changed ->', location.href, 'username=', username);
  
      if (username && username !== lastUsername) {
        lastUsername = username;
        lastScrapedUsername = null; // allow scraping again for new profile
        // small delay to allow SPA to update page structure
        setTimeout(() => {
          attemptScrape();      // try immediately (in case content is already present)
          attachDomObserver();  // observe loading if content isn't ready
        }, 150);
      } else {
        // changed to non-profile (or same profile), reattach observer just in case
        setTimeout(() => {
          attachDomObserver();
        }, 150);
      }
    }
  
    // --- History API injection (page context) ---
    function injectHistoryListener() {
        try {
        // Send a message to background to inject script via chrome.scripting.executeScript
        chrome.runtime.sendMessage({ type: 'INJECT_HISTORY_LISTENER' });
        } catch (err) {
        // fallback: log error, polling still works
        console.error('History injection failed, falling back to polling. Error:', err);
        }
    }
  
  
    // --- Setup listeners & fallback polling ---
    injectHistoryListener();
    window.addEventListener('locationchange', onUrlChangeDetected);
    window.addEventListener('popstate', onUrlChangeDetected);
    window.addEventListener('hashchange', onUrlChangeDetected);
  
    // Polling fallback (robust but light): check url every 1000ms
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // generate the same event path for unified handling
        window.dispatchEvent(new Event('locationchange'));
      }
    }, 1000);
  
    // Start immediately (initial page load)
    lastUrl = location.href;
    onUrlChangeDetected();
  })();
  