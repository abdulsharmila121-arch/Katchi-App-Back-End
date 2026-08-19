const cron = require('node-cron');
const express = require('express');
const nodemailer = require('nodemailer');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const twilio = require('twilio');
const PDFDocument = require('pdfkit');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// District Data Import
const districtData = require('./data/districtData');

// ==========================================
// 1. TWILIO & GEMINI CONFIGURATION
// ==========================================
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'AC43cbc098a881e4de7178cb5ac0015235';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '601416df89cd6514c65e97004a65cacd';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+12297922376';

const twilioClient = twilio(ACCOUNT_SID, AUTH_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "process.env.MY_SECRET");

async function autoCategorize(complaintText) {
    try {
        if (!process.env.AQ.Ab8RN6KZREoDWxjygFplbgErIjLH2TvngCG7dmnvgiVYuV1O6Q) return "General Grievance";
        const model = genAI.getGenerativeAIModel({ model: "gemini-1.5-flash" });
        const prompt = `Categorize this complaint into one of these departments: [Water Supply, Electricity, Roads & Sanitation, Public Health]. Only return the department name. Complaint: "${complaintText}"`;
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (e) {
        console.error("AI Categorization Error:", e.message);
        return "General Grievance";
    }
}

// Gemini AI Priority & Category Detection
async function autoCategorizeAndPrioritize(complaintText) {
    try {
        if (!process.env.GEMINI_API_KEY) return { category: "General Grievance", priority: "Normal" };
        const model = genAI.getGenerativeAIModel({ model: "gemini-1.5-flash" });
        const prompt = `Analyze this complaint: "${complaintText}". 
        1. Categorize into one of: [Water Supply, Electricity, Roads & Sanitation, Public Health].
        2. Set Priority as "Urgent" if it causes immediate danger/emergency, else "Normal".
        Return JSON format: {"category": "...", "priority": "..."}`;
        
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        return JSON.parse(responseText);
    } catch (e) {
        console.error("AI Error:", e.message);
        return { category: "General Grievance", priority: "Normal" };
    }
}

// Helpers
async function sendStatusNotification(userPhone, complaintId, newStatus) {
    try {
        await twilioClient.messages.create({
            body: `வணக்கம்! உங்கள் புகார் ID: ${complaintId}-ன் நிலை இப்போது '${newStatus}' என மாற்றப்பட்டுள்ளது.`,
            from: 'whatsapp:+12297922376',
            to: `whatsapp:${userPhone}`,
            mediaUrl: ['https://weak-days-exist.loca.lt/uploads/acknowledgement.pdf']
        });
        console.log("SMS / WhatsApp Notification sent successfully!");
    } catch (error) {
        console.error("Twilio Error:", error.message);
    }
}

function sendNotification(phoneNumber, message, isWhatsApp = false) {
    try {
        if (!phoneNumber) return;
        const fromNumber = isWhatsApp ? 'whatsapp:+12297922376' : TWILIO_PHONE_NUMBER;
        const toNumber = isWhatsApp ? `whatsapp:${phoneNumber}` : phoneNumber;

        twilioClient.messages.create({ body: message, from: fromNumber, to: toNumber })
            .then(msg => console.log(`Notification sent! SID: ${msg.sid}`))
            .catch(err => console.error('Twilio Error:', err.message));
    } catch (e) {
        console.error('Notification Error:', e.message);
    }
}

function sendWhatsAppMediaNotification(phoneNumber, message, mediaUrl) {
    try {
        if (!phoneNumber) return;
        twilioClient.messages.create({
            body: message,
            from: 'whatsapp:+12297922376',
            to: `whatsapp:${phoneNumber}`,
            mediaUrl: [mediaUrl]
        })
        .then(msg => console.log(`WhatsApp Media Sent! SID: ${msg.sid}`))
        .catch(err => console.error('Twilio WhatsApp Error:', err.message));
    } catch (e) {
        console.error('WhatsApp Media Error:', e.message);
    }
}

function checkAndApplySLAEscalation(complaint) {
    const SLA_DAYS = 7;
    const createdDate = new Date(complaint.createdAt || complaint.createdDate);
    const currentDate = new Date();
    const diffInDays = Math.floor((currentDate - createdDate) / (1000 * 60 * 60 * 24));

    if (complaint.status !== 'Resolved' && complaint.status !== 'Completed' && diffInDays > SLA_DAYS) {
        complaint.isEscalated = true;
        complaint.escalationReason = `SLA Exceeded (${diffInDays} days pending)`;
    }
    return complaint;
}

function saveCompletedFile(complaint) {
    const fileName = `./completed_files/${complaint.grievanceId}.json`;
    fs.writeFileSync(fileName, JSON.stringify(complaint, null, 2));
}

// ==========================================
// 2. EXPRESS & SETUP
// ==========================================
const app = express();

['uploads', 'completed_files', 'archive'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

app.use(express.static('public'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'super-secret-key-123',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.set('views', path.resolve(__dirname, 'Views'));
app.set('view engine', 'ejs');

// Mongoose Schemas
const grievanceSchema = new mongoose.Schema({
    grievanceId: String,
    citizenName: String,
    citizenMobile: String,
    fieldNotes: { type: String, default: "" },
    resolvedImage: { type: String, default: "" }
}, { timestamps: true });

const Grievance = mongoose.model('Grievance', grievanceSchema);

const userSchema = new mongoose.Schema({
    resolvedCount: { type: Number, default: 0 },
    points: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const uploadFields = multer({ storage }).fields([
    { name: 'complaintMedia', maxCount: 1 },
    { name: 'complaintLetter', maxCount: 1 }
]);

const resolutionFields = multer({ storage }).fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 }
]);

// In-Memory Data Store
let activeOTPs = {};

const wardList = {
    "Anna Nagar": ["Ward 12", "Ward 13", "Ward 14", "Ward 15"],
    "Kolathur": ["Ward 24", "Ward 25", "Ward 26", "Ward 27"]
};

const thirukkurals = [
    {
        kural: "செயற்கரிய செய்வார் பெரியர் சிறியர்<br>செயற்கரிய செய்கலாதார்.",
        explanation: "செய்வதற்கு அருமையான செயல்களைச் செய்து முடிப்பவரே பெரியோர்; செய்ய முடியாது என்று பின்வாங்குபவர் சிறியோர்."
    },
    {
        kural: "அகர முதல எழுத்தெல்லாம் ஆதி<br>பகவன் முதற்றே உலகு.",
        explanation: "எழுத்துக்கள் எல்லாம் 'அ' கரத்தை முதலாவதாகக் கொண்டுள்ளன; அதுபோல உலகம் இறைவனை முதலாகக் கொண்டுள்ளது."
    },
    {
        kural: "மனத்துக்கண் மாசிலன் ஆதல் அனைத்தறன்<br>ஆகுல நீர பிற.",
        explanation: "மனதில் குற்றம் இல்லாமல் இருப்பது தான் சிறந்த அறம்; மற்றவை எல்லாம் வெறும் ஆரவாரமே."
    }
];

const departmentMapping = {
    "Pothole": { department: "Roads & Highways", officerEmail: "roads@tn.gov.in" },
    "Water Leakage": { department: "Metro Water", officerEmail: "water@tn.gov.in" },
    "Electricity": { department: "TNEB", officerEmail: "tneb@tn.gov.in" },
    "Garbage": { department: "Sanitation", officerEmail: "clean@tn.gov.in" }
};

let complaintsList = [
    { 
        id: 1,
        grievanceId: "GRIEV-2026-1001",
        citizenName: "Anbarasan",
        citizenMobile: "+919845123456",
        citizenEmail: "anbu@gmail.com",
        district: "Chennai",
        constituency: "Anna Nagar", 
        municipality: "Chennai Corporation",
        wardZone: "Ward 12",
        streetName: "Anna Nagar 3rd Street",
        googleMapLocation: "13.0850, 80.2120",
        landmark: "Anna Nagar Tower",
        grievanceCategory: "சாலை பழுது",
        description: "Water Pipeline Leakage broke the road completely.", 
        status: "Pending_Managaram", 
        mediaFile: "", 
        letterFile: "",
        createdDate: "2026-06-12",
        priority: "Normal",
        forwardedTo: "",
        beforeImage: "",
        afterImage: "",
        appreciation: "",
        certificateIssued: false,
        deadline: null, 
        delayJustification: "" 
    }
];

// Collector Emails Mapping
const collectorEmails = {
    "Chennai": "collrchn@nic.in",
    "Coimbatore": "collrcbe@nic.in",
    "Madurai": "collrmdu@nic.in",
    "Kanchipuram": "collrkpm@nic.in",
    "Salem": "collrslm@nic.in"
};

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'gudluckenterprises26@gmail.com',  
        pass: process.env.EMAIL_PASS || 'ntvg ousb jlid ylyl'      
    }
});

