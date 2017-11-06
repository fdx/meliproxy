#!/bin/bash

./build.sh

docker run -e MONGODB_HOST=`docker-machine ip default` -v "$PWD/../runtime/logs":/logs/logs meliproxy-logs
exit $?
