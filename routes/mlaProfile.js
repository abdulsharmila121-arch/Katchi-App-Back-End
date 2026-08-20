const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Data-வை நிரந்தரமாக சேமிக்கும் JSON Path
const dataFilePath = path.join(__dirname, '../mla_data.json');

// Helper: JSON Data-வை வாசிக்கும் function
function getMlaData() {
    if (fs.existsSync(dataFilePath)) {
        try {
            const rawData = fs.readFileSync(dataFilePath, 'utf-8');
            return JSON.parse(rawData);
        } catch (err) {
            console.error("JSON Read Error:", err);
        }
    }
    return {};
}

// Helper: Role மற்றும் ID/Constituency அடிப்படையில் Unique Key உருவாக்கும் ஃபங்க்ஷன்
function getMlaKey(req) {
    if (req.session) {
        const role = req.session.userRole || req.session.role || 'MLA';

        // 1. User ID இருந்தால் ID + Role (எ.கா: 101_Poruppalar)
        if (req.session.userId) {
            return `${req.session.userId}_${role}`;
        }

        // 2. Email இருந்தால் Email (எ.கா: poruppalar@gmail.com)
        if (req.session.userEmail) {
            return req.session.userEmail;
        }

        // 3. Constituency இருந்தால் Constituency + Role (எ.கா: Kanchipuram_Poruppalar & Kanchipuram_MLA)
        if (req.session.constituency) {
            return `${req.session.constituency}_${role}`;
        }

        if (req.session.user && req.session.user.email) {
            return req.session.user.email;
        }
    }
    return 'default_user';
}

// Public & Uploads folder சரிபார்க்கும் Logic
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});

// 1. Render Profile Edit Page
router.get('/mla/profile', (req, res) => {
    const allData = getMlaData();
    const mlaKey = getMlaKey(req);
    const userRole = req.session.userRole || req.session.role || 'MLA';

    const currentProfile = allData[mlaKey] || {
        name: userRole === 'Poruppalar' ? "பொறுப்பாளர் பெயர்" : "மாண்புமிகு MLA",
        party: "",
        designation: userRole === 'Poruppalar' ? "கட்சிப் பொறுப்பாளர்" : "சட்டமன்ற உறுப்பினர்",
        constituency: req.session.constituency || "காஞ்சிபுரம்",
        mobile: "",
        email: "",
        officeHours: "",
        address: "",
        profileImage: ""
    };

    res.render('mla_profile', { 
        mla: currentProfile,
        currentRole: userRole 
    });
});

// 2. Handle Profile Update
router.post('/mla/profile/update', (req, res) => {
    upload.single('profileImage')(req, res, function (err) {
        if (err) {
            return res.status(400).json({ success: false, message: "படம் பதிவேற்றுவதில் பிழை: " + err.message });
        }

        try {
            const { name, party, designation, constituency, mobile, email, officeHours, address } = req.body;
            
            const mlaKey = getMlaKey(req);
            let allData = getMlaData();
            let currentProfile = allData[mlaKey] || {};

            let profileImage = req.file ? `/uploads/${req.file.filename}` : (currentProfile.profileImage || '');

            // Data-வை Unique Key-க்கு கீழ் சேமித்தல்
            allData[mlaKey] = {
                name: name || currentProfile.name,
                party: party || currentProfile.party,
                designation: designation || currentProfile.designation,
                constituency: constituency || currentProfile.constituency,
                mobile: mobile || currentProfile.mobile,
                email: email || currentProfile.email,
                officeHours: officeHours || currentProfile.officeHours,
                address: address || currentProfile.address,
                profileImage: profileImage
            };

            // JSON File-ல் சேமித்தல்
            fs.writeFileSync(dataFilePath, JSON.stringify(allData, null, 4), 'utf-8');

            return res.json({ 
                success: true, 
                message: "சுயவிவரம் வெற்றிகரமாக புதுப்பிக்கப்பட்டது!",
                profileImage: profileImage
            });

        } catch (error) {
            console.error("Profile Logic Error:", error);
            return res.status(500).json({ success: false, message: "Profile Update செய்வதில் பிழை ஏற்பட்டது." });
        }
    });
});

module.exports = router;