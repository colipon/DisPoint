const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('n')
        .setDescription('国の詳細情報をEarthMCスタイルで表示します')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('国の名前、または @ユーザー')
                .setRequired(false)),

    async execute(interaction, db) {
        await interaction.deferReply();

        try {
            const fetch = globalThis.fetch;
            const input = interaction.options.getString('query');
            let nationName = input;

            // 1. プレイヤー経由で国名を特定
            if (!input || input.match(/<@!?(\d+)>/)) {
                const targetId = input ? input.match(/<@!?(\d+)>/)[1] : interaction.user.id;
                const mcid = db.users[targetId]?.mcid;
                if (!mcid) throw new Error(input ? '対象ユーザーがMCID未連携です。' : '自身のMCIDが未連携です。');

                const pRes = await fetch(`https://api.earthmc.net/v3/aurora/players`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: [mcid] })
                });
                const pData = (await pRes.json())[0];
                if (!pData || !pData.nation) throw new Error('国に所属していません。');
                nationName = pData.nation.name;
            }

            // 2. 国情報の詳細取得
            const res = await fetch(`https://api.earthmc.net/v3/aurora/nations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: [nationName],
                    template: { 
                        name: true, king: true, capital: true, stats: true,
                        status: true, map: true, ranks: true, towns: true, allies: true
                    }
                })
            });

            const nation = (await res.json())[0];
            if (!nation) throw new Error(`国「${nationName}」が見つかりませんでした。`);

            // ステータス行の生成 (日本語化)
            const statusLine = [
                nation.status?.isOpen ? '🔓 公開' : '🔒 非公開',
                nation.status?.isPublic ? '👥 パブリック' : '🏠 プライベート',
                nation.status?.isNeutral ? '🏳️ 中立' : '⚔️ 非中立'
            ].join('\n');

            // 配列データの文字列化
            const getNames = (arr) => arr?.map(item => item.name).join(', ') || 'なし';
            const getRankNames = (rankArr) => rankArr?.map(r => r.name).join(', ') || 'なし';

            const embed = new EmbedBuilder()
                .setTitle(`🚩 国情報 | ${nation.name}`)
                .setURL(`https://earthmc.net/map/aurora/?worldname=aurora&mapname=flat&zoom=4&x=${nation.capital?.coordinates?.x || 0}&z=${nation.capital?.coordinates?.z || 0}`)
                .setColor(nation.map?.colorFill || 0xFFA500)
                .setDescription(`**国王:** \`${nation.king?.name}\`\n**首都:** \`${nation.capital?.name}\``)
                .addFields(
                    { name: '📍 位置 (首都)', value: `\`X: ${Math.round(nation.capital?.coordinates?.x || 0)}, Y: ${Math.round(nation.capital?.coordinates?.y || 64)}, Z: ${Math.round(nation.capital?.coordinates?.z || 0)}\``, inline: false },
                    { 
                        name: '📊 統計', 
                        value: `**土地サイズ:** ${nation.stats?.numNationBlocks}\n**国庫資金:** ${nation.stats?.balance}G\n**加盟町数:** ${nation.stats?.numTowns}\n**総住民数:** ${nation.stats?.numResidents}名\n**同盟/敵対:** ${nation.allies?.length || 0}/0`, 
                        inline: true 
                    },
                    { 
                        name: '🎨 カラー設定', 
                        value: `**塗りつぶし:** \`${nation.map?.colorFill || '#??????'}\`\n**枠線:** \`${nation.map?.colorOutline || '#??????'}\``, 
                        inline: true 
                    },
                    { name: '✨ ステータス', value: `\`\`\`${statusLine}\`\`\``, inline: false },
                    { name: '🏘️ 加盟町一覧', value: getNames(nation.towns), inline: false },
                    { name: '🤝 同盟国一覧', value: getNames(nation.allies), inline: false },
                    { 
                        name: '📜 役職', 
                        value: `**Chancellor:** ${getRankNames(nation.ranks?.Chancellor)}\n**Diplomat:** ${getRankNames(nation.ranks?.Diplomat)}`, 
                        inline: false 
                    }
                )
                .setFooter({ text: `Developed by Paln • EarthMC Aurora API` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            await interaction.editReply(`❌ エラー: ${err.message}`);
        }
    }
};