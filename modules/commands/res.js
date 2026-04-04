const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../database');
const fetch = globalThis.fetch;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('res')
        .setDescription('プレイヤー詳細を表示')
        .addStringOption(o => o.setName('target').setDescription('@ユーザー または MCIDを入力')),

    async execute(interaction) {
        const input = interaction.options.getString('target');
        await interaction.deferReply();

        let searchMcid = "";
        let displayTargetName = ""; 

        // --- 🔍 入力判定 ---
        if (!input) {
            const myData = db.users[interaction.user.id];
            if (!myData || !myData.mcid) return interaction.editReply("❌ 自分のMCIDが未連携です。");
            searchMcid = myData.mcid;
            displayTargetName = interaction.member?.displayName || interaction.user.username;
        } else {
            const mentionMatch = input.match(/^<@!?(\d+)>$/);
            if (mentionMatch) {
                const userId = mentionMatch[1];
                const userData = db.users[userId];
                if (!userData || !userData.mcid) return interaction.editReply("❌ そのユーザーはMCIDを連携していません。");
                searchMcid = userData.mcid;
                const user = await interaction.client.users.fetch(userId).catch(() => ({ username: "Unknown" }));
                displayTargetName = user.username;
            } else {
                searchMcid = input.replace('@', '');
                displayTargetName = searchMcid;
            }
        }

        try {
            // --- 1. プレイヤー情報の取得 ---
            const pRes = await fetch(`https://api.earthmc.net/v3/aurora/players`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: [searchMcid] })
            });
            const pData = await pRes.json();
            const p = pData[0];

            if (!p) return interaction.editReply(`❌ EarthMC上に \`${searchMcid}\` は見つかりませんでした。`);

            // --- 2. 街・国の座標を取得してリンクを生成する関数 ---
