#!/bin/bash

# Hay que hacer esto para hacer llegar con variable de entorno la IP del host hacia el container de frontend (para los API calls).
cat docker-compose.src.yml | sed "s/__DOCKER_HOST_IP__/"`docker-machine ip`"/g" >docker-compose.yml
docker-compose up --build -d
exit $?
