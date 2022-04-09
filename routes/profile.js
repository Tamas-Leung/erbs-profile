const { Router } = require("express");
const { pool } = require("../db");
const { bser_api_key } = require("../secrets/bser_api_key");
const axios = require("axios");

const router = Router();

const BASE_URL = "https://open-api.bser.io";

router.get("/:nickname/", async (request, response, nextFun) => {
    try {
        const { nickname } = request.params;

        let user = await getUserByNickname(nickname, nextFun);
        console.log(user);
        if (!user) {
            console.log("Getting User Data");
            const { data: userData } = await axios.get(
                `${BASE_URL}/v1/user/nickname?query=${nickname}`,
                {
                    headers: { "x-api-key": bser_api_key },
                }
            );

            if (userData.code == 404) {
                response.json({
                    does_not_exist: true,
                });
                return;
            }
            user = {
                userNum: userData.user.userNum,
                nickname: nickname,
                game_count: 0,
                killers: [],
                start_date: "",
                end_date: "",
                update_date: "",
                character: 0,
            };
        }

        response.status(200).json(user);
    } catch (err) {
        console.log("GET /:nickname Failed", err);
        nextFun("Failed to get user data");
    }
});

router.get("/:nickname/update", async (request, response, nextFun) => {
    const { nickname } = request.params;
    try {
        if (nickname) {
            // Always Update
            // const user = await getUser(nickname, nextFun);

            console.log("Getting User Data");
            const { data: userData } = await axios.get(
                `${BASE_URL}/v1/user/nickname?query=${nickname}`,
                {
                    headers: { "x-api-key": bser_api_key },
                }
            );

            if (userData.code == 404) {
                response.json({
                    does_not_exist: true,
                });
                return;
            }

            let userNum = userData.user.userNum;

            console.log("Updating User Games");
            await updateUserGames(userNum, nextFun);

            console.log("Getting Games");
            const games = await getUserGames(userNum, nextFun);

            console.log("Getting Killer Count");
            const killerFrequency = await getKillerCount(games);

            console.log("Calculating Killers");
            const killers = await Promise.all(
                Object.entries(killerFrequency)
                    .sort(([, a], [, b]) => b - a)
                    .map(async (killer) => {
                        // const nickname = await getName(killer[0], nextFun);

                        return {
                            userNum: killer[0],
                            count: killer[1],
                        };
                    })
            );

            const currentDate = new Date().toISOString();

            let user = {
                killers: killers,
                game_count: games.length,
                update_date: currentDate,
                userNum: userNum,
            };

            user = { ...user, ...(await getShortUserDataById(userNum)) };

            if (games.length > 0) {
                user.end_date = games[0].startDtm;
                user.start_date = games[games.length - 1].startDtm;
            } else {
                user.start_date = "";
                user.end_date = "";
            }

            console.log("Updating User");
            updateUser(user, nextFun);

            response.json(user);

            return;
        }
    } catch (err) {
        console.log("GET /:nickname/Update Failed", err);
        nextFun("Update Failed, Please Try Again Later");
    }
});

router.get("/short/:userNum", async (request, response, nextFun) => {
    const { userNum } = request.params;
    try {
        const userStats = await getShortUserStats(userNum, nextFun);

        response.json(userStats);
        return;
    } catch (err) {
        console.log("GET /short/:userNum Failed", err);
        nextFun("Unable To find username");
    }
});

const getShortUserStats = async (userNum) => {
    try {
        const result = await pool.query(
            `SELECT * FROM users WHERE "userNum"=$1`,
            [userNum]
        );
        if (result.rows.length > 0) {
            if (!result.rows[0] || !result.rows[0].nickname) {
                console.log(result);
            }
            return result.rows[0];
        }

        const user = await getShortUserDataById(userNum);

        updateShortUser(user);

        return user;
    } catch (err) {
        console.log("getShortUserStats Error:", err);
        throw "INTERNAL SERVER ERROR";
    }
};

