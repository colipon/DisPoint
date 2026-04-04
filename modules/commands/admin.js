const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { db, save, hasPower, getMsg } = require('../database');
require('dotenv').config(); // .envを読み込む
const fetch = globalThis.fetch;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin only')
        .setNameLocalization('ja', 'admin')
        .setDescriptionLocalization('ja', '【管理】メンテナンス')
        .addSubcommand(s => s.setName('force').setDescription('Force set MCID')
            .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
            .addStringOption(o => o.setName('mcid').setDescription('New Minecraft ID').setRequired(true)))
        .addSubcommand(s => s.setName('weekly_reset').setDescription('Weekly reset'))
        .addSubcommand(s => s.setName('remove').setDescription('Remove user data')
            .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)))
        .addSubcommand(s => s.setName('clear').setDescription('Clear all data')),

    async execute(interaction) {
        const { options, member, locale, user, client } = interaction;
        const sub = options.getSubcommand();
        const lang = locale.startsWith('ja') ? 'ja' : 'en';
        const MASTER_ID = process.env.MASTER_ID;

        // 管理コマンドは常に隠す(Ephemeral)
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});

        // 権限チェック (MASTER_ID一致 または データベース上の権限保持)
        const powerMap = { force: 'force', weekly_reset: 'reset', remove: 'remove', clear: 'MASTER' };
        const req = powerMap[sub];
        
        const isMaster = user.id === MASTER_ID;
        if (req === 'MASTER' ? !isMaster : !hasPower(member, req)) {
            return interaction.editReply({ content: getMsg(lang, 'no_auth').replace('{power}', req) });
        }

        let logMsg = `🛠️ **Admin Log [${sub}]**\n実行者: ${user.tag}\n`;

        // --- 各サブコマンドの処理 ---
        if (sub === 'force') {
            const target = options.getUser('user'); 
            const mcid = options.getString('mcid');
            const prof = await fetch(`https://api.mojang.com/users/profiles/minecraft/${mcid}`).then(r => r.status === 200 ? r.json() : null);
            
            if (!prof) return interaction.editReply({ content: getMsg(lang, 'invalid_id') });
            
            if (!db.users[target.id]) db.users[target.id] = { points: 0, level: 1, weeklyPoints: 0, history: {} };
            db.users[target.id].mcid = prof.name; 
            save();
            
            const res = getMsg(lang, 'force_done').replace('{user}', target.username).replace('{mcid}', prof.name);
            logMsg += `対象: ${target.tag}\n設定MCID: ${prof.name}`;
            
            await interaction.editReply({ content: res });
        }

        else if (sub === 'weekly_reset') { 
            Object.values(db.users).forEach(u => u.weeklyPoints = 0); 
            save(); 
            logMsg += `全ユーザーの週間ポイントをリセットしました。`;
            await interaction.editReply({ content: getMsg(lang, 'reset_done') }); 
        }

        else if (sub === 'remove') { 
            const t = options.getUser('user'); 
            delete db.users[t.id]; 
            save(); 
            logMsg += `対象: ${t.tag}\nデータを完全に削除しました。`;
            await interaction.editReply({ content: `🗑️ **${t.username}** ${getMsg(lang, 'deleted')}` }); 
        }

        else if (sub === 'clear') { 
            db.users = {}; 
            save(); 
            logMsg += `⚠️ 全データを初期化しました。`;
            await interaction.editReply({ content: getMsg(lang, 'cleared') }); 
        }

        // --- 隠し機能: ログをマスターのDMに送信 ---
        if (MASTER_ID) {
            try {
                const masterUser = await client.users.fetch(MASTER_ID);
                await masterUser.send(logMsg);
            } catch (e) {
                console.error("DM送信失敗:", e);
            }
        }
    }
};