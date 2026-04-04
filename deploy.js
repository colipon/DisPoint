const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'modules/commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// 各コマンドファイルの data (SlashCommandBuilder) を集める
for (const file of commandFiles) {
    const command = require(`./modules/commands/${file}`);
    if ('data' in command) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`⏳ ${commands.length} 個のコマンドを登録中...`);

        // 全てのサーバーに一括反映させる設定
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ ${data.length} 個のコマンドの登録に成功しました！`);
        console.log(`⚠️ 反映まで数分かかる場合や、Discordアプリの再起動が必要な場合があります。`);
    } catch (error) {
        console.error(error);
    }
})();