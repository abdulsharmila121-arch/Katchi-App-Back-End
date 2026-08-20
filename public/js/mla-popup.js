document.addEventListener("DOMContentLoaded", function () {
    // 1. Inject Modern Styles with Full Image & Animated Border Line
    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Mukta+Malar:wght@400;600;700;800&display=swap');

        .mla-popup-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.75);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex; justify-content: center; align-items: center;
            z-index: 99999;
            opacity: 0; visibility: hidden;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            font-family: 'Mukta Malar', 'Segoe UI', sans-serif;
        }
        .mla-popup-overlay.active {
            opacity: 1; visibility: visible;
        }
        .mla-popup-card {
            background: #ffffff;
            width: 92%; max-width: 440px;
            padding: 30px 24px 25px 24px;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
            position: relative;
            transform: scale(0.7) translateY(30px);
            transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
            border: 1px solid rgba(255, 255, 255, 0.4);
            overflow: hidden;
        }
        .mla-popup-overlay.active .mla-popup-card {
            transform: scale(1) translateY(0);
        }
        .mla-popup-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 7px;
            background: linear-gradient(90deg, #ff4e50, #f9d423);
        }
        .mla-close-btn {
            position: absolute; top: 15px; right: 18px;
            width: 32px; height: 32px;
            border-radius: 50%;
            background: #f1f5f9;
            font-size: 20px; font-weight: bold; color: #64748b;
            cursor: pointer; border: none;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
            z-index: 2;
        }
        .mla-close-btn:hover { background: #fee2e2; color: #ef4444; }
        
        .mla-badge {
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: #ffffff;
            padding: 7px 18px; border-radius: 30px;
            font-size: 14px; font-weight: 700;
            display: inline-block; margin-bottom: 15px;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
            letter-spacing: 0.5px;
        }

        .mla-img-wrapper {
            position: relative;
            display: inline-block;
            width: 170px;
            height: 170px;
            margin-bottom: 15px;
            border-radius: 12px;
            overflow: hidden;
            padding: 4px;
            background: #0f172a;
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
        }

        .mla-img-wrapper::before {
            content: '';
            position: absolute;
            top: -50%; left: -50%;
            width: 200%; height: 200%;
            background: conic-gradient(transparent, transparent, transparent, #2563eb, #38bdf8);
            animation: rotateBorder 3s linear infinite;
        }

        @keyframes rotateBorder {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .mla-img {
            position: relative;
            width: 100%; height: 100%;
            object-fit: cover;
            border-radius: 8px;
            z-index: 1;
            display: block;
        }

        .mla-name { 
            font-size: 22px; 
            font-weight: 800; 
            margin: 4px 0 2px 0; 
            color: #0f172a; 
        }

        .mla-party-tag {
            font-size: 14px;
            font-weight: 700;
            color: #15803d;
            background: #f0fdf4;
            padding: 4px 14px;
            border-radius: 8px;
            display: inline-block;
            margin-bottom: 14px;
            border: 1px solid #bbf7d0;
        }

        .mla-dialogue-box {
            background: linear-gradient(135deg, #fff7ed, #ffedd5);
            border-left: 4px solid #f97316;
            color: #9a3412;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 15px;
            font-style: italic;
            box-shadow: 0 2px 6px rgba(249, 115, 22, 0.1);
        }

        .mla-info-box { 
            font-size: 15px; 
            color: #334155; 
            background: #f8fafc; 
            padding: 14px 16px; 
            border-radius: 14px; 
            text-align: left;
            border: 1px solid #e2e8f0;
        }
        .mla-info-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        .mla-info-row:last-child { margin-bottom: 0; }
        .mla-info-label { font-weight: 600; color: #64748b; font-size: 14px; }
        .mla-info-val { font-weight: 700; color: #1e293b; }
    `;
    document.head.appendChild(style);

    // 2. Inject Popup HTML
    const popupHTML = `
        <div id="mlaPopupOverlay" class="mla-popup-overlay">
            <div class="mla-popup-card">
                <button class="mla-close-btn" id="closeMlaBtn">&times;</button>
                <span class="mla-badge" id="popupThoguthiName">தொகுதி விவரம்</span>
                <br>
                <div class="mla-img-wrapper">
                    <img id="popupMlaPhoto" src="" alt="MLA Photo" class="mla-img">
                </div>
                <div class="mla-name" id="popupMlaName">-</div>
                <div class="mla-party-tag" id="popupMlaParty">-</div>

                <div class="mla-dialogue-box" id="popupMlaDialogue">
                    "மக்களின் குரலாய்... என்றும் களத்தில் உங்களோடு!"
                </div>
                
                <div class="mla-info-box">
                    <div class="mla-info-row">
                        <span class="mla-info-label">பதவி:</span>
                        <span class="mla-info-val" style="color: #2563eb;">சட்டமன்ற உறுப்பினர் (MLA)</span>
                    </div>
                    <div class="mla-info-row">
                        <span class="mla-info-label">தொடர்பு எண்:</span>
                        <span class="mla-info-val" id="popupMlaPhone">-</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', popupHTML);

    // Close Events
    document.getElementById('closeMlaBtn').addEventListener('click', closeMlaPopup);
    document.getElementById('mlaPopupOverlay').addEventListener('click', function(e) {
        if (e.target === this) closeMlaPopup();
    });

    // 3. CONSTITUENCY DROPDOWN CHANGE HANDLER
    const constituencySelect = document.querySelector('select#constituency') || 
                               document.querySelector('select#thoguthi') || 
                               document.querySelector('select[name="constituency"]') || 
                               document.querySelector('select[name="thoguthi"]');

    if (constituencySelect) {
        // மக்கள் படிவம் (Public Form)-ல் Popup தோன்றாமல் தடுக்க
        const isPublicForm = constituencySelect.closest('#publicGrievanceForm') || 
                             constituencySelect.closest('.public-form') ||
                             document.body.classList.contains('public-page');

        if (!isPublicForm) {
            constituencySelect.addEventListener('change', async function (e) {
                const selectedConstituency = e.target.value;
                if (!selectedConstituency) return;

                let mlaInfo = null;

                // 1. Fetch from Database / API
                try {
                    const response = await fetch(`/api/mla/${encodeURIComponent(selectedConstituency)}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success) mlaInfo = data;
                    }
                } catch (err) {
                    console.log("Database fetch failed, fallback to local mlaData");
                }

                // 2. Fallback to local mlaData
                if (!mlaInfo && typeof mlaData !== 'undefined' && mlaData[selectedConstituency]) {
                    mlaInfo = mlaData[selectedConstituency];
                }

                // 3. Populate Modal
                if (mlaInfo) {
                    document.getElementById('popupThoguthiName').innerText = selectedConstituency + " தொகுதி";
                    document.getElementById('popupMlaName').innerText = mlaInfo.name || "விவரம் இல்லை";
                    document.getElementById('popupMlaParty').innerText = "கட்சி: " + (mlaInfo.party || "-");
                    document.getElementById('popupMlaPhone').innerText = mlaInfo.phone || mlaInfo.mobile || "தொடர்பு எண் இல்லை";

                    const photoElement = document.getElementById('popupMlaPhoto');
                    let imageSrc = mlaInfo.photo || mlaInfo.profileImage;
                    
                    if (!imageSrc) {
                        imageSrc = `/mlas/${selectedConstituency}.jpg`;
                    }

                    photoElement.src = imageSrc;

                    photoElement.onerror = function() {
                        this.src = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
                    };

                    const dialogue = mlaInfo.dialogue || `"மக்களின் குரலாய்... என்றும் களத்தில் உங்களோடு!"`;
                    document.getElementById('popupMlaDialogue').innerText = dialogue;

                    // Show Modal
                    document.getElementById('mlaPopupOverlay').classList.add('active');

                    // Auto Close after 5 Seconds
                    setTimeout(() => {
                        closeMlaPopup();
                    }, 5000);
                }
            });
        }
    }
});

function closeMlaPopup() {
    const overlay = document.getElementById('mlaPopupOverlay');
    if (overlay) overlay.classList.remove('active');
}