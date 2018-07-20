const DiscordJS = require('discord.js');
const util = require('util');
const fs = require('fs');
const Crons = require('../v2/idle-rpg/Crons');
const Game = require('../v2/idle-rpg/Game');
const Helper = require('../utils/Helper');
const Discord = require('./Base/Discord');
const Antispam = require('../bots/modules/Antispam');
const CommandParser = require('../bots/utils/CommandParser');
const enumHelper = require('../utils/enumHelper');
const { minimalTimer, maximumTimer, botLoginToken } = require('../../settings');

class DiscordBot {

  // TODO remove discord.js from constructor and change to utilize shards
  constructor() {
    this.bot = new DiscordJS.Client();
    this.discord = new Discord(this.bot);
    this.Helper = new Helper();
    this.Game = new Game(this.Helper);
    this.Crons = new Crons({ Discord: this });
    this.CommandParser = new CommandParser({
      Game: this.Game,
      Helper: this.Helper,
      Bot: this.bot
    });
    this.loadEventListeners();
    this.bot.login(botLoginToken);
    this.minTimer = (minimalTimer * 1000) * 60;
    this.maxTimer = (maximumTimer * 1000) * 60;
    this.tickInMinutes = 2;
  }

  loadEventListeners() {
    this.bot.on('error', err => console.log(err));
    this.bot.once('ready', () => {
      this.bot.user.setAvatar(fs.readFileSync('./idle-rpg/res/hal.jpg'));
      this.bot.user.setStatus('idle');
      this.discord.loadGuilds();
      this.loadHeartBeat();
      this.Crons.loadCrons();
    });
    this.bot.on('message', async (message) => {
      if (message.content.includes('(╯°□°）╯︵ ┻━┻') && message.guild && message.guild.name === 'Idle-RPG') {
        return message.reply('┬─┬ノ(ಠ_ಠノ)');
      }

      if (message.author.id === this.bot.user.id || message.channel.parent && message.channel.parent.name !== 'Idle-RPG') {
        return;
      }

      if (message.content.startsWith('!cs') || message.content.startsWith('!castspell')) {
        await Antispam.logAuthor(message.author.id);
        await Antispam.logMessage(message.author.id, message.content);
        const skip = await Antispam.checkMessageInterval(message);
        if (skip) {
          // infoLog.info(`Spam detected by ${message.author.username}.`);
          return;
        }
      }

      // if (process.env.VIRUS_TOTAL_APIKEY && message.attachments && message.attachments.size > 0) {
      //   const { url } = message.attachments.array()[0];

      //   return VirusTotal.scanUrl(url)
      //     .then(VirusTotal.retrieveReport)
      //     .then((reportResults) => {
      //       if (reportResults.positives > 0) {
      //         message.delete();
      //         message.reply('This attachment has been flagged, if you believe this was a false-positive please contact one of the Admins.');
      //       }
      //     });
      // }

      if (message.content.startsWith('!')) {
        return this.CommandParser.parseUserCommand(message);
      }
    });
    this.bot.on('guildCreate', (guild) => {
      this.discord.manageGuildChannels(guild);
    });
  }

