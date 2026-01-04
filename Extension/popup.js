document.getElementById('scanBtn').addEventListener('click', async () => {
    const resultDiv = document.getElementById('result');

    // 1. UI Reset
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
        <div style="text-align:center; padding:10px;">
            <div style="font-size:24px;">🛡️</div>
            <strong>Running Forensics...</strong><br>
            <span style="font-size:12px; color:#666;">Analyzing Visuals, Links & Database</span>
        </div>`;
    resultDiv.style.background = "#f9f9f9";
    resultDiv.style.border = "none";

    // 2. Find the active tab
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
        resultDiv.innerText = "Error: No active tab found.";
        return;
    }

    // 3. BLUR PAGE (Safety First)
    chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        css: "body { filter: blur(5px); transition: 0.5s; }"
    });

    // 4. CAPTURE SCREENSHOT (Vision)
    let screenshotUrl = null;
    try {
        screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 });
    } catch (e) {
        console.log("Screenshot failed (likely restricted page):", e);
    }

    // 5. EXTRACT TEXT & FORM DATA
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: async () => {
            try {
                const text = document.body.innerText;
                const links = Array.from(document.querySelectorAll('a')).map(a => a.href).slice(0, 10).join('\n');

                // Find Form Destinations
                const forms = Array.from(document.querySelectorAll('form'));
                let formActions = "No forms found.";
                if (forms.length > 0) {
                    formActions = forms.map(f => f.action || "Unspecified Destination").join('\n');
                }

                return `--- TEXT ---\n${text}\n\n--- LINKS ---\n${links}\n\n--- FORM DESTINATIONS ---\n${formActions}`;
            } catch (e) { return null; }
        }
    }, async (results) => {

        if (chrome.runtime.lastError || !results || !results[0]) {
            resultDiv.innerText = "Error reading page. Refresh and try again.";
            chrome.scripting.insertCSS({ target: { tabId: tab.id }, css: "body { filter: none; }" });
            return;
        }

        // 6. SEND TO PYTHON BRAIN
        try {
            const response = await fetch("http://127.0.0.1:5000/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: results[0].result,
                    image: screenshotUrl
                })
            });

            const data = await response.json();
            const score = parseInt(data.confidence_score) || 0;
            const hackerDest = data.hacker_dest || "Unknown Destination";

            // --- 7. HANDLE RESULTS ---
            let color = "#10b981"; // Safe Green
            let status = "SAFE";
            let bgColor = "#ecfdf5";

            if (score >= 80) {
                // 🔴 MALICIOUS - ACTIVATE DEFENSE
                color = "#ef4444";
                status = "PHISHING ATTACK";
                bgColor = "#fef2f2";

                // A. Voice Alert
                let speech = new SpeechSynthesisUtterance("Warning. Phishing attack blocked.");
                window.speechSynthesis.speak(speech);

                // B. SHADOW DOM OVERLAY (The Shield)
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    args: [hackerDest],
                    function: (dest) => {
                        // Clean old overlay if any
                        const oldHost = document.getElementById('ScamRay-host');
                        if (oldHost) oldHost.remove();

                        // Create Host & Shadow Root
                        const host = document.createElement('div');
                        host.id = 'ScamRay-host';
                        document.documentElement.appendChild(host);
                        const shadow = host.attachShadow({ mode: 'open' });

                        // Inject Styles
                        const style = document.createElement('style');
                        style.textContent = `
                            .overlay {
                                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                                background: linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%);
                                color: white; z-index: 2147483647;
                                display: flex; flex-direction: column; align-items: center; justify-content: center;
                                text-align: center; font-family: sans-serif;
                            }
                            h1 { font-size: 3rem; margin: 0; font-weight: 800; }
                            p { font-size: 1.2rem; max-width: 600px; margin: 10px 0 30px; }
                            code { background: rgba(0,0,0,0.3); padding: 5px 10px; border-radius: 5px; color: #fca5a5; }
                            .btn-container { display: flex; gap: 20px; }
                            button { padding: 15px 30px; font-size: 1.1rem; cursor: pointer; border-radius: 8px; font-weight: bold; border: none; }
                            .btn-report { background: white; color: #991b1b; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: 0.2s; }
                            .btn-report:active { transform: scale(0.95); }
                            .btn-unsafe { background: transparent; color: white; border: 2px solid white; }
                        `;
                        shadow.appendChild(style);

                        // Inject HTML
                        const container = document.createElement('div');
                        container.className = 'overlay';
                        container.innerHTML = `
                            <div style="font-size: 50px; margin-bottom: 20px;">🛡️</div>
                            <h1>ScamRay BLOCKED THIS SITE</h1>
                            <p>
                                This page is unsafe. It attempts to send your data to:<br>
                                <code>${dest}</code>
                            </p>
                            <div class="btn-container">
                                <button id="btn-report" class="btn-report">🚨 REPORT ATTACK</button>
                                <button id="btn-unsafe" class="btn-unsafe">I Understand the Risk</button>
                            </div>
                        `;
                        shadow.appendChild(container);

                        // --- C. BUTTON LISTENERS (INSIDE SHADOW DOM) ---

                        // Report Button Logic (Connects to Firebase via Python)
                        shadow.getElementById('btn-report').addEventListener('click', async () => {
                            const btn = shadow.getElementById('btn-report');
                            const originalText = btn.innerText;

                            btn.innerText = "Sending...";
                            btn.style.opacity = "0.7";

                            try {
                                await fetch("http://127.0.0.1:5000/report", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        url: window.location.href,
                                        destination: dest
                                    })
                                });

                                // Success State
                                btn.innerText = "✅ Reported to Google Cloud";
                                btn.style.background = "#d1fae5";
                                btn.style.color = "#065f46";
                                alert("SUCCESS: Threat saved to Firebase Firestore!");

                            } catch (err) {
                                console.error(err);
                                btn.innerText = "❌ Connection Failed";
                                setTimeout(() => { btn.innerText = originalText; btn.style.opacity = "1"; }, 2000);
                            }
                        });

                        // Unsafe Override Button
                        shadow.getElementById('btn-unsafe').addEventListener('click', () => {
                            host.remove();
                        });
                    }
                });

            } else {
                // 🟢 SAFE - Unblur
                chrome.scripting.insertCSS({ target: { tabId: tab.id }, css: "body { filter: none; }" });
            }

            // 8. UPDATE EXTENSION PANEL
            resultDiv.innerHTML = `
                <h3 style="color: ${color}; margin: 5px 0;">${status}</h3>
                
                <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="font-size:12px;">RISK:</strong> 
                    <span style="color: ${color}; font-weight: 800;">${score}%</span>
                    <div style="flex-grow:1; height: 8px; background: #ddd;"><div style="width: ${score}%; height: 100%; background: ${color};"></div></div>
                </div>

                <p style="font-size: 12px; color: #444; margin-top:10px;">${data.explanation}</p>
                
                ${score >= 50 ? `
                <div style="margin-top:10px; padding:8px; background:#fff; border:1px dashed #ccc; font-size:11px; border-radius:4px;">
                    <strong>🕵️‍♂️ Data Destination:</strong><br>
                    <code style="color:#d63384; word-break:break-all;">${hackerDest}</code>
                </div>` : ''}
            `;

            resultDiv.style.border = `2px solid ${color}`;
            resultDiv.style.backgroundColor = bgColor;

        } catch (error) {
            console.error(error);
            resultDiv.innerHTML = `<span style="color:red"><b>Server Error</b><br>Is Python running?</span>`;
            chrome.scripting.insertCSS({ target: { tabId: tab.id }, css: "body { filter: none; }" });
        }
    });
});