const getAffiliationLink = async (affObj, type) => {
                // 資料より: データが存在しない場合はキー自体が省略される
                // そのため、呼び出し元で p.town や p.nation が無い場合はここに来ないか null になる
                if (!affObj || !affObj.name || !affObj.uuid) return 'なし';
                
                const { name, uuid } = affObj;

                try {
                    const baseUrl = `https://api.earthmc.net/v3/aurora/${type}s`;
                    
                    // 資料準拠: POSTでUUIDをクエリ。必要なフィールドだけ指定するtemplateも活用可能
                    const detailRes = await fetch(baseUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            query: [uuid],
                            template: { name: true, coordinates: true } // 座標だけあればOK
                        })
                    });
                    
                    const detailedData = await detailRes.json();
                    const detail = detailedData[0];
                    
                    // 資料の座標構造: coordinates.spawn.x, coordinates.spawn.z
                    if (detail?.coordinates?.spawn) {
                        const { x, z } = detail.coordinates.spawn;
                        const zoom = type === 'town' ? 4 : 2;
                        const url = `https://map.earthmc.net/?world=minecraft_overworld&zoom=${zoom}&x=${Math.floor(x)}&z=${Math.floor(z)}`;
                        return `[${name}](${url})`;
                    }
                    return name;
                } catch (err) {
                    console.error(`${type} Link Error:`, err);
                    return name;
                }
            };

            // 資料の「Data is omitted if it does not exist」に対応
            // p.town や p.nation が存在しない場合は null を渡す
            const townLink = await getAffiliationLink(p.town || null, 'town');
            const nationLink = await getAffiliationLink(p.nation || null, 'nation');

            // --- 🕒 各種データの整形 ---
            const isOnline = p.status.isOnline;
            const isKing = p.status.isKing;
            const isMayor = p.status.isMayor;
            const roleTitle = isKing ? " (👑国王)" : (isMayor ? " (市長)" : "");
            
            const fRelTime = (ms) => ms ? `<t:${Math.floor(ms / 1000)}:R>` : '不明';
            const townStayDays = p.timestamps.joinedTownAt ? Math.floor((Date.now() - p.timestamps.joinedTownAt) / 86400000) : '？';

            const filterRanks = (ranks, def) => {
                const filtered = (ranks || []).filter(r => r !== def && r !== 'Mayor' && r !== 'King');
                return filtered.length > 0 ? `\`${filtered.join(', ')}\`` : '（なし）';
            };

            // --- 📈 アクティビティ生成 ---
            const history = db.users[Object.keys(db.users).find(id => db.users[id].mcid?.toLowerCase() === p.name.toLowerCase())]?.history || {};
            const grass = generateGrass(history);

            // --- 🖼️ Embed作成 ---
            const embed = new EmbedBuilder()
                .setTitle(`${isOnline ? '🟢' : '🔴'} ${displayTargetName}${roleTitle}`)
                .setDescription(`MCID: \`${p.name}\``)
                .setThumbnail(`https://mc-heads.net/avatar/${p.uuid}/100`)
                .setColor(isKing ? 0xFFD700 : (isOnline ? 0x00FF00 : 0xFF0000))
                .addFields(
                    { name: '🏘️ 所属', value: `街: **${townLink}${isMayor ? ' (市長)' : ''}**\n国: **${nationLink}${isKing ? ' (国王)' : ''}**`, inline: true },
                    { name: '💰 経済', value: `所持金: **${p.stats.balance}G**`, inline: true },
                    { name: '📜 役職', value: `街: ${filterRanks(p.ranks?.townRanks, 'Resident')}\n国: ${filterRanks(p.ranks?.nationRanks, 'Citizen')}`, inline: true },
                    { 
                        name: '🛡️ 権限設定 (友/国/同/外)', 
                        value: `建築: ${p.perms?.build.map(b => b ? '✅' : '❌').join('')}\n破壊: ${p.perms?.destroy.map(b => b ? '✅' : '❌').join('')}\n操作: ${p.perms?.switch.map(b => b ? '✅' : '❌').join('')}\n使用: ${p.perms?.itemUse.map(b => b ? '✅' : '❌').join('')}`, 
                        inline: true 
                    },
                    { 
                        name: '📊 活動状況', 
                        value: `📅 **登録:** ${new Date(p.timestamps.registered).toLocaleDateString()}\n🏠 **所属:** ${townStayDays} 日間\n🔌 **接続:** ${isOnline ? `🟢 **オン**` : `🔴 **オフ** (${fRelTime(p.timestamps.lastOnline)})`}`, 
                        inline: true 
                    },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '📈 アクティビティ (直近35日間)', value: `\n${grass}`, inline: false }
                )
                .setFooter({ text: `UUID: ${p.uuid}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            console.error(e);
            return interaction.editReply("⚠️ APIエラーが発生しました。");
        }
    }
};

// --- generateGrass 関数 (以前提供した日本時間固定版) ---
function generateGrass(hist = {}) {
    const getJSTDateObj = (date = new Date()) => {
        const jstTime = date.getTime() + (9 * 60 * 60 * 1000);
        return new Date(jstTime);
    };
    const formatDate = (date) => {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    const now = new Date();
    const jstNow = getJSTDateObj(now);
    const todayStr = formatDate(jstNow);
    const todayDay = jstNow.getUTCDay();
    const endOfThisWeek = new Date(jstNow);
    endOfThisWeek.setUTCDate(jstNow.getUTCDate() + (6 - todayDay));

    const result = [];
    for (let i = 34; i >= 0; i--) {
        const d = new Date(endOfThisWeek);
        d.setUTCDate(endOfThisWeek.getUTCDate() - i);
        
        const dateStr = formatDate(d);

        // 未来判定
        if (dateStr > todayStr) {
            result.push('⬛');
            continue;
        }

        const mins = hist[dateStr] || 0;
        
        // --- 判定ロジック ---
        if (mins === 0) result.push(':black_large_square:');
        else if (mins < 15) result.push(':red_square:');
        else if (mins < 30) result.push(':orange_square:');
        else if (mins < 60) result.push(':yellow_square:');
        else if (mins < 120) result.push(':green_square:');
        else if (mins < 180) result.push(':sparkle:');
        else if (mins < 300) result.push(':eight_spoked_asterisk:');
        else if (mins < 720) result.push(':white_flower:');
        else result.push(':100:');
    }

    // --- 整形 (5行固定) ---
    let grassStr = "--- 日 月 火 水 木 金 土\n";
    const labels = ["５", "４", "３", "２", "現"];
    for (let i = 0; i < 5; i++) {
        const row = result.slice(i * 7, (i + 1) * 7).join('');
        grassStr += `${labels[i]} ${row}\n`;
    }
    
    return grassStr;
};
