const fs = require('fs');
const DATA_FILE = './points_data.json';
require('dotenv').config();

let db = { users: {}, admins: {} };

if (fs.existsSync(DATA_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { console.error("⚠️ DB Load Error", e); }
}

const save = () => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
};

// プレイ時間を記録 (分単位)
const recordPlayTime = (userId, minutes) => {
    const today = new Date().toISOString().split('T')[0];
    if (!db.users[userId]) {
        db.users[userId] = { points: 0, level: 1, weeklyPoints: 0, mcid: null, history: {} };
    }
    if (!db.users[userId].history) db.users[userId].history = {};
    
    db.users[userId].history[today] = (db.users[userId].history[today] || 0) + minutes;
    // ログイン時間もポイントとして加算する場合
    db.users[userId].points += minutes; 
    save();
};

const hasPower = (member, power) => {
    if (!member) return false;
    if (member.id === process.env.MASTER_ID) return true;
    if (db.admins[member.id]?.[power] !== undefined) return db.admins[member.id][power];
    const roles = member.roles.cache;
    if (roles.has(process.env.ADMIN_ROLE_ID)) return true;
    return false;
};

module.exports = { db, save, hasPower, recordPlayTime, getMsg: (l, k) => k };