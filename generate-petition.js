const { chromium } = require('playwright');

async function generateMLAComplaintPDF(complaint) {
    let browser = null;
    try {
        const citizenName = complaint.citizenName || complaint.applicantName || 'மனுதாரர்';
        const grievanceId = complaint.grievanceId || complaint.id || 'N/A';
        const createdDate = complaint.createdDate || complaint.createdAt || new Date().toLocaleDateString('en-GB');
        const citizenMobile = complaint.citizenMobile || complaint.mobile || 'N/A';
        const wardZone = complaint.wardZone || complaint.ward || '';
        const constituency = complaint.constituency || '';
        const district = complaint.district || '';
        const grievanceCategory = complaint.grievanceCategory || complaint.department || 'பொதுக் குறை';
        const description = complaint.description || complaint.details || 'விவரங்கள் எதுவும் குறிப்பிடப்படவில்லை.';

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="ta">
        <head>
        <head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;700&display=swap" rel="stylesheet">
            <meta charset="UTF-8">
            <style>
                @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
                body { font-family: 'Arial', 'Latha', sans-serif; margin: 0; padding: 20px; color: #111; line-height: 1.7; background-color: #fff; }
                .letter-container { border: 2px solid #222; padding: 30px; box-sizing: border-box; position: relative; }
                .header { text-align: center; border-bottom: 2px double #222; padding-bottom: 12px; margin-bottom: 20px; }
                .header-title { font-size: 20px; font-weight: bold; color: #0b3c5d; }
                .header-subtitle { font-size: 12px; font-weight: bold; color: #555; }
                .meta-table { width: 100%; margin-bottom: 15px; border-bottom: 1px dashed #aaa; padding-bottom: 8px; }
                .meta-table td { font-size: 13px; font-weight: bold; }
                .meta-right { text-align: right; }
                .address-block { margin-bottom: 15px; font-size: 13.5px; }
                .address-title { font-weight: bold; text-decoration: underline; margin-bottom: 3px; }
                .address-details { margin-left: 10px; }
                .subject-box { background-color: #f4f6f8; border-left: 4px solid #0b3c5d; padding: 8px 12px; font-size: 13.5px; font-weight: bold; margin: 15px 0 20px 0; }
                .description-text { font-size: 13.5px; text-align: justify; white-space: pre-line; word-wrap: break-word; margin: 15px 0; text-indent: 30px; }
                .letter-body { font-size: 13.5px; text-align: justify; margin-bottom: 10px; }
                .footer-section { margin-top: 40px; width: 100%; page-break-inside: avoid; }
                .sign-table { width: 100%; }
                .sign-table td { vertical-align: bottom; font-size: 13.5px; }
                .watermark { position: absolute; top: 40%; left: 15%; font-size: 50px; color: rgba(0, 0, 0, 0.03); transform: rotate(-30deg); font-weight: bold; pointer-events: none; }
            </style>
        </head>
        <body>
            <div class="letter-container">
                <div class="watermark">OFFICIAL PETITION</div>
                <div class="header">
                    <div class="header-title">பொதுமக்கள் கோரிக்கை மனு</div>
                    <div class="header-subtitle">PUBLIC GRIEVANCE REDRESSAL PETITION</div>
                </div>
                <table class="meta-table">
                    <tr>
                        <td>மனு எண்: <span style="color: #d9534f;">${grievanceId}</span></td>
                        <td class="meta-right">தேதி: ${createdDate}</td>
                    </tr>
                </table>
                <div class="address-block">
                    <div class="address-title">அனுப்புநர் (From):</div>
                    <div class="address-details">
                        <b>பெயர்:</b> ${citizenName}<br>
                        <b>அலைபேசி:</b> ${citizenMobile}<br>
                        <b>முகவரி / பகுதி:</b> ${wardZone}, ${constituency} தொகுதி, ${district} மாவட்டம்.
                    </div>
                </div>
                <div class="address-block">
                    <div class="address-title">பெறுநர் (To):</div>
                    <div class="address-details">
                        <b>மாண்புமிகு சட்டமன்ற உறுப்பினர் (MLA) அவர்கள்,</b><br>
                        ${constituency} சட்டமன்றத் தொகுதி,<br>
                        தமிழ்நாடு அரசு.
                    </div>
                </div>
                <div class="subject-box">
                    பொருள்: ${grievanceCategory} சீரமைத்துத் தரக் கோருதல் - தொடர்பாக.
                </div>
                <div class="letter-body"><b>மதிப்பிற்குரிய ஐயா / அம்மா,</b></div>
                <div class="description-text">${description}</div>
                </div>
                <div class="footer-section">
                    <table class="sign-table">
                        <tr>
                            <td style="text-align: left;">
                                <b>இடம்:</b> ${district}<br>
                                <b>தேதி:</b> ${createdDate}
                            </td>
                            <td style="text-align: right;">
                                இப்படிக்கு,<br><br><br>
                                <b>(${citizenName})</b><br>
                                <span style="font-size: 11px; color: #666;">(மனுதாரர் கையொப்பம்)</span>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
        </body>
        <style>
    body {
      font-family: 'Noto Sans Tamil', sans-serif !important;
    }
  </style>
        </html>
        `;

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        await page.setContent(htmlContent, { 
            waitUntil: 'networkidle', 
            timeout: 60000 
        });

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        return pdfBuffer;

    } catch (error) {
        console.error("PDF Generation Error:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { generateMLAComplaintPDF };