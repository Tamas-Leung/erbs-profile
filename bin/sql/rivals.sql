CREATE TABLE rivals(
    "userNum" int,
    "killers" json[],
    "game_count" int,
    "update_date" timestamp with time zone,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    PRIMARY KEY ("userNum")
)