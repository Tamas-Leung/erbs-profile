CREATE TABLE users(
    "userNum" int,
    "nickname" character varying(16),
    "character" smallint,
    "killers" json[],
    "game_count" int,
    "update_date" timestamp with time zone,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    PRIMARY KEY ("userNum", "nickname")
)