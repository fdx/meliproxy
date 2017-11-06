#!/bin/bash

if [ -z "${MELI_PROXY_API_HOST}" ] ; then
    echo "The MELI_PROXY_API_HOST environment variable was not set"
    exit 3
else
    echo "MELI_PROXY_API_HOST=${MELI_PROXY_API_HOST}"
fi

if [ -d "./build" ] ; then
    BUILDPATH="./build"
elif [ -d "/app" ] ; then
    BUILDPATH="/app"
else
    echo "Invalid context"
    exit 1
fi
echo "BUILDPATH=${BUILDPATH}";

FINAL="${BUILDPATH}/index.html"
ORIG="${BUILDPATH}/index.html.orig"

FINAL_IS_TEMPLATE=`grep __MELI_PROXY_API_HOST__ "${FINAL}" | wc -l`
if [ "${FINAL_IS_TEMPLATE}" -eq 1 ] ; then
    echo "Copying index.html into index.html.orig (save backup for futures serves)"
    cp -f "${FINAL}" "${ORIG}"
elif [ ! -f "${ORIG}" ] ; then
    echo "Final is not template, and ORIG does not exists"
    exit 2
fi

cat "${ORIG}" | sed "s/__MELI_PROXY_API_HOST__/'${MELI_PROXY_API_HOST}'/g" >"${FINAL}"
echo "File generated ${FINAL}"

echo "Starting..."
serve -s "${BUILDPATH}"
exit $?