const getShortUserDataById = async (userNum) => {
    try {
        const { data: userStats } = await axios.get(
            `${BASE_URL}/v1/user/stats/${userNum}/0`,
            {
                headers: { "x-api-key": bser_api_key },
            }
        );

        if (userStats.code == 404) {
            return {
                userNum: userNum,
                nickname: "Unknown",
                character: 0,
            };
        }

        const nickname = userStats.userStats[0].nickname;

        const characterStats = userStats.userStats[0].characterStats;

        const user = {
            userNum: userNum,
            nickname: nickname,
            character:
                characterStats.length > 0 ? characterStats[0].characterCode : 0,
        };

        return user;
    } catch (err) {
        console.log("getShortUserDataById Error:", err);
        throw "INTERNAL SERVER ERROR";
    }
};

const updateUser = async (user) => {
    pool.query(
        `INSERT INTO users SELECT m.* FROM json_populate_record(NULL::users, $1) AS m
         ON CONFLICT ("userNum", "nickname") DO UPDATE SET ("userNum", "nickname", "character", "killers", "game_count", "update_date", "start_date", "end_date")=(SELECT m.* FROM json_populate_record(NULL::users, $1) as m)`,
        [JSON.stringify(user)]
    );
};

const updateShortUser = async (user) => {
    try {
        pool.query(
            `INSERT INTO users ("userNum", "nickname", "character")
            VALUES ($1, $2, $3)
            ON CONFLICT ("userNum", "nickname") DO UPDATE SET "character" = $3`,
            [user.userNum, user.nickname, user.character]
        );
    } catch (err) {
        console.log("updateShortUser Error:", err);
        throw "INTERNAL DATABASE ERROR";
    }
};

const updateUserGames = async (userNum) => {
    let next = undefined;
    try {
        let retries = 0;

        const fullCheck = true;

        do {
            let match_url = `${BASE_URL}/v1/user/games/${userNum}`;
            if (next) match_url += `?next=${next}`;

            const response = await axios.get(match_url, {
                headers: { "x-api-key": bser_api_key },
            });

            if (response.status != 200) {
                if (retries < 3) {
                    retries++;
                    console.log(
                        "updateUserGames",
                        match_url,
                        "Failed, Retry Attempt:",
                        retries
                    );
                    continue;
                } else {
                    retries = 0;
                    console.log(
                        "updateUserGames",
                        match_url,
                        "Failed, Too many Times"
                    );
                    break;
                }
            }

            retries = 0;

            const matchData = response.data;

            const result = await pool.query(
                `SELECT 1 FROM userGames WHERE "userNum"=$1 AND "gameId"=$2`,
                [
                    userNum,
                    matchData.userGames[matchData.userGames.length - 1].gameId,
                ]
            );

            if (!fullCheck && result.rows.length > 0) {
                next = null;
            } else {
                next = matchData.next;
            }

            for (const game of matchData.userGames) {
                pool.query(
                    `INSERT INTO userGames SELECT m.* FROM json_populate_record(NULL::userGames, $1) AS m ON CONFLICT DO NOTHING`,
                    [JSON.stringify(game)]
                );
            }
        } while (next || retries > 0);
    } catch (err) {
        console.log("updateUserGames Error:", err);
        throw "INTERNAL DATABASE ERROR";
    }
};

const getUserGames = async (userNum) => {
    try {
        const result = await pool.query(
            `SELECT "killerUserNum", "killerUserNum2", "killerUserNum3", "startDtm" FROM usergames WHERE "userNum"=$1 ORDER BY "startDtm" DESC`,
            [userNum]
        );
        return result.rows;
    } catch (err) {
        console.log("getUserGames Error:", err);
        throw "INTERNAL DATABASE ERROR";
    }
};

const getUserByNickname = async (nickname) => {
    try {
        const result = await pool.query(
            `SELECT * FROM users WHERE UPPER("nickname")=UPPER($1)`,
            [nickname]
        );

        return result.rows.length ? result.rows[0] : null;
    } catch (err) {
        console.log("getUserByNickname Error:", err);
        throw "INTERNAL DATABASE ERROR";
    }
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
