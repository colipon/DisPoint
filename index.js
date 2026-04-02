const { Client, MessageFlags, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const fetch = require('node-fetch');
const readline = require('readline');
require('dotenv').config();

// --- 設定エリア ---
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DATA_FILE = './points_data.json';
const MASTER_ID = process.env.MASTER_ID;
const LEVEL_UP_STEP = Number(process.env.LVLUP_STEP) || 10;
// ----------------

let targetChannelId = null;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ] 
});

// ターミナル用
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});

// ログ出力用
function logToConsole(message) {
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(message + '\n');
    rl.prompt(true);
}

// 画面初期化
function initscreen() {
    console.clear(); 
    logToConsole("========================================");
    logToConsole("      Discord Bot Control Panel");
    logToConsole("========================================");
    logToConsole(`Token:      ${TOKEN ? '✅ Loaded' : '❌ Missing'}`);
    logToConsole(`Client ID:  ${CLIENT_ID}`);
    logToConsole(`Master ID:  ${MASTER_ID}`);
    logToConsole(`LVL UP Pt:  ${LEVEL_UP_STEP}`);
    logToConsole("----------------------------------------");
}

// データ管理
let db = { users: {}, lastMessageId: null, admins: [MASTER_ID] };
if (fs.existsSync(DATA_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { logToConsole("⚠️ データ読み込み失敗"); }
}
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

// ターミナルでのコマンド処理
rl.on('line', async (line) => {
    const args = line.trim().split(' ');
    const command = args[0];

    switch (command) {
        case '/ch':
            if (args[1]) {
                targetChannelId = args[1];
                logToConsole(`ターゲットチャンネルを [${targetChannelId}] に設定しました。`);
            } else {
                logToConsole("❌ 使用法: /ch <チャンネルID>");
            }
            break;

        case '/list':
            logToConsole("\n--- 現在のランキング ---");
            const sorted = Object.entries(db.users).sort(([,a], [,b]) => b.points - a.points).slice(0, 10);
            sorted.forEach(([id, d], i) => {
                logToConsole(`${i+1}. ID:${id} | ${d.mcid || '未連携'} | ${d.points}pt (LV.${d.level})`);
            });
            logToConsole("---------------------------\n");
            break;
        
        case '/clear':
            initscreen();
            break;

        case '/exit':
            logToConsole("Exiting...");
            process.exit(0);
            break;

        default:
            if (targetChannelId) {
                const channel = await client.channels.fetch(targetChannelId).catch(() => null);
                if (channel) {
                    channel.send(line);
                    logToConsole(`✉️ Discordへ送信: ${line}`);
                } else {
                    logToConsole("❌ チャンネルが見つかりません。");
                }
            } else {
                logToConsole("⚠️ /ch <ID> で送信先を指定してください。");
            }
            break;
    }
    rl.prompt();
});

// ユーザーデータの初期化
function initUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = { points: 0, level: 1, weeklyPoints: 0, mcid: null };
    }
}

// ポイント更新処理
function updateUserData(userId, messageId, amount = 1) {
    initUser(userId);
    db.users[userId].points += amount;
    db.users[userId].weeklyPoints = (db.users[userId].weeklyPoints || 0) + amount;
    db.users[userId].level = Math.max(1, Math.floor(db.users[userId].points / LEVEL_UP_STEP) + 1);
    if (messageId) db.lastMessageId = messageId;
}

