#!/bin/bash

DOCKER_CID=`cat /proc/1/cpuset 2>/dev/null | cut -c9-`
touch ../logs/logs/envoy.access.${DOCKER_CID}.log

rm -f /tmp/access.log
ln -s ../logs/logs/envoy.access.${DOCKER_CID}.log /tmp/access.log
ls -al /tmp/access.log

/usr/local/bin/envoy -c /etc/meli-proxy.json --service-cluster meli-proxy -l debug
exit $?
