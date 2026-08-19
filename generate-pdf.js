const { chromium } = require('playwright');

async function generatePetitionPDF(complaintData) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="ta">
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
            @page {
                size: A4;
                margin: 0;
            }
            * {
                box-sizing: border-box;
            }
            body {
                font-family: 'Noto Sans Tamil', 'Times New Roman', serif;
                margin: 0;
                padding: 12mm 15mm;
                color: #000000;
                background-color: #ffffff;
                height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
            }
            
            /* Government Letter Outer Border */
            .gov-container {
                border: 2px solid #000000;
                padding: 15px;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                position: relative;
            }

            /* Watermark background */
            .watermark {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 55px;
                font-weight: 800;
                color: rgba(0, 0, 0, 0.03);
                text-align: center;
                white-space: nowrap;
                pointer-events: none;
                z-index: 0;
            }

            .content-wrapper {
                position: relative;
                z-index: 1;
            }

            /* Header Section */
            .header-table {
                width: 100%;
                border-bottom: 2px solid #000;
                padding-bottom: 8px;
                margin-bottom: 12px;
            }
            .gov-title {
                text-align: center;
            }
            .gov-title h1 {
                font-size: 18px;
                margin: 0;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .gov-title h2 {
                font-size: 14px;
                margin: 3px 0 0 0;
                font-weight: 600;
            }
            .gov-title h3 {
                font-size: 12px;
                margin: 3px 0 0 0;
                font-weight: 600;
                color: #333;
            }

            /* Reference Meta Data Row */
            .ref-row {
                width: 100%;
                margin-top: 10px;
                font-size: 12px;
                font-weight: 600;
            }
            .ref-row table {
                width: 100%;
            }

            /* Address Section */
            .address-section {
                margin-top: 12px;
                font-size: 12px;
                line-height: 1.4;
            }
            .address-grid {
                display: flex;
                justify-content: space-between;
            }
            .address-box {
                width: 48%;
            }

            /* Subject & Reference */
            .subject-box {
                margin-top: 12px;
                font-size: 12px;
                line-height: 1.5;
                padding-left: 15px;
            }
            .subj-label {
                font-weight: 700;
                float: left;
                width: 65px;
            }
            .subj-text {
                margin-left: 65px;
            }

            /* Main Order Body */
            .letter-body {
                margin-top: 12px;
                font-size: 12px;
                line-height: 1.6;
                text-align: justify;
            }
            .grievance-quote {
                background: #f8f9fa;
                border-left: 3px solid #000000;
                padding: 8px 12px;
                margin: 8px 0;
                font-style: italic;
                font-size: 11.5px;
            }

            /* Sign-off & Closing Section (Fixed at Bottom area) */
            .closing-section {
                position: relative;
                z-index: 1;
                margin-top: auto;
                padding-top: 10px;
            }
            .sig-table {
                width: 100%;
            }
            .official-seal {
                border: 1px solid #000;
                width: 110px;
                height: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                text-align: center;
                font-weight: bold;
                text-transform: uppercase;
            }
            .copy-to {
                font-size: 10.5px;
                margin-top: 10px;
                border-top: 1px dashed #666;
                padding-top: 6px;
            }
        </style>
    </head>
    <body>

        <div class="gov-container">
            <!-- Background Watermark -->
            <div class="watermark">GOVERNMENT OF TAMIL NADU</div>

            <div class="content-wrapper">
                <!-- Header -->
                <div class="header-table">
                    <div class="gov-title">
                        <h1>தமிழ்நாடு அரசு</h1>
                        <h2>முதலமைச்சர் முகவரித் துறை</h2>
                        <h3>தலைமைச் செயலகம், சென்னை - 600 009.</h3>
                    </div>
                </div>

                <!-- Reference & Date Table -->
                <div class="ref-row">
                    <table>
                        <tr>
                            <td style="text-align: left;"><strong>கடித எண்:</strong> CM-CELL/TN/${new Date().getFullYear()}/${complaintData.id || complaintData.grievanceId}</td>
                            <td style="text-align: right;"><strong>தேதி:</strong> ${new Date().toLocaleDateString('ta-IN')}</td>
                        </tr>
                    </table>
                </div>

                <!-- Address Section -->
                <div class="address-section">
                    <div class="address-grid">
                        <div class="address-box">
                            <strong>அனுப்புநர்:</strong><br>
                            முதன்மையாட்சியர் / முதன்மைச் செயலாளர்,<br>
                            முதலமைச்சர் தனிப்பிரிவு,<br>
                            தலைமைச் செயலகம், சென்னை-9.
                        </div>
                        <div class="address-box">
                            <strong>பெறுநர்:</strong><br>
                            மாவட்ட ஆட்சியர் அவர்கள்,<br>
                            <strong>${complaintData.district || 'சம்பந்தப்பட்ட'} மாவட்ட ஆட்சியரகம்</strong>,<br>
                            தமிழ்நாடு.
                        </div>
                    </div>
                </div>

                <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;">

                <!-- Subject & Reference -->
                <div class="subject-box">
                    <div>
                        <span class="subj-label">பொருள்:</span>
                        <div class="subj-text">
                            <strong>முதலமைச்சரின் சிறப்பு முகவரி மனு - துறை: ${complaintData.department || 'பொது நிர்வாகம்'} - உரிய நடவடிக்கை எடுக்கக் கோருதல் - தொடர்பாக.</strong>
                        </div>
                    </div>
                    <div style="margin-top: 5px;">
                        <span class="subj-label">பார்வை:</span>
                        <div class="subj-text">
                            மனுதாரர் திரு/திருமதி. <strong>${complaintData.name || complaintData.citizenName || 'N/A'}</strong> (தொடர்பு எண்: ${complaintData.phone || 'N/A'}) அவர்களின் கோரிக்கை மனு நாள்: ${new Date().toLocaleDateString('ta-IN')}.
                        </div>
                    </div>
                </div>

                <!-- Letter Body -->
                <div class="letter-body">
                    <p style="margin: 6px 0;">ஐயா / அம்மையீர்,</p>
                    <p style="margin: 6px 0; text-indent: 40px;">
                        பார்வையில் குறிப்பிடப்பட்டுள்ள மனுதாரரின் கோரிக்கை மனு இத்துடன் இணைத்து அனுப்பப்படுகிறது. அம்மனுவில் குறிப்பிடப்பட்டுள்ள விவரம் பின்வருமாறு:
                    </p>
                    
                    <div class="grievance-quote">
                        " ${complaintData.complaintText || complaintData.description} "
                    </div>

                    <p style="margin: 6px 0; text-indent: 40px;">
                        மேற்கண்ட மனுவின் தன்மையினைக் கருத்தில் கொண்டு, மாவட்ட ஆட்சியர் அவர்கள் உடனடியாக இக்கோரிக்கை குறித்து கள ஆய்வு / நேரடி விசாரணை மேற்கொண்டு, சட்டத்திற்குட்பட்டு உரிய நடவடிக்கை எடுக்குமாறு முதலமைச்சர் அவர்களின் ஆணைப்படி கேட்டுக்கொள்ளப்படுகிறது.
                    </p>
                    <p style="margin: 6px 0; text-indent: 40px;">
                        எடுக்கப்பட்ட நடவடிக்கை குறித்த முழுமையான அறிக்கையினை (Action Taken Report) 15 தினங்களுக்குள் இத்துறையின் அதிகாரப்பூர்வ இணையதளத்தில் பதிவேற்றம் செய்யுமாறு அறிவுறுத்தப்படுகிறது.
                    </p>
                </div>
            </div>

            <!-- Closing & Signatures (Fixed at bottom edge) -->
            <div class="closing-section">
                <table class="sig-table">
                    <tr>
                        <td style="width: 50%; vertical-align: bottom;">
                            <div class="official-seal">
                                டிஜிட்டல் முறைப்படி<br>ஒப்புதல் அளிக்கப்பட்டது
                            </div>
                        </td>
                        <td style="width: 50%; text-align: right; vertical-align: bottom;">
                            <p style="margin: 0 0 35px 0;">தங்கள் உண்மையுள்ள,</p>
                            <p style="margin: 0; font-weight: bold;">(ஒப்பம்/-)</p>
                            <p style="margin: 2px 0 0 0; font-weight: bold;">முதலமைச்சர் தனிப்பிரிவு அதிகாரி</p>
                            <p style="margin: 0; font-size: 11px;">தமிழ்நாடு அரசு</p>
                        </td>
                    </tr>
                </table>

                <!-- Copy To Footer -->
                <div class="copy-to">
                    <strong>நகல்:</strong> மனுதாரர் — திரு/திருமதி. ${complaintData.name || complaintData.citizenName} (தகவலுக்காகவும், தொடர் நடவடிக்கை கண்காணிப்பிற்காகவும் அனுப்பப்படுகிறது).
                </div>
            </div>
        </div>

    </body>
    </html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true
    });

    await browser.close();
    return pdfBuffer;
}

module.exports = { generateCMForwardPDF: generatePetitionPDF };