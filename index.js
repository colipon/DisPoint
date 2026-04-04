const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const { db, recordPlayTime, save } = require('./modules/database');
const fetch = globalThis.fetch;
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// --- 🛠️ 設定 ---
const MASTER_ID = process.env.MASTER_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

client.commands = new Collection();
const commandFiles = fs.readdirSync('./modules/commands').filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./modules/commands/${file}`);
    client.commands.set(command.data.name, command);
}

// --- ログ送信関数 ---
const sendLog = async (content) => {
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (channel) await channel.send(content);
    } catch (e) { console.error("ログ送信エラー:", e); }
};

// --- 🕵️ EarthMC 監視ロジック ---
setInterval(async () => {
    const userMap = {};
    const mcids = Object.entries(db.users).map(([id, data]) => {
        if (data.mcid) { userMap[data.mcid.toLowerCase()] = id; return data.mcid; }
    }).filter(Boolean);
    if (mcids.length === 0) return;
    try {
        const res = await fetch(`https://api.earthmc.net/v3/aurora/players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: mcids })
        });
        const players = await res.json();
    } catch (e) { console.error("監視エラー:", e); }
}, 5 * 60 * 1000);

client.once('clientReady', () => console.log(`🚀 EURM Online: Monitoring ${Object.keys(db.users).length} users.`));

// --- 👑 !master コマンド (GUIパネル & コマンド対応) ---
client.on('messageCreate', async message => {
    if (message.author.bot || message.author.id !== MASTER_ID) return;

    // --- !clear (チャンネルの全メッセージ削除) ---
    if (message.content === '!clear') {
        const confirmEmbed = new EmbedBuilder()
            .setTitle("⚠️ ログ全削除の確認")
            .setDescription("このチャンネルのメッセージをすべて（最大100件）削除しますか？")
            .setColor(0xFF0000);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_clear_all').setLabel('実行する').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_clear').setLabel('キャンセル').setStyle(ButtonStyle.Secondary)
        );

        return message.reply({ embeds: [confirmEmbed], components: [row] });
    }

    // --- !mclear (マスターコマンド系の掃除) ---
    if (message.content === '!mclear') {
        const messages = await message.channel.messages.fetch({ limit: 100 });
        
        // !masterから始まるメッセージ、またはBot自身のメッセージ（返信など）を抽出
        const targets = messages.filter(m => 
            m.content.startsWith('!master') || 
            m.content.startsWith('!mclear') ||
            m.author.id === client.user.id
        );

        if (targets.size > 0) {
            await message.channel.bulkDelete(targets, true);
            const notice = await message.channel.send(`🧹 マスター関連のログを ${targets.size} 件掃除したよ！`);
            setTimeout(() => notice.delete().catch(() => {}), 3000); // 3秒後に通知も消す
        } else {
            const notice = await message.reply("掃除する対象が見つからなかったよ。");
            setTimeout(() => notice.delete().catch(() => {}), 3000);
        }
    }

    if (message.content.startsWith('!master')) {
        const args = message.content.split(/\s+/);
        const sub = args[1]; 
        let targetId = message.mentions.users.first()?.id || (args[2] && /^\d+$/.test(args[2]) ? args[2] : null);

        if (!sub || sub === 'help') {
            return message.reply("👑 **Master Commands**\n`!master status <@user/ID>` - GUI管理パネル表示\n`!master list` - 登録者数確認");
        }

        if (sub === 'list') return message.reply(`📊 登録ユーザー数: ${Object.keys(db.users).length}名`);

        if (!targetId) return message.reply("❌ ユーザーをメンションするか、IDを入力してください。");

        // GUIパネルの表示
        if (sub === 'status') {
            try {
                const target = await client.users.fetch(targetId);
                const data = db.users[target.id] || { history: {} };

                const embed = new EmbedBuilder()
                    .setTitle(`⚙️ 管理パネル: ${target.tag}`)
                    .setDescription(`Discord ID: \`${target.id}\`\nMCID: \`${data.mcid || '未連携'}\``)
                    .setThumbnail(target.displayAvatarURL())
                    .addFields(
                        { name: '🚫 BAN状態', value: data.isBanned ? '✅ **BAN中**' : '❌ 正常', inline: true },
                        { name: '👑 管理者権限', value: data.isMaster ? '✅ **あり**' : '❌ なし', inline: true }
                    )
                    .setColor(data.isBanned ? 0xFF0000 : (data.isMaster ? 0xFFD700 : 0x00AE86));

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`gui_ban_${target.id}`).setLabel(data.isBanned ? '🔓 BAN解除' : '🚫 BANする').setStyle(data.isBanned ? ButtonStyle.Success : ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`gui_master_${target.id}`).setLabel(data.isMaster ? '🎖️ 権限剥奪' : '👑 権限付与').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`gui_delete_${target.id}`).setLabel('🗑️ データ削除').setStyle(ButtonStyle.Secondary)
                );

                return message.reply({ embeds: [embed], components: [row] });
            } catch (e) {
                return message.reply("❌ ユーザーが見つかりません。IDが正しいか確認してください。");
            }
        }
    }
});

