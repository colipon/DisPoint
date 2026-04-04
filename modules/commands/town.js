const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('t')
        .setDescription('町の詳細情報をEarthMCスタイルで表示します')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('町の名前、または @ユーザー')
                .setRequired(false)),

    async execute(interaction, db) {
        await interaction.deferReply();

        try {
            const fetch = globalThis.fetch;
            const input = interaction.options.getString('query');
            let townName = input;

            // 1. プレイヤー経由の検索
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
                if (!pData || !pData.town) throw new Error('町に所属していません。');
                townName = pData.town.name;
            }

            // 2. 町情報の詳細取得
            const res = await fetch(`https://api.earthmc.net/v3/aurora/towns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: [townName],
                    template: { 
                        name: true, mayor: true, nation: true, coordinates: true,
                        stats: true, status: true, flags: true, permissions: true,
                        ranks: true, trusted: true, outlaws: true
                    }
                })
            });

            const town = (await res.json())[0];
            if (!town) throw new Error(`町「${townName}」が見つかりませんでした。`);

            // ステータスフラグの生成 (日本語化)
            const statusEmoji = (val) => val ? '✅' : '❌';
            const statusLine = [
                town.status?.isOpen ? '🔓 公開' : '🔒 非公開',
                town.status?.isPublic ? '👥 パブリック' : '🏠 プライベート',
                town.status?.isNeutral ? '🏳️ 中立' : '⚔️ 非中立'
            ].join('\n');

            // 権限の文字列化
            const formatPerms = (p) => {
                if (!p) return '----';
                return `${p.resident ? 'R' : '-'}${p.nation ? 'N' : '-'}${p.ally ? 'A' : '-'}${p.outsider ? 'O' : '-'}`;
            };

            const embed = new EmbedBuilder()
                .setTitle(`🏘️ 町情報 | ${town.name}`)
                .setURL(`https://earthmc.net/map/aurora/?worldname=aurora&mapname=flat&zoom=5&x=${town.coordinates.spawn.x}&z=${town.coordinates.spawn.z}`)
                .setColor(0x2ecc71)
                .setDescription(`**町長:** \`${town.mayor?.name}\`\n**所属国:** \`${town.nation?.name || '無所属'}\``)
                .addFields(
                    { name: '📍 位置 (スポーン地点)', value: `\`X: ${Math.round(town.coordinates.spawn.x)}, Y: ${Math.round(town.coordinates.spawn.y)}, Z: ${Math.round(town.coordinates.spawn.z)}\``, inline: false },
                    { 
                        name: '📊 統計', 
                        value: `**サイズ:** ${town.stats?.numTownBlocks}/${town.stats?.maxTownBlocks}\n**資金:** ${town.stats?.balance}G\n**住民数:** ${town.stats?.numResidents}名\n**Trusted/Outlaws:** ${town.trusted?.length || 0}/${town.outlaws?.length || 0}`, 
                        inline: true 
                    },
                    { 
                        name: '🛡️ 土地情報', 
                        value: `**Overclaim:** ${town.status?.isOverclaimed ? '警告あり' : '安全'}\n**シールド:** ${town.status?.isRuined ? '停止中' : '稼働中'}`, 
                        inline: true 
                    },
                    { name: '✨ ステータス', value: `\`\`\`${statusLine}\`\`\``, inline: false },
                    { 
                        name: '🚩 フラグ', 
                        value: `爆発: ${statusEmoji(town.flags?.explosions)}\n湧き: ${statusEmoji(town.flags?.mobs)}\n延焼: ${statusEmoji(town.flags?.fire)}\nPVP: ${statusEmoji(town.flags?.pvp)}`, 
                        inline: true 
                    },
                    { 
                        name: '⚖️ 権限設定', 
                        value: `建築: \`${formatPerms(town.permissions?.build)}\`\n破壊: \`${formatPerms(town.permissions?.destroy)}\`\n切替: \`${formatPerms(town.permissions?.switch)}\`\n使用: \`${formatPerms(town.permissions?.itemUse)}\``, 
                        inline: true 
                    },
                    { name: '📜 Councillors', value: town.ranks?.Councillor?.map(c => c.name).join(', ') || 'なし' }
                )
                .setFooter({ text: `Developed by Paln • EarthMC Aurora API` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            await interaction.editReply(`❌ エラー: ${err.message}`);
        }
    }
};