// ==========================================
// 3. ROUTES & APIS
// ==========================================

app.get('/', (req, res) => {
    if (req.session && req.session.isLoggedIn) {
        let activeComplaints = complaintsList.filter(c => !c.isArchived);
        let filteredComplaints = [];

        if (req.session.userRole === 'MLA') {
            filteredComplaints = activeComplaints.filter(c => {
                const matchedConstituency = c.constituency && req.session.constituency && 
                    c.constituency.replace(/\s+/g, '').toLowerCase() === req.session.constituency.replace(/\s+/g, '').toLowerCase();
                return matchedConstituency && (c.recipient === 'MLA' || !c.recipient);
            });
        } else if (req.session.userRole === 'Poruppalar') {
            filteredComplaints = activeComplaints.filter(c => {
                const matchedConstituency = c.constituency && req.session.constituency && 
                    c.constituency.replace(/\s+/g, '').toLowerCase() === req.session.constituency.replace(/\s+/g, '').toLowerCase();
                return matchedConstituency && (c.recipient === 'Poruppalar' || c.forwardedTo);
            });
        } else if (req.session.userRole === 'CM') {
            filteredComplaints = activeComplaints.filter(c => c.recipient === 'CM');
        } else {
            filteredComplaints = activeComplaints;
        }

        const totalCount = filteredComplaints.length;
        const pendingCount = filteredComplaints.filter(c => c.status && c.status.startsWith('Pending')).length;
        const resolvedCount = filteredComplaints.filter(c => c.status === 'Resolved' || c.status === 'Completed').length;

        const today = new Date();
        const startOfYear = new Date(today.getFullYear(), 0, 0);
        const diff = today - startOfYear;
        const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
        const todayKural = thirukkurals[dayOfYear % thirukkurals.length];

        res.render('dashboard', { 
            complaint: filteredComplaints[0] || {},
            complaints: filteredComplaints, 
            complaintsList,
            currentRole: req.session.userRole, 
            constituency: req.session.constituency || null, 
            wardList, 
            districtData,
            successId: req.query.successId,
            req,
            totalCount,
            pendingCount,
            resolvedCount,
            points: req.session.points || 0,
            todayKural
        });
    } else {
        res.redirect('/login');
    }
});

