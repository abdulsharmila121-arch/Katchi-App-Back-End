const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. Data-வை நிரந்தரமாக சேமிக்க JSON File உருவாக்கும் வழிமுறை
const dataFilePath = path.join(__dirname, '../mla_data.json');

// JSON கோப்பை வாசிக்கும் Helper Function
function getMlaData() {
    if (fs.existsSync(dataFilePath)) {
        try {
            const rawData = fs.readFileSync(dataFilePath, 'utf-8');
            return JSON.parse(rawData);
        } catch (err) {
            console.error("JSON Read Error:", err);
        }
    }
    // Default Data (முதன்முதலில் காட்டப்படும் விவரங்கள்)
    return {
        name: "மாண்புமிகு MLA",
        party: "கட்சி பெயர்",
        designation: "சட்டமன்ற உறுப்பினர்",
        constituency: "காஞ்சிபுரம்",
        mobile: "9876543210",
        email: "mla@tn.gov.in",
        officeHours: "காலை 09:00 - மாலை 05:00",
        address: "12, தாலுகா அலுவலக வீதி, காஞ்சிபுரம்",
        profileImage: ""
    };
}

// 2. Public & Uploads Folder சரிபார்க்கும் Logic
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 3. Storage Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'mla-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});

// Helper: லாகின் செய்த MLA-வின் Unique Key எடுக்கும் முறை
function getMlaKey(req) {
    if (req.session && req.session.userId) return req.session.userId;
    if (req.session && req.session.user && req.session.user.email) return req.session.user.email;
    if (req.session && req.session.constituency) return req.session.constituency;
    return 'default_mla'; // ஏதும் இல்லை என்றால் Default
}

// 1. Render Profile Edit Page
router.get('/mla/profile', (req, res) => {
    const allData = getMlaData();
    const mlaKey = getMlaKey(req); // லாகின் பயனரின் Key
    
    const currentMla = allData[mlaKey] || {
        name: "மாண்புமிகு MLA",
        party: "",
        designation: "சட்டமன்ற உறுப்பினர்",
        constituency: req.session.constituency || "காஞ்சிபுரம்",
        mobile: "",
        email: "",
        officeHours: "",
        address: "",
        profileImage: ""
    };

    res.render('mla_profile', { mla: currentMla });
});

// 2. Handle Profile Update
router.post('/mla/profile/update', (req, res) => {
    upload.single('profileImage')(req, res, function (err) {
        if (err) {
            return res.status(400).json({ success: false, message: "படம் பதிவேற்றுவதில் பிழை: " + err.message });
        }

        try {
            const { name, party, designation, constituency, mobile, email, officeHours, address } = req.body;
            
            const mlaKey = getMlaKey(req); // லாகின் பயனரின் Key
            let allData = getMlaData();
            let currentMla = allData[mlaKey] || {};

            let profileImage = req.file ? `/uploads/${req.file.filename}` : (currentMla.profileImage || '');

            // குறிப்பிட்ட MLA-வின் Key-ன் கீழ் சேமித்தல்
            allData[mlaKey] = {
                name: name || currentMla.name,
                party: party || currentMla.party,
                designation: designation || currentMla.designation,
                constituency: constituency || currentMla.constituency,
                mobile: mobile || currentMla.mobile,
                email: email || currentMla.email,
                officeHours: officeHours || currentMla.officeHours,
                address: address || currentMla.address,
                profileImage: profileImage
            };

            // mla_data.json கோப்பில் எழுதுதல்
            fs.writeFileSync(dataFilePath, JSON.stringify(allData, null, 4), 'utf-8');

            console.log(`[SAVED] MLA Data Saved for Key: ${mlaKey}`);

            return res.json({ 
                success: true, 
                message: "சுயவிவரம் வெற்றிகரமாக புதுப்பிக்கப்பட்டது!",
                profileImage: profileImage
            });

        } catch (error) {
            console.error("Profile Error:", error);
            return res.status(500).json({ success: false, message: "Profile Update செய்வதில் பிழை ஏற்பட்டது." });
        }
    });
});

module.exports = router;