// MCIDの実在チェック
async function getMcProfile(mcid) {
    try {
        const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${mcid}`);
        if (res.status === 200) return await res.json();
        return null;
    } catch (e) { return null; }
}

// MCIDの重複チェック
function getOwnerOfMcid(mcid) {
    const entry = Object.entries(db.users).find(([id, data]) => data.mcid && data.mcid.toLowerCase() === mcid.toLowerCase());
    return entry ? entry[0] : null;
}

// --- コマンド登録 (REST) ---
const commands = [
    new SlashCommandBuilder().setName('pt').setDescription('ポイントシステム')
        .addSubcommand(sub => sub.setName('list').setDescription('ランキングを表示'))
        .addSubcommand(sub => sub.setName('mclink').setDescription('MCIDと連携').addStringOption(o => o.setName('mcid').setRequired(true).setDescription('MCID')))
        .addSubcommand(sub => sub.setName('mchange').setDescription('MCIDを変更').addStringOption(o => o.setName('mcid').setRequired(true).setDescription('新しいMCID')))
        .addSubcommand(sub => sub.setName('mforce').setDescription('【マスター】MCID強制設定').addUserOption(o => o.setName('user').setRequired(true).setDescription('対象')).addStringOption(o => o.setName('mcid').setRequired(true).setDescription('MCID')))
        .addSubcommand(sub => sub.setName('set').setDescription('ポイント加減算').addUserOption(o => o.setName('user').setRequired(true).setDescription('対象')).addIntegerOption(o => o.setName('amount').setRequired(true).setDescription('追加する値')))
        .addSubcommand(sub => sub.setName('weekly_reset').setDescription('週間リセット'))
        .addSubcommand(sub => sub.setName('admin_add').setDescription('管理者追加').addUserOption(o => o.setName('user').setRequired(true).setDescription('対象')))
        .addSubcommand(sub => sub.setName('admin_remove').setDescription('管理者削除').addUserOption(o => o.setName('user').setRequired(true).setDescription('対象')))
        .addSubcommand(sub => sub.setName('clear').setDescription('全データ初期化'))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (e) { console.error(e); }
})();

// 起動処理
client.once('clientReady', async () => {
    logToConsole(`${client.user.tag} has Launched!`);
    rl.prompt();
});

// リアルタイム監視
client.on('messageCreate', (msg) => {
    if (msg.author.bot) return;
    updateUserData(msg.author.id, msg.id, 1);
    save();
});

// コマンド処理（ログ出力追加）
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'pt') return;

    const sub = interaction.options.getSubcommand();
    const user = interaction.user;
    
    // ターミナルに実行ログを流す
    logToConsole(`${user.username}@${user.id} > /pt ${sub}`);

    try {
        const userId = user.id;
        const isMaster = (userId === MASTER_ID);
        const isAdmin = db.admins.includes(userId) || isMaster;

        if (sub === 'list') {
            const sorted = Object.entries(db.users).sort(([,a], [,b]) => b.points - a.points).slice(0, 10);
            const listLines = await Promise.all(sorted.map(async ([id, d], i) => {
                const member = await interaction.guild.members.fetch(id).catch(() => null);
                const name = member ? member.user.username : 'Unknown';
                const weekly = d.weeklyPoints || 0;
                return `${i+1}. **@${name}**${d.mcid ? ` [${d.mcid}]` : ''} | LV.${d.level} (${d.points}pt) | 週間:${weekly}pt`;
            }));
            const embed = new EmbedBuilder().setTitle('🏆 ポイントランキング').setDescription(listLines.join('\n') || 'データなし').setColor(0x2f3136);
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'mclink' || sub === 'mchange') {
            const mcid = interaction.options.getString('mcid');
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const existingOwner = getOwnerOfMcid(mcid);
            if (existingOwner && existingOwner !== userId) return interaction.editReply(`❌ 使用中のIDです。`);
            const profile = await getMcProfile(mcid);
            if (!profile) return interaction.editReply('❌ 実在しません。');
            initUser(userId);
            db.users[userId].mcid = profile.name;
            save();
            return interaction.editReply(`✅ \`${profile.name}\` と連携しました！`);
        }

        if (sub === 'mforce') {
            if (!isMaster) return interaction.reply({ content: '❌ 権限なし', flags: [MessageFlags.Ephemeral] });
            const target = interaction.options.getUser('user');
            const mcid = interaction.options.getString('mcid');
            const profile = await getMcProfile(mcid);
            if (!profile) return interaction.reply('❌ 実在しません。');
            initUser(target.id);
            db.users[target.id].mcid = profile.name;
            save();
            return interaction.reply(`🛡️ ${target.username} を \`${profile.name}\` に設定しました。`);
        }

        if (sub === 'set') {
            if (!isAdmin) return interaction.reply({ content: '❌ 権限なし', flags: [MessageFlags.Ephemeral] });
            const target = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            updateUserData(target.id, null, amount);
            save();
            return interaction.reply(`✅ ${target.username} : ${db.users[target.id].points}pt`);
        }

        if (sub === 'weekly_reset') {
            if (!isAdmin) return interaction.reply({ content: '❌ 権限なし', flags: [MessageFlags.Ephemeral] });
            Object.values(db.users).forEach(u => u.weeklyPoints = 0);
            save();
            return interaction.reply('週間リセット完了。');
        }

        if (sub === 'admin_add' || sub === 'admin_remove') {
            if (!isMaster) return interaction.reply({ content: '❌ 権限なし', flags: [MessageFlags.Ephemeral] });
            const target = interaction.options.getUser('user');
            if (sub === 'admin_add') { if (!db.admins.includes(target.id)) db.admins.push(target.id); }
            else { if (target.id !== MASTER_ID) db.admins = db.admins.filter(id => id !== target.id); }
            save();
            return interaction.reply(`管理者更新。`);
        }

        if (sub === 'clear') {
            if (!isAdmin) return interaction.reply({ content: '❌ 権限なし', flags: [MessageFlags.Ephemeral] });
            db.users = {}; save();
            return interaction.reply('データ初期化。');
        }

    } catch (error) {
        logToConsole(`⚠️ Error: ${error.message}`);
        if (!interaction.replied) interaction.reply({ content: 'エラーが発生しました: ', flags: [MessageFlags.Ephemeral] });
    }
});

client.login(TOKEN);
initscreen();