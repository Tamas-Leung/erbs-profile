const { Router } = require("express");
const { pool, userGamesColumns } = require("../db");
const { bser_api_key } = require("../secrets/bser_api_key");
const axios = require("axios");
const res = require("express/lib/response");

const router = Router();

const BASE_URL = "https://open-api.bser.io";

router.get("/:username/", async (request, response, nextFun) => {
    const { username } = request.params;

    // await getNickname(username, nextFun);
    if (username) {
        console.log("Getting Player Data");
        const { data: playerData } = await axios.get(
            `${BASE_URL}/v1/user/nickname?query=${username}`,
            {
                headers: { "x-api-key": bser_api_key },
            }
        );

        if (playerData.code == 404) {
            response.json({
                does_not_exist: true,
            });
            return;
        }

        const playerId = playerData.user.userNum;

        const killerResponse = await getRivals(playerId, nextFun);

        if (killerResponse) response.status(200).json(killerResponse);
        else response.status(200).json({});
    }
});

router.get("/:username/update", async (request, response, nextFun) => {
    const { username } = request.params;

    // await getNickname(username, nextFun);
    if (username) {
        console.log("Getting Player Data");
        const { data: playerData } = await axios.get(
            `${BASE_URL}/v1/user/nickname?query=${username}`,
            {
                headers: { "x-api-key": bser_api_key },
            }
        );

        if (playerData.code == 404) {
            response.json({
                does_not_exist: true,
            });
            return;
        }

        console.log("Updating User");
        await updateUser(playerData.user, nextFun);

        const playerId = playerData.user.userNum;

        // await updatePlayer(playerId, nextFun);

        console.log("Getting Games");
        const games = await getPlayerGames(playerId, nextFun);

        console.log("Getting Killer Count");
        const killerFrequency = await getKillerCount(games);

        console.log("Calculating Killers");
        const killers = await Promise.all(
            Object.entries(killerFrequency)
                .sort(([, a], [, b]) => b - a)
                .map(async (killer) => {
                    const nickname = await getName(killer[0], nextFun);

                    return {
                        name: nickname,
                        count: killer[1],
                    };
                })
        );

        const currentDate = new Date().toISOString();

        const killerResponse = {
            killers: killers,
            game_count: games.length,
            update_date: currentDate,
            userNum: playerId,
        };

        if (games.length > 0) {
            killerResponse.start_date = games[0].startDtm;
            killerResponse.end_date = games[games.length - 1].startDtm;
        } else {
            killerResponse.start_date = "";
            killerResponse.end_date = "";
        }

        console.log("Updating Rivals");
        updateRivals(killerResponse, nextFun);

        response.json(killerResponse);

        return;
    }
});

const getName = async (playerId, nextFun) => {
    try {
        const result = await pool.query(
            `SELECT nickname FROM users WHERE "userNum"=$1`,
            [playerId]
        );
        if (result.rows.length > 0) {
            if (!result.rows[0] || !result.rows[0].nickname) {
                console.log(result);
            }
            return result.rows[0].nickname;
        }

        const player = await updatePlayerNameById(playerId, nextFun);

        return player.nickname;
    } catch (err) {
        if (err) return nextFun(err);
    }
};

const updatePlayerNameById = async (playerId, nextFun) => {
    const { data: userStats } = await axios.get(
        `${BASE_URL}/v1/user/stats/${playerId}/0`,
        {
            headers: { "x-api-key": bser_api_key },
        }
    );

    const nickname = userStats.userStats[0].nickname;

    const user = {
        userNum: playerId,
        nickname: nickname,
    };

    updateUser(user, nextFun);
    return user;
};

const updateIdByPlayerName = async (playerName, nextFun) => {};

const updateUser = async (user, nextFun) => {
    pool.query(
        `INSERT INTO users SELECT m.* FROM json_populate_record(NULL::users, $1) AS m
         ON CONFLICT ("userNum", "nickname") DO UPDATE SET ("userNum", "nickname")=($2,$3)`,
        [JSON.stringify(user), user.userNum, user.nickname],
        (err, res) => {
            if (err) return nextFun(err);
        }
    );
};

const updateRivals = async (rivals, nextFun) => {
    pool.query(
        `INSERT INTO rivals SELECT m.* FROM json_populate_record(NULL::rivals, $1) AS m 
         ON CONFLICT ("userNum") DO UPDATE SET ("userNum", "killers", "game_count", "update_date", "start_date", "end_date")=((SELECT m.* FROM json_populate_record(NULL::rivals, $1) as m))
        `,
        [JSON.stringify(rivals)],
        (err, res) => {
            if (err) return nextFun(err);
        }
    );
};

const updatePlayer = async (playerId, nextFun) => {
    let next = undefined;

    do {
        let match_url = `${BASE_URL}/v1/user/games/${playerId}`;
        if (next) match_url += `?next=${next}`;

        const { data: matchData } = await axios.get(match_url, {
            headers: { "x-api-key": bser_api_key },
        });
        for (const game of matchData.userGames) {
            pool.query(
                `INSERT INTO userGames SELECT m.* FROM json_populate_record(NULL::userGames, $1) AS m ON CONFLICT DO NOTHING`,
                [JSON.stringify(game)],
                (err, res) => {
                    if (err) return nextFun(err);
                }
            );
        }

        next = matchData.next;
    } while (next);
};

const getPlayerGames = async (playerId, nextFun) => {
    try {
        const result = await pool.query(
            `SELECT "killerUserNum", "killerUserNum2", "killerUserNum3", "startDtm" FROM usergames WHERE "userNum"=$1 ORDER BY "startDtm" DESC`,
            [playerId]
        );
        return result.rows;
    } catch (err) {
        if (err) return nextFun(err);
    }
};

const getRivals = async (playerId, nextFun) => {
    try {
        const result = await pool.query(
            `SELECT * FROM rivals WHERE "userNum"=$1`,
            [playerId]
        );
        return result.rows[0];
    } catch (err) {}
};

const getKillerCount = async (games) => {
    return (frequencyMap = games.reduce((frequency, game) => {
        if (game.killerUserNum != 0)
            frequency[game.killerUserNum] =
                (frequency[game.killerUserNum] || 0) + 1;
        if (game.killerUserNum2 != 0)
            frequency[game.killerUserNum2] =
                (frequency[game.killerUserNum2] || 0) + 1;
        if (game.killerUserNum3 != 0)
            frequency[game.killerUserNum3] =
                (frequency[game.killerUserNum3] || 0) + 1;

        return frequency;
    }, {}));
};

module.exports = router;