  loadHeartBeat() {
    const interval = process.env.NODE_ENV.includes('production') ? this.tickInMinutes : 1;
    let onlinePlayers = [];
    setInterval(() => {
      this.processDetails();
      this.bot.guilds.forEach((guild) => {
        let guildMinTimer = this.minTimer;
        let guildMaxTimer = this.maxTimer;
        const guildOnlineMembers = this.discord.getOnlinePlayers(guild);
        const guildOfflineMembers = this.discord.getOfflinePlayers(guild);
        const membersToAdd = guildOnlineMembers.filter(member => onlinePlayers.findIndex(onlineMember => member.discordId === onlineMember.discordId) < 0);
        onlinePlayers.push(...membersToAdd);
        onlinePlayers = onlinePlayers.filter(member => guildOfflineMembers.findIndex(offlineMember => member.discordId === offlineMember.discordId) < 0);
        if (guildOnlineMembers.length >= 50) {
          guildMinTimer = ((Number(minimalTimer) + (Math.floor(guildOnlineMembers.length / 50))) * 1000) * 60;
          guildMaxTimer = ((Number(maximumTimer) + (Math.floor(guildOnlineMembers.length / 50))) * 1000) * 60;
        }
        onlinePlayers.filter(member => member.guildId === guild.id).forEach((player) => {
          if (!player.timer) {
            const playerTimer = this.Helper.randomBetween(guildMinTimer, guildMaxTimer);
            player.timer = setTimeout(async () => {
              const eventResult = await this.Game.activateEvent(player, guildOnlineMembers);
              delete player.timer;
              return this.discord.sendMessage(guild, eventResult);
            }, playerTimer);
          }
        });
      });
      this.bot.user.setActivity(`${onlinePlayers.length} idlers in ${this.bot.guilds.size} guilds`);
    }, 60000 * interval);
  }

  processDetails() {
    let memoryUsage = util.inspect(process.memoryUsage());
    memoryUsage = JSON.parse(memoryUsage.replace('rss', '"rss"').replace('heapTotal', '"heapTotal"').replace('heapUsed', '"heapUsed"').replace('external', '"external"'));

    console.log('------------');
    console.log(`\n\nHeap Usage:\n  RSS: ${(memoryUsage.rss / 1048576).toFixed(2)}MB\n  HeapTotal: ${(memoryUsage.heapTotal / 1048576).toFixed(2)}MB\n  HeapUsed: ${(memoryUsage.heapUsed / 1048576).toFixed(2)}MB`);
    console.log(`Current Up Time: ${this.Helper.secondsToTimeFormat(Math.floor(process.uptime()))}\n\n`);
    console.log('------------');
  }

  // CRONS
  powerHourBegin() {
    this.bot.guilds.forEach((guild) => {
      guild.channels.find(channel => channel.name === 'actions' && channel.type === 'text' && channel.parent.name === 'Idle-RPG')
        .send(this.Helper.setImportantMessage('Dark clouds are gathering in the sky. Something is about to happen...'));
    });
    setTimeout(() => {
      this.bot.guilds.forEach((guild) => {
        guild.channels.find(channel => channel.name === 'actions' && channel.type === 'text' && channel.parent.name === 'Idle-RPG')
          .send(this.Helper.setImportantMessage('You suddenly feel energy building up within the sky, the clouds get darker, you hear monsters screeching nearby! Power Hour has begun!'));
      });
      this.Game.setMultiplier(this.Game.getMultiplier() + 1);
    }, 1800000); // 30 minutes

    setTimeout(() => {
      this.bot.guilds.forEach((guild) => {
        guild.channels.find(channel => channel.name === 'actions' && channel.type === 'text' && channel.parent.name === 'Idle-RPG')
          .send(this.Helper.setImportantMessage('The clouds are disappearing, soothing wind brushes upon your face. Power Hour has ended!'));
      });
      this.Game.setMultiplier(this.Game.getMultiplier() - 1 <= 0 ? 1 : this.Game.getMultiplier() - 1);
    }, 5400000); // 1hr 30 minutes
  }

