const { chromium } = require('playwright');

async function generateReceiptPDF(complaint) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="ta">
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; font-family: 'Noto Sans Tamil', 'Segoe UI', sans-serif; }
            body { background-color: #f4f6f9; margin: 0; padding: 20px; }
            .receipt-container { 
                max-width: 750px; 
                margin: 0 auto; 
                background: #ffffff; 
                border-radius: 12px; 
                border: 2px solid #1e3c72;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1); 
                overflow: hidden; 
            }
            .header { 
                background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                color: #ffffff; 
                padding: 25px 20px; 
                text-align: center; 
            }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
            .header p { margin: 5px 0 0 0; font-size: 13px; opacity: 0.9; }
            .content { padding: 25px; }
            .badge-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 12px; }
            .id-badge { background: #e0f2fe; color: #0369a1; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 14px; }
            .date-badge { color: #64748b; font-size: 13px; font-weight: 500; }
            
            .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .info-table th, .info-table td { padding: 12px 15px; text-align: left; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
            .info-table th { width: 35%; background: #f8fafc; color: #334155; font-weight: 600; }
            .info-table td { color: #0f172a; font-weight: 500; }
            
            .desc-box { background: #f8fafc; border-left: 4px solid #1e3c72; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 20px; }
            .desc-title { font-weight: 700; color: #1e3c72; font-size: 14px; margin-bottom: 6px; }
            .desc-text { color: #334155; font-size: 13px; line-height: 1.6; margin: 0; text-align: justify; }

            .footer-status { 
                background: #f0fdf4; 
                border: 1px solid #bbf7d0; 
                color: #15803d; 
                text-align: center; 
                padding: 12px; 
                border-radius: 8px; 
                font-weight: 700; 
                font-size: 14px; 
                margin-bottom: 20px;
            }

            /* கம்பீரமான மக்கள் நம்பிக்கை முழக்கம் கார்டு */
            .slogan-card {
                background: linear-gradient(135deg, #1e3c72 0%, #0f172a 100%);
                color: #ffffff;
                padding: 18px 20px;
                border-radius: 8px;
                text-align: center;
                border-top: 4px solid #f59e0b;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
            }
            .slogan-title {
                font-size: 16px;
                font-weight: 700;
                color: #fbbf24;
                letter-spacing: 0.5px;
                margin-bottom: 5px;
            }
            .slogan-text {
                font-size: 13px;
                font-weight: 500;
                color: #e2e8f0;
                margin: 0;
                line-height: 1.5;
            }

            .footer-note { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="receipt-container">
            <div class="header">
                <h1>🏛️ பொதுமக்கள் குறைதீர்ப்பு சேவை</h1>
                <p>அதிகாரப்பூர்வ மனு பதிவு மற்றும் ஒப்புதல் சீட்டு</p>
            </div>
            
            <div class="content">
                <div class="badge-row">
                    <div class="id-badge">மனு ID: ${complaint.grievanceId || complaint.id || 'N/A'}</div>
                    <div class="date-badge">📅 தேதி: ${complaint.createdDate || new Date().toLocaleDateString('ta-IN')}</div>
                </div>

                <table class="info-table">
                    <tr>
                        <th>👤 மனுதாரர் பெயர்</th>
                        <td>${complaint.citizenName || complaint.applicantName || 'N/A'}</td>
                    </tr>
                    <tr>
                        <th>📱 அலைபேசி எண்</th>
                        <td>${complaint.citizenMobile || 'N/A'}</td>
                    </tr>
                    <tr>
                        <th>📂 வகை / துறை</th>
                        <td><b>${complaint.grievanceCategory || complaint.department || 'N/A'}</b></td>
                    </tr>
                    <tr>
                        <th>📍 மாவட்டம் / தொகுதி</th>
                        <td>${complaint.district || 'சென்னை'} ${complaint.constituency ? '/ ' + complaint.constituency : ''}</td>
                    </tr>
                </table>

                <div class="desc-box">
                    <div class="desc-title">📝 புகார் விவரம்:</div>
                    <p class="desc-text">${complaint.description || complaint.details || 'விவரம் எதுவும் குறிப்பிடப்படவில்லை.'}</p>
                </div>

                <div class="footer-status">
                    ✓ உங்கள் மனு வெற்றிகரமாக பதிவு செய்யப்பட்டது!
                </div>

                <!-- 💥 கம்பீரமான முழக்கம் பகுதி -->
                <div class="slogan-card">
                    <div class="slogan-title">💪 "சொன்னதைச் செய்வோம்! மக்களின் தேவையை உடனுக்குடன் நிறைவேற்றுவோம்!"</div>
                    <p class="slogan-text">உங்கள் ஒவ்வொரு பிரச்சனையும் எங்கள் கவனத்திற்கு வந்தது; விரைவான நேர்மையான தீர்வே எங்கள் லட்சியம்!</p>
                </div>
                
                <div class="footer-note">
                    இது கணினியால் உருவாக்கப்பட்ட அதிகாரப்பூர்வ ஒப்புதல் சீட்டு. கையொப்பம் தேவையில்லை.
                </div>
            </div>
        </div>
    </body>
    </html>`;

    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    const pdfBuffer = await page.pdf({ 
        format: 'A4', 
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });
    await browser.close();
    return pdfBuffer;
}

module.exports = { generateReceiptPDF, generateComplaintPDF: generateReceiptPDF };