#!/bin/bash

cd envoy
rm -f ./ci/bin/envoy
ENVOY_DOCKER_BUILD_DIR=/tmp/envoy-docker-build ./ci/run_envoy_docker.sh './ci/do_ci.sh bazel.debug.server_only'
mv -f ./ci/bin/envoy ../envoy-debug
cd -

exit 0
