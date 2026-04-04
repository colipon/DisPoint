const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { db, save, getMsg } = require('../database');
const fetch = globalThis.fetch;

module.exports = {
    data: new SlashCommandBuilder().setName('user').setDescription('Settings').setNameLocalization('ja', 'user').setDescriptionLocalization('ja', 'ユーザー設定')
        .addSubcommand(s => s.setName('link').setDescription('Link MCID').addStringOption(o => o.setName('mcid').setDescription('Your Minecraft ID').setRequired(true)))
        .addSubcommand(s => s.setName('change').setDescription('Change MCID').addStringOption(o => o.setName('mcid').setDescription('New Minecraft ID').setRequired(true))),

    async execute(interaction) {
        const { options, user, locale } = interaction;
        const sub = options.getSubcommand();
        const lang = locale.startsWith('ja') ? 'ja' : 'en';

        // 設定系は自分にしか見えないように隠す(Ephemeral)
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});

        const mcid = options.getString('mcid');
        
        // Mojang APIでMCIDが存在するかチェック
        const prof = await fetch(`https://api.mojang.com/users/profiles/minecraft/${mcid}`)
            .then(r => r.status === 200 ? r.json() : null)
            .catch(() => null);

        if (!prof) return interaction.editReply({ content: getMsg(lang, 'invalid_id') });

        if (sub === 'link') {
            // 既に登録済みかチェック
            if (db.users[user.id]) return interaction.editReply({ content: getMsg(lang, 'already_linked') });
            
            // 新規登録
            db.users[user.id] = { 
                points: 0, 
                level: 1, 
                weeklyPoints: 0, 
                mcid: prof.name 
            };
        } else {
            // change の場合：未登録ならエラー
            if (!db.users[user.id]) return interaction.editReply({ content: getMsg(lang, 'not_linked') });
            
            // MCIDを更新
            db.users[user.id].mcid = prof.name;
        }

        save(); 
        return interaction.editReply({ content: getMsg(lang, 'link_success').replace('{name}', prof.name) });
    }
};
