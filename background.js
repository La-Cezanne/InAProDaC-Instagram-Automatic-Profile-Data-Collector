chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SAVE_PROFILE") {
      const entry = msg.data; // now includes .bio
      chrome.storage.local.get({ profiles: [] }, (result) => {
        const profiles = result.profiles;
        if (!profiles.some(p => p.id === entry.id)) {
          profiles.push(entry);
          chrome.storage.local.set({ profiles }, () => {
            console.log("Profile saved:", entry);
          });
        } else {
          console.log("Duplicate ignored:", entry.id);
        }
      });
    } else if (msg.type === "GET_PROFILES") {
      chrome.storage.local.get({ profiles: [] }, (result) => {
        sendResponse(result.profiles);
      });
      return true;
    } else if (msg.type === "CLEAR_PROFILES") {
      chrome.storage.local.set({ profiles: [] }, () => { sendResponse(true); });
      return true;
    }
  });
  
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'INJECT_HISTORY_LISTENER' && sender.tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        func: () => {
          const wrap = (type) => {
            const orig = history[type];
            return function () {
              const res = orig.apply(this, arguments);
              window.dispatchEvent(new Event('locationchange'));
              return res;
            };
          };
          history.pushState = wrap('pushState');
          history.replaceState = wrap('replaceState');
          window.addEventListener('popstate', () => {
            window.dispatchEvent(new Event('locationchange'));
          });
        },
      }).catch(err => console.error('Injection failed:', err));
    }
  });
  
  