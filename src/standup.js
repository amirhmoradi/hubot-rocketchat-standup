'use strict'

// Description:
//   Standup Bot for Rocket.Chat, with Hubot.
//   Compatible with hubot-mongodb-brain-evo to persist standup settings in MongoDB.
// 
// Dependencies:
//   https://github.com/lmarkus/hubot-conversation,
//   node-schedule
// 
// Configuration:
// ( VAR || VAR2 ... || default_value_if_not_set # More info)
//   STANDUP_TIMEOUT || 1800000 # 30min defaut, unit is in miliseconds.
// 
// Commands:
//   standup join - add your user to the standup in the current room
//   standup leave - remove your user from the standup in the current room
//   standup show - list the users registered for standup in this room
//   standup schedule - set the reminder for when to ping users to enter their standup information
//   standup cancel - removes the current standup reminder
//   standup init - manually initiate a standup (will ping standup members individually)`;
// 
// Notes:
//   The script uses node-schedule to manage standup cron jobs. It required the mongodb to persist standup data.
// 
// Author:
//   Amir Moradi <https://amirhmoradi.com>

module.exports = function (robot) {
    const Conversation = require('hubot-conversation');
    const schedule = require('node-schedule');
    const fs = require('fs');
    const path = require('path');
    const util = require('util');

    const STANDUP_TIMEOUT = 30 * 60 * 1000; // 30m standup timeout

    const newStandUp = () => {
        return {members: {}, schedule: null, time: null};
    };

    const generateStandUpKey = (msg) => {
        return `standup-${msg.envelope.user.roomID}`;
    };

    const setUserStandUp = (robot, roomId, userId, content, upsert=true) => {
        let standup = robot.brain.data.standups[`standup-${roomId}-${userId}`] || {};
        if (upsert) {
            standup = {...standup, ...content};
        } else {
            standup = content;
        }
        robot.brain.data.standups[`standup-${roomId}-${userId}`] = standup;
    };

    const getUserStandUp = (robot, roomId, userId) => {
        return robot.brain.data.standups[`standup-${roomId}-${userId}`];
    };

    const addUserToStandUp = (robot, roomId, userId, username) => {
        const standup = robot.brain.data.standups[`standup-${roomId}`] || newStandUp();
        standup.members[userId] = username;
        robot.brain.data.standups[`standup-${roomId}`] = standup;
    };

    const removeUserFromStandUp = (robot, roomId, userId) => {
        const standup = robot.brain.data.standups[`standup-${roomId}`] || newStandUp();
        delete standup.members[userId];
        robot.brain.data.standups[`standup-${roomId}`] = standup;
    };

    const getReplyText = (reply) => {
        return reply.message.text.replace(/^(H|h)ubot\s+/, '');
    };

    const isDirectReply = (msg, dmRoomId) => {
        return Boolean(msg.envelope.user.roomID === dmRoomId);
    };

    const postStandup = (robot, standUpRoomId, userId, username) => {
        const content = getUserStandUp(robot, standUpRoomId, userId);
        const reply = `#### Stand Up: ${username}
    **yday**
    ${content.yday}

    **today**
    ${content.today}

    **blockers**
    ${content.blockers}`;

        robot.send(
            {room: standUpRoomId, user: {id: userId, roomID: standUpRoomId}},
            reply
        );
    };

    const askStandupQuestions = async (robot, standUpRoomId, userId, username) => {
        const dmRoomId = await robot.adapter.driver.getDirectMessageRoomId(username);

        const questions = [
            {question: `@${username}, what did you do last day?`, key: 'yday'},
            {question: `@${username}, what will you do today?`, key: 'today'},
            {question: `@${username}, any blockers?`, key: 'blockers'}
        ];

        const fakeTarget = {room: dmRoomId, user: {roomID: dmRoomId, id: userId, name: username}};
        const fakeMessage = {
            message: fakeTarget,
            envelope: fakeTarget,
            reply: content => robot.send(fakeTarget, content)
        };
        robot.send(fakeTarget, '#### Collecting today\'s standup');
        //robot.adapter.sendDirect({ user: { name: username } }, '#### Collecting today\'s standup');
        const dialog = robot.switchBoard.startDialog(fakeMessage, STANDUP_TIMEOUT);
        const standup = robot.brain.data.standups[`standup-${standUpRoomId}`];


        const ask = (msg, questionIndex) => {
            if (questionIndex >= questions.length) {
                // all question have been asked, post the results
                postStandup(robot, standUpRoomId, userId, username);
                return;
            }
            const {question, key} = questions[questionIndex];

            msg.reply(question);
            dialog.addChoice(/.*/i, (resp) => {
                if (!isDirectReply(resp, dmRoomId)) {
                    console.error('\nuser sent non-direct message', resp.envelope.user.roomID, resp.envelope.user.name)
                    ask(msg, questionIndex);
                } else {
                    setUserStandUp(robot, standUpRoomId, userId, {[key]: getReplyText(resp)});
                    ask(fakeMessage, questionIndex + 1);
                }
            });
        };


        ask(fakeMessage, 0);
    };

    const cancelStandUp = (robot, roomId) => {
        const standup = robot.brain.data.standups[`standup-${roomId}`] || newStandUp();

        let scheduledJob = robot.brain.cronjobs[data.schedule] || false;

        if (scheduledJob) {
            scheduledJob.cancel();
            scheduledJob = null;
            standup.time = null;
        }
        robot.brain.data.standups[`standup-${roomId}`] = standup;
    };

    const pingStandUp = (robot, roomId) => () => {
        robot.adapter.send({room: roomId, user: {}}, 'Waiting for members to complete standup....');
        // get the members of the standup

        const standup = robot.brain.data.standups[`standup-${roomId}`];
        // ping each user to complete their stand up

        for (const memberId of Object.keys(standup.members || {})) {
            const username = standup.members[memberId]
            askStandupQuestions(robot, roomId, memberId, username);
        }
    };

    const setStandUpSchedule = (robot, roomId, cronstamp) => {
        const standup = robot.brain.data.standups[`standup-${roomId}`] || newStandUp();

        let scheduledJob = standup.schedule !== null ? robot.brain.cronjobs[standup.schedule] : false;

        if (scheduledJob) {
            scheduledJob.cancel();
            scheduledJob = null;
        }
        
        const jobSchedule = schedule.scheduleJob(cronstamp, pingStandUp(robot, roomId));
        standup.schedule = `standup-${roomId}`;
        robot.brain.cronjobs[standup.schedule] = jobSchedule;

        standup.time = cronstamp;
        robot.brain.data.standups[`standup-${roomId}`] = standup;
    };

    /**
     * Ask the User for Information to be able to set when standup should ping users
     */
    const scheduleStandUp = robot => (msg) => {
        const {roomID: roomId} = msg.envelope.user;
        const dialog = robot.switchBoard.startDialog(msg);

        msg.reply('What days of the week should this run for (MTWRFSD) (eq: Monday, Tuesday, Wednesday, thuRsday, Friday, Saturday, sunDay) ?');
        dialog.addChoice(/^[MTWRFSD]+$/i, (msg2) => {
            const {message: {text: weekdays}} = msg2;
            const crondays = [];
            for (const day of weekdays.toUpperCase().replace(/[\s,]+/g, '')) {
                const index = 'MTWRFSD'.indexOf(day) + 1;
                crondays.push(index);
                if (index < 1) {
                    return msg2.reply(`BAD INPUT (${day})`);
                }
            }
            msg2.reply('What time should this run at (HH:mm) (H:00-12, M: 00-60)?');
            dialog.addChoice(/^[01][0-9]:[0-5][0-9]$/i, (msg3) => {
                const {message: {text: time}} = msg3;
                const [hour, min] = time.split(':');
                let cronstamp = `0 ${min} ${hour} * * ${crondays.sort().join(',')}`;

                // set the standup in the key value store
                setStandUpSchedule(robot, roomId, cronstamp);

                // notify the user
                msg3.reply(`Standup scheduled at \`${cronstamp}\``);
            });
        });
    };


    /**
     * Save the current robot brain to a file
     */
    const deprecated_save = (data) => {
        data = data.standups;
        robot.logger.info("Save event caught by standup script.");

        const getCircularReplacer = () => {
            const seen = new WeakSet();
            return (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                return;
                }
                seen.add(value);
            }
            return value;
            };
        };

        robot.brain.data.standups = JSON.stringify(data, getCircularReplacer(),2);
    };
        //robot.brain.on('save', save)
        
    const initData = () => {
        robot.logger.info("Loading Standups");
        robot.brain.data.standups = robot.brain.data.standups || {};
        robot.brain.cronjobs = robot.brain.cronjobs || {};
        robot.brain.mergeData();
    };
    const brainLoaded = () => {
        runCrons();
    };
    const runCrons = () => {
        // restart the crons
        for (const [key, data] of Object.entries(robot.brain.data.standups || {})) {
            if (key.startsWith('standup-') && data.time) {
                const roomId = key.slice('standup-'.length);
                console.log(`scheduling standup ${key} at ${data.time}`);

                const jobSchedule = schedule.scheduleJob(data.time, pingStandUp(robot, roomId));

                data.schedule = `standup-${roomId}`;
                robot.brain.cronjobs[data.schedule] = jobSchedule;
                robot.logger.info("Standups Cron Set: " + data.schedule);
            }
        }
    };
    initData();
    
    robot.brain.on('loaded', brainLoaded);
    
    robot.switchBoard = new Conversation(robot,'user',function(msg){
        /* Do something with the incoming message (like checks, types...) */
        return true;
      });
    const robotUserId = robot.adapter.userId;

    robot.respond(/standup show/i, (msg) => {
        const {roomID} = msg.envelope.user;
        const standup = robot.brain.data.standups[`standup-${roomID}`] || newStandUp()
        let reply = '**Current Standup Settings**\n\nMembers:';
        for (const username of Object.values(standup.members || {})) {
            reply = `${reply}\n- ${username}`;
        }
        if (standup.time) {
            reply = `${reply}\n\nScheduled at \`${standup.time}\``;
        } else {
            reply = `${reply}\n\nCurrently not scheduled`;
        }
        msg.reply(reply);
    });

    robot.respond(/standup sched(ule)?/i, scheduleStandUp(robot));

    robot.respond(/standup start/i, (msg) => {
        // manually trigger a standup without scheduling
        const {roomID} = msg.envelope.user;
        const standup = robot.brain.data.standups[`standup-${roomID}`] || newStandUp();
    })

    robot.respond(/standup join/i, (msg) => {
        // add user to the standup for this room
        const {id: userId, roomID, name: username, roomType} = msg.envelope.user;

        addUserToStandUp(robot, roomID, userId, username);
        msg.reply(`Added ${username} to the list of standup members`);
    });

    robot.respond(/standup leave/i, (msg) => {
        // remove current user from this standup
        const {id: userId, roomID, name} = msg.envelope.user;
        removeUserFromStandUp(robot, roomID, userId);
        msg.reply(`Removed ${name} from the list of standup members`);
    });

    robot.respond(/standup cancel/i, (msg) => {
        const {id: userId, roomID} = msg.envelope.user;
        cancelStandUp(robot, roomID);
        msg.reply('Cancelled the current standup');
    });

    robot.respond(/standup get room id/i, (msg) => {
        const {id: userId, roomID} = msg.envelope.user;
        msg.reply(`The current room Id is ${roomID}`);
    });

    robot.respond(/standup (init|initiate)/i, (msg) => {
        pingStandUp(robot, msg.envelope.user.roomID)();
    });

}