const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('コマンドの使い方を表示')
        .setNameLocalization('ja', 'help')
        .setDescriptionLocalization('ja', 'コマンドの使い方を表示')
        .addStringOption(o => 
            o.setName('command')
                .setDescription('詳細を知りたいコマンド名')
                .addChoices(
                    { name: 'res (プレイヤー詳細)', value: 'res' },
                    { name: 'pt (ポイント確認/操作)', value: 'pt' },
                    { name: 'list (プレイヤー一覧)', value: 'list' }
                )
        ),

    async execute(interaction) {
        const cmdName = interaction.options.getString('command');

        // --- 📋 コマンド説明データ ---
        const helpData = {
            res: {
                title: '🔍 /res コマンド',
                desc: 'EarthMCのプレイヤー情報を表示します。',
                usage: '`/res [target]`',
                fields: [
                    { name: '引数: target', value: '空欄なら自分、@メンションならその人、MCIDならそのプレイヤーを表示。' },
                    { name: '機能', value: 'オンライン状況、所属（Mapリンク付き）、権限設定、そして**35日間のアクティビティ**が表示されます。' },
                    { name: 'アクティビティの見方', value: ':black_large_square:: 0分(EatrhMCで遊びなさい)\n:red_square:: ~30分(もうちょっと、遊ぼう?)\n:orange_square:: ~1時間(丁度いいかな?)\n:yellow_square:: ~2時間(余裕があるね)\n:sparkle:: ~3時間(わーお)\n:eight_spoked_asterisk:: ~5時間(休んだら?)\n:sos:: ~8時間(廃人?)\n:white_check_mark:: 8時間以上(?)' }
                ]
            },
            pt: {
                title: '🏆 /pt コマンド',
                desc: 'ポイントの確認や管理を行います。',
                usage: '`/pt list` または `/pt set [user] [amount]`',
                fields: [
                    { name: 'list', value: 'サーバー内のポイントランキングを表示。ボタンでページ送り可能です。' },
                    { name: 'set (管理者用)', value: '特定のユーザーのポイントを増減させます。' }
                ]
            },
            list: {
                title: '👥 /list コマンド',
                desc: 'DiscordとMCIDを連携させている人たちの一覧を表示します。',
                usage: '`/list`',
                fields: [
                    { name: '機能', value: '誰がどのMCIDで登録しているかを確認できます。10人ずつページで見ることが可能です。' }
                ]
            }
        };

        // 引数がない場合は全体メニューを表示
        if (!cmdName) {
            const embed = new EmbedBuilder()
                .setTitle('📚 ヘルプメニュー')
                .setDescription('詳細を知りたい場合は `/help [コマンド名]` と実行してください')
                .addFields(
                    { name: '/res', value: 'プレイヤーの詳細とアクティビティを表示', inline: true },
                    { name: '/pt', value: 'ポイントランキング・操作', inline: true },
                    { name: '/list', value: '連携済みユーザー一覧', inline: true }
                )
                .setColor(0x5865F2);
            return interaction.reply({ embeds: [embed] });
        }

        // 個別コマンドのヘルプを表示
        const info = helpData[cmdName];
        if (!info) return interaction.reply({ content: 'そのコマンドのヘルプは見つかりませんでした', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle(info.title)
            .setDescription(`${info.desc}\n\n**使い方:** ${info.usage}`)
            .addFields(info.fields)
            .setColor(0x00FF00)
            .setFooter({ text: '困ったときはPaln21にメンション付きでお知らせください' });

        return interaction.reply({ embeds: [embed] });
    }
};