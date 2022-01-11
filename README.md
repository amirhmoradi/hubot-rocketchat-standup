# Hubot Rocketchat Standup Bot

This bot adds a standup functionality to any rocketchat chat room. Stand ups are initiate and
members are pinged in direct messages to avoid spamming the channel. The
result is posted back to the stand up room channel

## Using the Bot

This bot adds up to 1 standup per chat room. If you want to use it with a private room you will
need to add the bot user to the room.

### Create a StandUp

In the room you want to run stand up from

```
<bot_name_or_alias> show
```

This will show you the details of the current stanup in this room. If no one has joined the stand up
and it has not been scheduled it will look something like this

```
Current Standup Settings

Members:

Currently not scheduled
```

#### Adding Members

To join the stanup, each user must run the following in the room

```
<bot_name_or_alias> join
```

They should see a reply like the following

```
Added USERNAME to the list of standup members
```

After each member joins they should open a conversation with the bot and send a private message to
ensure the channel is available for the bot to ping the user later

You can see the list of members joined by running the `bot show` command

#### Scheduling the Reminder

Stand up can be initiated manually from the room it is set in with

```
<bot_name_or_alias> init
```

but it can also be scheduled to automate this process

```
<bot_name_or_alias> sched
```

This will ask the user for days of the week and a time to run at. It will use
these to set the cron-job reminder

## Install Instructions

Add `hubot-rocketchat-standup` to your `EXTERNAL_SCRIPTS` variable or `external-scripts.json` file based on your hubot configuration.

You should also have the env variable `RESPOND_TO_DM=true`

```
<bot_name_or_alias> help
```

Which will show you the available commands
