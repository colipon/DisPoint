const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { db, save, hasPower, getMsg } = require('../database');

module.exports = {
    data: new SlashCommandBuilder().setName('pt').setDescription('Points management').setNameLocalization('ja', 'pt').setDescriptionLocalization('ja', 'ポイント操作・確認')
        .addSubcommand(s => s.setName('list').setDescription('Show ranking').setNameLocalization('ja', 'list').setDescriptionLocalization('ja', 'ランキングを表示'))
        .addSubcommand(s => s.setName('set').setDescription('Set points').setNameLocalization('ja', 'set').setDescriptionLocalization('ja', '【管理者】ポイント操作')
            .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Amount to add/remove').setRequired(true))),

    async execute(interaction) {
        const { options, member, locale } = interaction;
        const sub = options.getSubcommand();
        const lang = locale.startsWith('ja') ? 'ja' : 'en';

        const isEphemeral = !(sub === 'list');
        await interaction.deferReply({ flags: isEphemeral ? [MessageFlags.Ephemeral] : [] }).catch(() => {});

        // --- 🏆 ポイントランキング (list) ---
        if (sub === 'list') {
            const allSorted = Object.entries(db.users)
                .filter(([, d]) => d.points !== undefined)
                .sort(([, a], [, b]) => b.points - a.points);

            if (allSorted.length === 0) return interaction.editReply({ content: 'データがないよ。' });

            const itemsPerPage = 10;
            const totalPages = Math.ceil(allSorted.length / itemsPerPage);
            let currentPage = 0;

            const generatePage = async (page) => {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const currentData = allSorted.slice(start, end);

                const list = await Promise.all(currentData.map(async ([id, d], i) => {
                    const m = await interaction.guild.members.fetch(id).catch(() => null);
                    const name = m ? (m.nickname || m.user.username) : 'Unknown';
                    const mcidStr = d.mcid ? ` [${d.mcid}]` : '';
                    
                    const wk = d.weeklyPoints || 0;
                    let icon = '➖';
                    if (wk > 0) icon = '📈';
                    if (wk < 0) icon = '📉';

                    return `${start + i + 1}. **${name}**${mcidStr} | LV.${d.level || 1} (${d.points}pt)\n└ 週間: ${icon} ${wk >= 0 ? '+' : ''}${wk}pt`;
                }));

                return new EmbedBuilder()
                    .setTitle('🏆 ポイントランキング')
                    .setDescription(list.join('\n'))
                    .setColor(0x00AE86)
                    .setFooter({ text: `ページ ${page + 1} / ${totalPages} (${allSorted.length}名)` })
                    .setTimestamp();
            };

            const generateButtons = (page) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_pt')
                        .setLabel('◀️ 前へ')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('next_pt')
                        .setLabel('次へ ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1)
                );
            };

            const msg = await interaction.editReply({
                embeds: [await generatePage(currentPage)],
                components: totalPages > 1 ? [generateButtons(currentPage)] : []
            });

            if (totalPages <= 1) return;

            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120000 
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: "自分でコマンドを打って確認してね！", flags: [MessageFlags.Ephemeral] });
                }
                if (i.customId === 'prev_pt') currentPage--;
                if (i.customId === 'next_pt') currentPage++;
                await i.update({
                    embeds: [await generatePage(currentPage)],
                    components: [generateButtons(currentPage)]
                });
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => {});
            });
            return;
        }

        // --- ⚙️ ポイント操作 (set) ---
        if (sub === 'set') {
            if (!hasPower(member, 'set')) return interaction.editReply({ content: getMsg(lang, 'no_auth').replace('{power}', 'set') });
            const target = options.getUser('user');
            
            // ユーザーデータがない場合は初期化（またはエラー）
            if (!db.users[target.id]) {
                return interaction.editReply({ content: getMsg(lang, 'not_linked') });
            }
            
            const amt = options.getInteger('amount');
            
            // ポイント加算処理
            db.users[target.id].points = (db.users[target.id].points || 0) + amt;
            // 週間ポイントも同じ分だけ加算！
            db.users[target.id].weeklyPoints = (db.users[target.id].weeklyPoints || 0) + amt;
            
            save(); 
            
            return interaction.editReply({ 
                content: getMsg(lang, 'point_update')
                    .replace('{user}', target.username)
                    .replace('{amount}', amt) // もしメッセージ側にamountのプレースホルダーがあれば
            });
        }
    }
};