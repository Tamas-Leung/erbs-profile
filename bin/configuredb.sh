#!/bin/bash

database="erbsdb"

echo "Configuring database: $database"

dropdb -U node_user $database
createdb -U node_user $database

psql -U node_user erbsdb < ./bin/sql/userGames.sql
psql -U node_user erbsdb < ./bin/sql/users.sql
psql -U node_user erbsdb < ./bin/sql/rivals.sql

echo "$database configured"