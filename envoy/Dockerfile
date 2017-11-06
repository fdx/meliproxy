FROM lyft/envoy:latest

RUN apt-get update && apt-get -q install -y curl

## El build de debug no entra en Github por tamaño, asique dejo el original.
#RUN rm -f /usr/local/bin/envoy
#COPY ./envoy-debug /usr/local/bin/envoy

COPY ./envoy_start.sh /usr/local/bin/envoy_start.sh

COPY ./meli-proxy-aws.json /etc/meli-proxy.json

CMD /usr/local/bin/envoy_start.sh