app.get('/dashboard', async (req, res) => {
    try {
        const currentUser = req.session.user || null;
        const currentRole = req.session.userRole || 'Public';
        const constituency = req.session.constituency || '';

        res.render('dashboard', {
            complaint: complaintsList[0] || {},
            user: currentUser,
            currentRole: currentRole,
            constituency: constituency,
            complaints: complaintsList || [],
            districtData: districtData || [],
            req: req,
            totalCount: complaintsList.length,
            pendingCount: complaintsList.filter(c => c.status && c.status.startsWith('Pending')).length,
            resolvedCount: complaintsList.filter(c => c.status === 'Completed').length,
            successId: req.query.successId || null,
            todayKural: { kural: "செயற்கரிய செய்வார் பெரியர் சிறியர் செயற்கரிய செய்கலாதார்.", explanation: "செய்வதற்கு அருமையான செயல்களைச் செய்பவரே பெரியோர்." }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
});

app.post('/cm/forward-to-collector', async (req, res) => {
    try {
        const { grievanceId, citizenName, district, description } = req.body;
        const collectorEmail = collectorEmails[district] || 'collector@tn.gov.in';

        const mailOptions = {
            from: '"CM Office Tamil Nadu" <gudluckenterprises26@gmail.com>',
            to: collectorEmail,
            subject: `🚨 [CM Office Forward] மனு எண்: #${grievanceId} - ${district} மாவட்டம்`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
                    <h2 style="color: #0d6efd;">முதலமைச்சர் அலுவலகம் (CM Office) - பார்வர்டு செய்யப்பட்ட மனு</h2>
                    <p><strong>மனு எண்:</strong> #${grievanceId}</p>
                    <p><strong>மனுதாரர் பெயர்:</strong> ${citizenName}</p>
                    <p><strong>மாவட்டம்:</strong> ${district}</p>
                    <hr>
                    <h3>மனுவின் விவரம்:</h3>
                    <p style="background: #f8f9fa; padding: 15px; border-left: 4px solid #0d6efd;">${description}</p>
                    <hr>
                    <p style="color: red; font-size: 0.9rem;"><strong>அறிவுறுத்தல்:</strong> இந்த மனு முதலமைச்சர் அலுவலகத்திலிருந்து நேரடியாக உங்களுக்கு பார்வர்டு செய்யப்பட்டுள்ளது. உடனடியாக தகுந்த நடவடிக்கை எடுக்கவும்.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Complaint #${grievanceId} forwarded to ${district} Collector (${collectorEmail})`);
        res.redirect('/?success=forwarded');
    } catch (error) {
        console.error("Forward செய்வதில் பிழை:", error);
        res.status(500).send("Collector-க்கு Mail அனுப்புவதில் பிழை ஏற்பட்டது.");
    }
});

app.get('/login', (req, res) => {
    const filePath = path.join(__dirname, 'announcements.json');
    let announcements = [];

    if (fs.existsSync(filePath)) {
        try {
            announcements = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (err) {
            console.error("JSON Read Error:", err);
        }
    }
    res.render('login', { announcements });
});

app.post('/login', (req, res) => {
    const { loginType, mobileNumber, otp, username, password, recipient } = req.body;

    if (loginType === 'public') {
        if (otp === "1234" || activeOTPs[mobileNumber] === otp) {
            req.session.isLoggedIn = true;
            req.session.userRole = 'Public';
            req.session.userMobile = mobileNumber;
            req.session.recipient = recipient;
            delete activeOTPs[mobileNumber];
            return res.redirect('/');
        }
        return res.send("<script>alert('தவறான OTP எண்!'); window.location.href='/login';</script>");
    } 
    
    if (loginType === 'official') {
        if (username === 'cm' && password === 'cm123') {
            req.session.isLoggedIn = true;
            req.session.userRole = 'CM';
            req.session.constituency = 'All State';
            return res.redirect('/');
        }

        const usersFilePath = path.join(__dirname, 'users_credentials.json');
        let usersList = [];

        if (fs.existsSync(usersFilePath)) {
            try {
                usersList = JSON.parse(fs.readFileSync(usersFilePath, 'utf-8'));
            } catch (err) {
                console.error("JSON Parse Error:", err);
            }
        }

        const matchedUser = usersList.find(u => 
            u.username && u.username.trim().toLowerCase() === username.trim().toLowerCase() && 
            u.password && u.password.trim() === password.trim()
        );

        if (matchedUser) {
            req.session.isLoggedIn = true;
            req.session.userRole = matchedUser.role;
            req.session.constituency = matchedUser.constituency;
            req.session.district = matchedUser.district;
            return res.redirect('/');
        }
        return res.send("<script>alert('தவறான பயனர் பெயர் / கடவுச்சொல்!'); window.location.href='/login';</script>");
    }
    res.redirect('/login');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

app.post('/send-otp', (req, res) => {
    const { mobileNumber } = req.body;
    if (!mobileNumber) return res.json({ success: false, message: 'மொபைல் எண் தேவை!' });
    activeOTPs[mobileNumber] = "1234";
    res.json({ success: true, message: 'OTP வெற்றிகரமாக அனுப்பப்பட்டது! (டெஸ்ட் OTP: 1234)' });
});

app.get('/check-status', (req, res) => {
    const { grievanceId } = req.query;
    let statusResult = null;
    let error = null;

    if (grievanceId) {
        const complaint = complaintsList.find(c => String(c.grievanceId).trim().toLowerCase() === String(grievanceId).trim().toLowerCase());
        if (complaint) {
            statusResult = complaint;
        } else {
            error = "மன்னிக்கவும், இந்த ID-க்கு புகார்கள் ஏதுமில்லை!";
        }
    }
    res.render('check_status', { statusResult, error, grievanceId });
});

app.get('/grievance-details', (req, res) => {
    const searchId = req.query.id ? req.query.id.trim() : null;
    if (!searchId) return res.render('grievance-details', { complaint: null });

    const foundComplaint = complaintsList.find(c => 
        String(c.id) === searchId || 
        (c.grievanceId && c.grievanceId.toLowerCase() === searchId.toLowerCase())
    );

    if (foundComplaint) {
        res.render('grievance-details', { complaint: foundComplaint });
    } else {
        res.render('grievance-details', { complaint: null, error: 'மனு எண் தவறானது அல்லது கிடைக்கவில்லை!' });
    }
});

app.post('/update-status', (req, res) => {
    if (!req.session || !req.session.isLoggedIn || req.session.userRole === 'Public') {
        return res.status(403).send('அணுகல் மறுக்கப்பட்டது!');
    }
    const { grievanceId, newStatus } = req.body;
    const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));
    
    if (complaint) {
        complaint.status = newStatus;
        sendNotification(complaint.citizenMobile, `உங்கள் மனு எண்: ${grievanceId}-ன் நிலை தற்போது "${newStatus}" என மாற்றப்பட்டுள்ளது.`, false);
        return res.send("<script>alert('மனுவின் நிலை வெற்றிகரமாக மாற்றப்பட்டது!'); window.location.href='/';</script>");
    }
    return res.send("<script>alert('மனு எண் கண்டறியப்படவில்லை!'); window.location.href='/';</script>");
});

app.post('/update-grievance-details', (req, res) => {
    const { grievanceId, priority, forwardTo, department, deadlineHours } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    
    if (complaint) {
        complaint.priority = priority || "Normal";
        complaint.forwardedTo = forwardTo || department || "Unassigned";
        complaint.status = "In_Progress"; 
        
        if (deadlineHours) {
            complaint.deadline = Date.now() + (parseInt(deadlineHours) * 60 * 60 * 1000);
        }

        const notifyDept = complaint.forwardedTo;
        sendNotification(
            complaint.citizenMobile, 
            `உங்கள் மனு எண்: ${grievanceId} தற்போது உரிய அதிகாரிக்கு/துறைக்கு (${notifyDept}) அனுப்பப்பட்டு நடவடிக்கை எடுக்கப்பட்டு வருகிறது. காலக்கெடு: ${deadlineHours} மணிநேரம்.`, 
            false
        );

        return res.send("<script>alert('கோரிக்கை வெற்றிகரமாக அனுப்பப்பட்டது!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/submit-delay-justification', (req, res) => {
    const { grievanceId, delayJustification } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    if (complaint) {
        complaint.delayJustification = delayJustification;
        return res.send("<script>alert('தாமதத்திற்கான காரணம் எம்.எல்.ஏ-வுக்கு அனுப்பப்பட்டது!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/submit-field-notes', (req, res) => {
    const { grievanceId, fieldNotes } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    if (complaint) {
        complaint.fieldNotes = fieldNotes;
        return res.send("<script>alert('கள அறிக்கை புதுப்பிக்கப்பட்டது!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/upload-resolution', (req, res) => {
    resolutionFields(req, res, (err) => {
        if (err) return res.send(err.message);
        const { grievanceId } = req.body;
        const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));
        
        if (complaint) {
            complaint.status = 'Completed';
            if (req.files && req.files['beforeImage']) complaint.beforeImage = req.files['beforeImage'][0].filename;
            if (req.files && req.files['afterImage']) {
                complaint.afterImage = req.files['afterImage'][0].filename;
                complaint.resolvedImage = req.files['afterImage'][0].filename; 
            }
            
            saveCompletedFile(complaint);

            if (req.session && req.session.userRole === 'Poruppalar') {
                req.session.resolvedCount = (req.session.resolvedCount || 0) + 1;
                req.session.points = (req.session.points || 0) + 10;
            }

            sendNotification(complaint.citizenMobile, `மகிழ்ச்சியான செய்தி! உங்கள் மனு எண்: ${grievanceId}-ல் குறிப்பிடப்பட்ட குறை முழுமையாக நிவர்த்தி செய்யப்பட்டுள்ளது.`, false);

            const hostUrl = req.protocol + '://' + req.get('host'); 
            const afterImageLink = `${hostUrl}/uploads/${complaint.afterImage}`;
            sendWhatsAppMediaNotification(
                complaint.citizenMobile, 
                `🏛️ *தமிழ்நாடு மக்கள் குறைதீர்ப்புப் பேரவை* \n\nவணக்கம், உங்களுடைய மனு எண்: *${grievanceId}*-ன் குறை நிவர்த்தி செய்யப்பட்டுள்ளது.`, 
                afterImageLink
            );

            return res.send("<script>alert('பணி வெற்றிகரமாக முடிக்கப்பட்டது!'); window.location.href='/';</script>");
        }
        res.redirect('/');
    });
});

app.post('/appreciate-grievance', (req, res) => {
    if (!req.session || req.session.userRole !== 'MLA') return res.status(403).send('அணுகல் மறுக்கப்பட்டது!');
    const { grievanceId, message } = req.body;
    const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));
    
    if (complaint) {
        complaint.appreciation = message || "சிறப்பான பணிக்கு மனமார்ந்த பாராட்டுக்கள்! 🏆";
        return res.send("<script>alert('உங்களின் பாராட்டுக்கள் அனுப்பப்பட்டது!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/issue-certificate', (req, res) => {
    if (!req.session || req.session.userRole !== 'MLA') return res.status(403).send('அணுகல் மறுக்கப்பட்டது!');
    const { grievanceId } = req.body;
    const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));
    if (complaint) {
        complaint.certificateIssued = true;
        return res.send("<script>alert('பாராட்டுச் சான்றிதழ் வழங்கப்பட்டது! 📜'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/archive-complaint', (req, res) => {
    const { grievanceId } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    
    if (complaint) {
        complaint.isArchived = true;
        fs.writeFileSync(path.join(__dirname, 'archive', `${grievanceId}.json`), JSON.stringify(complaint, null, 2));
        return res.send("<script>alert('மனு வெற்றிகரமாக காப்பகப்படுத்தப்பட்டது (Archived)!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.get('/view-archive', (req, res) => {
    let archivedComplaints = complaintsList.filter(c => c.isArchived);
    res.render('archive', { archivedComplaints });
});

app.post('/add-announcement', (req, res) => {
    const { content } = req.body;
    const filePath = path.join(__dirname, 'announcements.json');
    let announcements = [];

    if (fs.existsSync(filePath)) {
        try {
            announcements = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (!Array.isArray(announcements)) announcements = [];
        } catch (err) {
            announcements = [];
        }
    }

    if (content) {
        announcements.unshift({ date: new Date().toISOString().split('T')[0], content });
        fs.writeFileSync(filePath, JSON.stringify(announcements, null, 4), 'utf-8');
    }
    res.redirect('back'); 
});

app.post('/send-cm-directive', (req, res) => {
    const { targetOfficer, directiveText } = req.body;
    console.log(`CM Directive to ${targetOfficer}: ${directiveText}`);
    res.send("<script>alert('CM Directive Sent Successfully!'); window.location.href='/';</script>");
});

app.get('/export-excel', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Grievance Report');

        worksheet.columns = [
            { header: 'S.No', key: 'sno', width: 8 },
            { header: 'Grievance ID', key: 'grievanceId', width: 18 },
            { header: 'Submitted Date', key: 'createdDate', width: 15 },
            { header: 'Citizen Name', key: 'citizenName', width: 20 },
            { header: 'Contact Mobile', key: 'mobile', width: 15 },
            { header: 'District', key: 'district', width: 18 },
            { header: 'Constituency / Ward', key: 'ward', width: 18 },
            { header: 'Category', key: 'grievanceCategory', width: 18 },
            { header: 'Grievance Details', key: 'details', width: 35 },
            { header: 'Assigned Dept', key: 'department', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Archive State', key: 'archiveStatus', width: 15 }
        ];

        worksheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        complaintsList.forEach((item, index) => {
            worksheet.addRow({
                sno: index + 1,
                grievanceId: item.grievanceId || 'N/A',
                createdDate: item.createdDate || 'N/A',
                citizenName: item.citizenName || 'N/A',
                mobile: item.citizenMobile || 'N/A',
                district: item.district || 'N/A',
                ward: `${item.constituency} - ${item.wardZone}`,
                grievanceCategory: item.grievanceCategory || 'N/A',
                details: item.description || 'N/A',
                department: item.forwardedTo || 'Unassigned',
                status: item.status || 'Pending',
                archiveStatus: item.isArchived ? 'Archived' : 'Active'
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Grievance_Report.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("Excel Export Error: ", err);
        res.status(500).send("Excel டவுன்லோடு செய்வதில் பிழை ஏற்பட்டது!");
    }
});

app.get('/download-report', (req, res) => {
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=Grievance_Report.pdf');

    doc.pipe(res);
    doc.fontSize(20).text('அரசு புகார் அறிக்கை (Grievance Report)', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`மொத்த புகார்கள்: ${complaintsList.length}\nதீர்க்கப்பட்டவை: ${complaintsList.filter(c=>c.status==='Completed').length}\nநிலுவையில் உள்ளவை: ${complaintsList.filter(c=>c.status!=='Completed').length}`);
    doc.end();
});

// REST & V2 APIs
app.get('/api/quick-status/:id', (req, res) => {
    const searchId = req.params.id ? req.params.id.trim().toLowerCase() : '';
    const found = complaintsList.find(c => 
        (c.grievanceId && c.grievanceId.toLowerCase() === searchId) || 
        (c.id && String(c.id).toLowerCase() === searchId)
    );

    if (found) {
        return res.json({
            success: true,
            grievance: {
                grievanceId: found.grievanceId || found.id,
                department: found.department || found.grievanceCategory || found.category || '-',
                applicantName: found.applicantName || found.citizenName || found.name || '-',
                description: found.description || found.details || found.message || 'விவரம் எதுவும் குறிப்பிடப்படவில்லை',
                createdAt: found.createdAt || found.createdDate || '-',
                status: found.status || 'Pending'
            }
        });
    }
    return res.json({ success: false, message: 'மனு எண் கிடைக்கவில்லை!' });
});

app.post('/api/submit-feedback', (req, res) => {
    const { grievanceId, rating, feedbackText } = req.body;
    console.log(`NEW FEEDBACK: Grievance ID: ${grievanceId}, Rating: ${rating}/5, Comments: ${feedbackText}`);
    res.json({ success: true, message: 'Feedback received successfully!' });
});

app.get('/api/constituency-mlas', (req, res) => {
    res.json({
        "Anna Nagar": { name: "MK Mohan", photo: "/uploads/mla_anna_nagar.jpg" },
        "Kolathur": { name: "MK Stalin", photo: "/uploads/mla_kolathur.jpg" }
    });
});

app.post('/api/v2/complaint/create', (req, res) => {
    const { title, category, description, createdBy } = req.body;
    const routeInfo = departmentMapping[category] || { department: "General Grievance", officerEmail: "admin@tn.gov.in" };

    const newComplaint = {
        id: "CMP" + Date.now(),
        title,
        category,
        description,
        createdBy,
        assignedDepartment: routeInfo.department,
        assignedOfficerEmail: routeInfo.officerEmail,
        status: "Pending",
        createdAt: new Date()
    };

    complaintsList.push(newComplaint);
    res.json({ success: true, complaint: newComplaint });
});

app.post('/api/v2/complaint/update-status', async (req, res) => {
    const { complaintId, status, userPhone } = req.body;
    const complaint = complaintsList.find(c => c.id === complaintId || c.grievanceId === complaintId);
    
    if (complaint) {
        complaint.status = status;
        if (userPhone) await sendStatusNotification(userPhone, complaintId, status);
        return res.json({ success: true, message: "Status updated & notification sent!" });
    }
    res.status(404).json({ success: false, message: "Complaint not found" });
});

app.post('/api/v2/complaint/feedback', (req, res) => {
    const { complaintId, rating, comments } = req.body;
    const complaint = complaintsList.find(c => c.id === complaintId || c.grievanceId === complaintId);
    
    if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found" });

    complaint.feedback = {
        rating: Number(rating),
        comments: comments || "",
        submittedAt: new Date()
    };

    res.json({ success: true, message: "உங்கள் கருத்து பதிவு செய்யப்பட்டது, நன்றி!" });
});

app.get('/api/v2/admin/escalated-complaints', (req, res) => {
    const escalatedList = complaintsList
        .map(c => checkAndApplySLAEscalation(c))
        .filter(c => c.isEscalated === true);

    res.json({ success: true, count: escalatedList.length, data: escalatedList });
});

app.get('/api/v2/complaint/download-pdf/:id', (req, res) => {
    const complaintId = req.params.id;
    const complaint = complaintsList.find(c => String(c.id) === complaintId || c.grievanceId === complaintId);

    if (!complaint) return res.status(404).send("Complaint not found");

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Complaint_${complaintId}.pdf`);

    doc.pipe(res);
    doc.fontSize(20).text('Grievance Redressal Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Complaint ID: ${complaint.grievanceId || complaint.id}`);
    doc.text(`Title / Category: ${complaint.grievanceCategory || complaint.category || 'N/A'}`);
    doc.text(`Department: ${complaint.forwardedTo || complaint.assignedDepartment || 'General'}`);
    doc.text(`Status: ${complaint.status}`);
    doc.text(`Date: ${complaint.createdDate || complaint.createdAt}`);
    doc.end();
});

app.post('/whatsapp-bot', async (req, res) => {
    const incomingMsg = req.body.Body ? req.body.Body.trim() : '';
    const from = req.body.From;

    console.log(`WhatsApp Message Received from ${from}: ${incomingMsg}`);
    let responseMessage = "";

    if (incomingMsg.toUpperCase().startsWith('STATUS')) {
        const parts = incomingMsg.split(/\s+/);
        const grievanceId = parts[1] ? parts[1].toUpperCase() : null;

        if (!grievanceId) {
            responseMessage = "❌ தவறான வடிவம். தயவுசெய்து 'STATUS <மனு_எண்>' என அனுப்பவும். \nஉதாரணம்: STATUS GRIEV-2026-1001";
        } else {
            const complaint = complaintsList.find(c => c.grievanceId === grievanceId);

            if (complaint) {
                responseMessage = `📌 *மனுவின் தற்போதைய நிலை (Grievance Status)*\n\n` +
                                  `🆔 *மனு எண்:* ${complaint.grievanceId}\n` +
                                  `👤 *பெயர்:* ${complaint.citizenName}\n` +
                                  `📂 *வகை:* ${complaint.grievanceCategory || complaint.category}\n` +
                                  `⚡ *தற்போதைய நிலை:* *${complaint.status}*\n` +
                                  `🏢 *ஒதுக்கப்பட்ட துறை:* ${complaint.forwardedTo || 'பரிசீலனையில் உள்ளது'}\n\n` +
                                  `நன்றி! அரசு உங்கள் மனு மீது விரைந்து நடவடிக்கை எடுத்து வருகிறது.`;
            } else {
                responseMessage = `⚠️ மன்னிக்கவும், **${grievanceId}** என்ற எண்ணில் மனு எதுவும் கண்டறியப்படவில்லை. தயவுசெய்து உங்கள் மனு எண்ணைச் சரிபார்க்கவும்.`;
            }
        }
    } else {
        responseMessage = "வணக்கம்! 👋\nஉங்கள் மனுவின் நிலையை அறிய **STATUS <மனு எண்>** என மெசேஜ் அனுப்பவும்.\n\n*உதாரணம்:* STATUS GRIEV-2026-1001";
    }

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(responseMessage);
    res.type('text/xml').send(twiml.toString());
});

// Citizen Rating & Feedback Dashboard Integration
function completeGrievanceAndSendFeedback(grievanceId, serverHostUrl) {
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    if (complaint) {
        complaint.status = "Completed";
        const feedbackLink = `${serverHostUrl}/feedback/${grievanceId}`;
        const message = `🎉 உங்கள் மனு (எண்: ${grievanceId}) வெற்றிகரமாகத் தீர்க்கப்பட்டது!\n\nஎங்களின் சேவை குறித்த உங்கள் கருத்து மற்றும் Star Rating பெற விரும்புகிறோம். கீழே உள்ள லிங்கை கிளிக் செய்து உங்கள் Feedback தெரிவிக்கவும்:\n${feedbackLink}`;
        sendNotification(complaint.citizenMobile, message, false);
    }
}

app.get('/feedback/:grievanceId', (req, res) => {
    const { grievanceId } = req.params;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);

    if (!complaint) {
        return res.status(404).send("Grievance Not Found!");
    }
    res.render('feedback-form', { complaint });
});

app.post('/submit-feedback', (req, res) => {
    const { grievanceId, rating, comments } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);

    if (complaint) {
        complaint.rating = parseInt(rating) || 5;
        complaint.feedbackComments = comments || "";
        complaint.feedbackSubmittedAt = new Date();

        return res.send(`
            <div style="font-family: Arial; text-align: center; padding: 50px;">
                <h2>🙏 உங்கள் கருத்திற்கு மிக்க நன்றி!</h2>
                <p>உங்கள் கருத்துக்கள் எங்களின் சேவையை மேலும் மேம்படுத்த உதவும்.</p>
            </div>
        `);
    }
    res.redirect('/');
});

app.get('/admin/rating-dashboard', (req, res) => {
    const completedComplaints = complaintsList.filter(c => c.status === "Completed" && c.rating);

    const deptStats = {};
    completedComplaints.forEach(c => {
        const dept = c.forwardedTo || 'General';
        if (!deptStats[dept]) {
            deptStats[dept] = { totalRating: 0, count: 0 };
        }
        deptStats[dept].totalRating += c.rating;
        deptStats[dept].count += 1;
    });

    const leaderboard = Object.keys(deptStats).map(dept => ({
        department: dept,
        avgRating: (deptStats[dept].totalRating / deptStats[dept].count).toFixed(1),
        totalResolved: deptStats[dept].count
    })).sort((a, b) => b.avgRating - a.avgRating);

    res.render('rating-dashboard', { leaderboard, completedComplaints });
});

const { chromium } = require('playwright');

async function generatePDF() {
  let browser = null;
  try {
    // 1. HTML Content வரையறை
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="ta">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Arial', sans-serif; padding: 20px; }
          h1 { color: #0b3c5d; }
        </style>
      </head>
      <body>
        <h1>வணக்கம்!</h1>
        <p>இது மாதிரி HTML Content.</p>
      </body>
      </html>
    `;

    // 2. Playwright Browser-ஐ இயக்குதல்
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // 3. Content-ஐ செட் செய்து Load ஆகுமாறு பார்த்தல்
    await page.setContent(htmlContent, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // 4. Page Title-ஐ Console-ல் அச்சிடுதல்
    console.log('Page Title:', await page.title());

    // 5. PDF Buffer உருவாக்குதல்
    const pdfBuffer = await page.pdf({ 
      format: 'A4', 
      printBackground: true 
    });

    return pdfBuffer;

  } catch (error) {
    console.error("PDF உருவாக்கத்தில் பிழை ஏற்பட்டது:", error);
    throw error;
  } finally {
    // எர்ரர் வந்தாலும் வராவிட்டாலும் Browser சரியாக Close ஆகும்
    if (browser) {
      await browser.close();
    }
  }
}

// ஃபங்க்ஷனை இயக்கி சரிபார்க்க:
(async () => {
  const buffer = await generatePDF();
  console.log("PDF வெற்றிகரமாக உருவாக்கப்பட்டது! Buffer size:", buffer.length);
})();

const { generatePetitionPDF } = require('./generate-petition');

app.get('/generate-letter/:id', async (req, res) => {
    try {
        const complaintId = req.params.id;
        const complaint = complaintsList.find(c => c.id == complaintId);

        if (!complaint) {
            return res.status(404).send("மனு காணப்படவில்லை / Petition not found");
        }

        const pdfBuffer = await generatePetitionPDF(complaint);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Petition_${complaint.id}.pdf`);
        
        res.send(pdfBuffer);

    } catch (error) {
        console.error("PDF Generation Error:", error);
        res.status(500).send("PDF உருவாக்குவதில் பிழை ஏற்பட்டது.");
    }
});

async function sendEmailToOfficial(toEmail, subjectText, bodyText, pdfFilePath) {
    try {
        const mailOptions = {
            from: 'Grievance Redressal Portal <your-email@gmail.com>',
            to: toEmail, 
            subject: subjectText,
            text: bodyText,
            html: `<p>${bodyText}</p>`,
            
            attachments: [
                {
                    filename: 'Grievance_Report.pdf', 
                    path: pdfFilePath 
                }
            ]
        };

        let info = await transporter.sendMail(mailOptions);
        console.log('Email with PDF sent successfully: ' + info.response);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

// 1. அனைத்து மாவட்டங்களின் பெயர்களை பெற
app.get('/api/districts', (req, res) => {
    res.json(districtData.map(d => d.district));
});

app.get('/complaint-form', (req, res) => {
    res.render('complaint_form', { districtData: districtData });
});

// 2. தேர்ந்தெடுக்கப்பட்ட மாவட்டத்தின் தொகுதிகளை பெற
app.get('/api/constituencies/:district', (req, res) => {
    const districtName = req.params.district;
    const foundDistrict = districtData.find(d => d.district === districtName);
    if (foundDistrict) {
        res.json({
            constituencies: foundDistrict.constituencies
        });
    } else {
        res.status(404).json({ error: "District not found" });
    }
});

// 3. தேர்ந்தெடுக்கப்பட்ட தொகுதியின் MLA விவரங்களை பெற
app.get('/api/mla/:district/:constituency', (req, res) => {
    const { district, constituency } = req.params;
    
    res.json({
        name: "தொகுதி பிரதிநிதி (MLA)",
        party: "N/A",
        image: "https://via.placeholder.com/150",
        message: `வணக்கம்! ${constituency} தொகுதி பொதுமக்கள் தங்கள் மனுக்களை இங்கு சமர்ப்பிக்கலாம்.`
    });
});

// MLA விவரங்களை வழங்கும் API EndPoint
app.get('/api/mla', (req, res) => {
    const { district, constituency } = req.query;

    const mlaData = {
        "Chennai": {
            "Harbour": { name: "P. K. Sekar Babu", party: "DMK" },
            "Royapuram": { name: "iDream R. Murugesh", party: "DMK" }
        }
    };

    if (mlaData[district] && mlaData[district][constituency]) {
        res.json({
            success: true,
            mla: mlaData[district][constituency]
        });
    } else {
        res.json({
            success: false,
            message: "MLA information not found"
        });
    }
});

const { generateReceiptPDF, generateComplaintPDF } = require('./generate-receipt');

app.get('/download-receipt/:id', async (req, res) => {
    try {
        const complaint = complaintsList.find(c => String(c.grievanceId) === req.params.id || String(c.id) === req.params.id);
        if (!complaint) return res.status(404).send("மனு எண் கண்டறியப்படவில்லை");

        const pdfBuffer = await generateReceiptPDF(complaint);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Receipt_${req.params.id}.pdf`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error("Receipt Download Error:", err);
        res.status(500).send("PDF பதிவிறக்கம் செய்வதில் பிழை ஏற்பட்டது.");
    }
});

// AI Severity Auto Detector Integration
async function analyzeComplaintSeverity(text) {
    try {
        if (!process.env.GEMINI_API_KEY) return "Normal";
        const model = genAI.getGenerativeAIModel({ model: "gemini-1.5-flash" });
        const prompt = `Analyze this complaint and return ONLY "Urgent" if it poses immediate public danger, safety hazard, or risk to life, otherwise return "Normal". Complaint: "${text}"`;
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (e) {
        return "Normal";
    }
}

// Submit Complaint - Automatic PDF generation for MLA
app.post('/submit-complaint', uploadFields, async (req, res) => {
    try {
        const body = req.body || {};
        const citizenName = body.citizenName || body.applicantName || body.name || 'பெயர் குறிப்பிடப்படவில்லை';
        const description = body.description || body.details || body.message || 'விவரம் எதுவும் குறிப்பிடப்படவில்லை';

        let grievanceCategory = body.grievanceCategory || body.department || body.category;
        if (!grievanceCategory || grievanceCategory === 'பொதுத் துறை') {
            grievanceCategory = typeof autoCategorize === 'function' ? await autoCategorize(description) : 'பொதுத் துறை';
        }

        const autoPriority = await analyzeComplaintSeverity(description);
        const generatedId = `GRIEV-2026-000${complaintsList.length + 1}`;

        let mediaFile = "";
        let letterFile = "";
        if (req.files) {
            if (req.files['complaintMedia']) mediaFile = req.files['complaintMedia'][0].filename;
            if (req.files['complaintLetter']) letterFile = req.files['complaintLetter'][0].filename;
        }

        const newComplaint = {
            id: generatedId,
            grievanceId: generatedId,
            citizenName,
            applicantName: citizenName,
            citizenMobile: body.citizenMobile || body.mobile || '',
            district: body.district || '',
            constituency: body.constituency || '',
            wardZone: body.wardZone || body.ward || '',
            grievanceCategory,
            department: grievanceCategory,
            description,
            details: description,
            mediaFile,
            letterFile,
            recipient: body.recipient || 'MLA',
            status: 'Pending_Managaram',
            priority: autoPriority,
            createdDate: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString().split('T')[0]
        };

        complaintsList.push(newComplaint);

        // PDF தானாக generate ஆகி PDF பார்க்க வசதியாக link வழங்கப்படும்
        res.render('complaint_success', { 
            item: newComplaint,
            complaint: newComplaint,
            grievanceId: generatedId
        });

    } catch (error) {
        console.error("Submit Complaint Error:", error);
        res.status(500).send("மனு சமர்ப்பிப்பதில் பிழை ஏற்பட்டது.");
    }
});

const { generateMLAComplaintPDF } = require('./generate-petition');

app.get('/view-petition-pdf/:id', async (req, res) => {
    try {
        const grievanceId = req.params.id;
        const complaint = complaintsList.find(c => 
            String(c.grievanceId) === String(grievanceId) || 
            String(c.id) === String(grievanceId)
        );

        if (!complaint) {
            return res.status(404).send("மனு காணப்படவில்லை!");
        }

        const pdfBuffer = await generateMLAComplaintPDF(complaint);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Petition_${grievanceId}.pdf`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error("View PDF Error:", err);
        res.status(500).send("PDF திரையிடுவதில் பிழை ஏற்பட்டது.");
    }
});

app.get('/download-pdf/:id', async (req, res) => {
    try {
        const grievanceId = req.params.id;
        const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));

        if (!complaint) {
            return res.status(404).send("மனு எண் கண்டறியப்படவில்லை!");
        }

        const pdfBuffer = await generateReceiptPDF(complaint);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Receipt_${grievanceId}.pdf`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error(err);
        res.status(500).send("PDF பதிவிறக்கம் செய்ய முடியவில்லை.");
    }
});

const { generateCMForwardPDF } = require('./generate-pdf');

app.all('/cm/forward-to-collector-pdf', async (req, res) => {
    try {
        // generate-pdf.js-லிருந்து function-ஐ பெறுகிறோம்
        const { generateCMForwardPDF } = require('./generate-pdf');

        const grievanceId = req.body.grievanceId || req.query.grievanceId;

        let complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId) || String(c.id) === String(grievanceId));

        if (!complaint) {
            complaint = req.body;
        }

        if (!complaint || (!complaint.grievanceId && !complaint.id)) {
            return res.status(400).send("மனு எண் அல்லது தகவல்கள் சரியாக வழங்கப்படவில்லை.");
        }

        const pdfBuffer = await generateCMForwardPDF(complaint);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=CM_Forward_Letter_' + (complaint.grievanceId || complaint.id || 'Petition') + '.pdf');
        res.send(pdfBuffer);

    } catch (error) {
        console.error("CM Forward PDF Error:", error);
        res.status(500).send("PDF பதிவிறக்கம் செய்வதில் பிழை ஏற்பட்டது.");
    }
});

// Server Initialization
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started running on http://localhost:${PORT}`));