// --- 🔘 ボタン & スラッシュコマンド処理 ---
client.on('interactionCreate', async i => {
    // ボタン処理
    if (i.isButton() && i.customId.startsWith('gui_')) {
        if (i.user.id !== MASTER_ID) return i.reply({ content: "❌ 権限がありません。", ephemeral: true });
        const [_, type, targetId] = i.customId.split('_');
        if (!db.users[targetId]) db.users[targetId] = { history: {} };

        let actionLog = "";
        if (type === 'ban') {
            db.users[targetId].isBanned = !db.users[targetId].isBanned;
            actionLog = `BAN: **${db.users[targetId].isBanned ? 'ON' : 'OFF'}**`;
        } else if (type === 'master') {
            db.users[targetId].isMaster = !db.users[targetId].isMaster;
            actionLog = `権限: **${db.users[targetId].isMaster ? 'ON' : 'OFF'}**`;
        } else if (type === 'delete') {
            delete db.users[targetId];
            actionLog = `**全データ削除**`;
        }
        save();
        await i.update({ content: `✅ <@${targetId}> に対し実行: ${actionLog}`, embeds: [], components: [] });
        await sendLog(`🛠️ **GUI Admin Action**\n実行者: <@${i.user.id}>\n対象: <@${targetId}>\n内容: ${actionLog}`);
        return;
    }

    // スラッシュコマンド処理
    if (!i.isChatInputCommand()) return;
    if (db.users[i.user.id]?.isBanned) return i.reply({ content: "❌ あなたはボットの使用を禁止されています。", ephemeral: true });

    const cmd = client.commands.get(i.commandName);
    if (!cmd) return;

    // --- 📝 フルコマンドログ作成 ---
    const getOpts = (options) => {
        return options.map(o => {
            if (o.type === 1) return `${o.name} ${getOpts(o.options || [])}`; // Subcommand
            return `${o.name}:${o.value}`;
        }).join(' ');
    };
    const fullCommand = `/${i.commandName} ${getOpts(i.options.data)}`.trim();
    await sendLog(`📝 **Command Log**\n実行者: \`${i.user.tag}\` (ID: ${i.user.id})\nコマンド: \`${fullCommand}\``);

    try {
        await cmd.execute(i);
    } catch (error) {
        console.error(error);
        if (!i.replied && !i.deferred) await i.reply({ content: 'エラー。', ephemeral: true });
    }
});

process.on('uncaughtException', async (err) => {
    console.error('致命的なエラー:', err);
    await sendLog(`🔥 **[FATAL ERROR] 未処理の例外**\n\`\`\`js\n${err.stack || err}\n\`\`\``);
    // 致命的な場合はプロセスを落とすか検討が必要だけど、ひとまず通知
});

// 未処理のプロミス拒否 (Async)
process.on('unhandledRejection', async (reason, promise) => {
    console.error('未処理の拒否:', reason);
    await sendLog(`⚠️ **[UNHANDLED REJECTION] 非同期エラー**\n\`\`\`js\n${reason.stack || reason}\n\`\`\``);
});

// Discord.js Clientのエラー
client.on('error', async (error) => {
    console.error('Discordクライアントエラー:', error);
    await sendLog(`📡 **[CLIENT ERROR]**\n\`\`\`js\n${error.stack || error}\n\`\`\``);
});

client.login(process.env.TOKEN);