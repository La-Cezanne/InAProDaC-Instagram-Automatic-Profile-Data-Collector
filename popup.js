document.getElementById("download").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "GET_PROFILES" }, (profiles) => {
      if (!profiles || profiles.length === 0) {
        alert("No profiles collected yet.");
        return;
      }
  
      const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "instagram_profiles.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  });
  
  document.getElementById("clear").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_PROFILES" }, (success) => {
      if (success) {
        alert("Profiles cleared!");
      }
    });
  });