  // TODO convert to async/await
  dailyLottery() {
    if (!process.env.NODE_ENV.includes('production')) {
      return;
    }

    return this.Game.dbClass().loadLotteryPlayers()
      .then((lotteryPlayers) => {
        if (!lotteryPlayers.length) {
          return;
        }
        const randomWinner = this.Helper.randomBetween(0, lotteryPlayers.length - 1);
        const winner = lotteryPlayers[randomWinner];

        return this.Game.dbClass().loadGame()
          .then((updatedConfig) => {
            const eventMsg = this.Helper.setImportantMessage(`Out of ${lotteryPlayers.length} contestants, ${winner.name} has won the daily lottery of ${updatedConfig.dailyLottery.prizePool} gold!`);
            const eventLog = `Congratulations! Out of ${lotteryPlayers.length} contestants, you just won ${updatedConfig.dailyLottery.prizePool} gold from the daily lottery!`;
            winner.gold.current += updatedConfig.dailyLottery.prizePool;
            winner.gold.total += updatedConfig.dailyLottery.prizePool;
            winner.gold.dailyLottery += updatedConfig.dailyLottery.prizePool;

            lotteryPlayers.forEach((player) => {
              const discordUser = this.bot.guilds.forEach(guild => guild.members.find(member => member.id === player.discordId));
              if (player.discordId !== winner.discordId && discordUser) {
                discordUser.send(`Thank you for participating in the lottery! Unfortunately ${winner.name} has won the prize of ${updatedConfig.dailyLottery.prizePool} out of ${lotteryPlayers.length} people.`);
              } else if (discordUser) {
                discordUser.send(`Thank you for participating in the lottery! You have won the prize of ${updatedConfig.dailyLottery.prizePool} out of ${lotteryPlayers.length} people.`);
              }
            });

            updatedConfig.dailyLottery.prizePool = this.Helper.randomBetween(1500, 10000);
            this.config = updatedConfig;
            this.bot.guilds.forEach((guild) => {
              guild.channels.find(channel => channel.name === 'actions' && channel.type === 'text' && channel.parent.name === 'Idle-RPG').send(eventMsg);
            });

            return Promise.all([
              this.Game.dbClass().updateGame(updatedConfig),
              this.Helper.logEvent(winner, this.Game.dbClass(), eventLog, enumHelper.logTypes.action),
              this.Game.dbClass().savePlayer(winner),
              this.Game.dbClass().removeLotteryPlayers()
            ])
              .catch(err => errorLog.error(err));
          });
      })
      .catch(err => errorLog.error(err));
  }

  updateLeaderboards() {
    const types = enumHelper.leaderboardStats;
    types.forEach((type, index) => this.Game.dbClass().loadTop10(type)
      .then(top10 => `${top10.filter(player => Object.keys(type)[0].includes('.') ? player[Object.keys(type)[0].split('.')[0]][Object.keys(type)[0].split('.')[1]] : player[Object.keys(type)[0]] > 0)
        .sort((player1, player2) => {
          if (Object.keys(type)[0] === 'level') {
            return player2.experience.current - player1.experience.current && player2.level - player1.level;
          }

          if (Object.keys(type)[0].includes('.')) {
            const keys = Object.keys(type)[0].split('.');
            return player2[keys[0]][keys[1]] - player1[keys[0]][keys[1]];
          }

          return player2[Object.keys(type)[0]] - player1[Object.keys(type)[0]];
        })
        .map((player, rank) => `Rank ${rank + 1}: ${player.name} - ${Object.keys(type)[0].includes('.') ? `${Object.keys(type)[0].split('.')[0]}: ${player[Object.keys(type)[0].split('.')[0]][Object.keys(type)[0].split('.')[1]]}` : `${Object.keys(type)[0].replace('currentBounty', 'Bounty')}: ${player[Object.keys(type)[0]]}`}`)
        .join('\n')}`)
      .then(async (rankString) => {
        return this.bot.guilds.forEach(async (guild) => {
          const leaderboardChannel = guild.channels.find(channel => channel.name === 'leaderboards' && channel.type === 'text' && channel.parent.name === 'Idle-RPG');
          const msgCount = await leaderboardChannel.fetchMessages({ limit: 10 });
          const subjectTitle = this.Helper.formatLeaderboards(Object.keys(type)[0]);
          const msg = `\`\`\`Top 10 ${subjectTitle}:
${rankString}\`\`\``;

          if (msgCount.size < types.length) {
            // Create message
            return leaderboardChannel.send(msg);
          }

          return !msg.includes(msgCount.array()[index].toString())
            ? msgCount.array()[index].edit(msg)
            : '';
        });
      }));
  }

}
module.exports = new DiscordBot();