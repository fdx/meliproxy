FROM golang:1.8

COPY ./ratelimit /usr/src/ratelimit

WORKDIR /usr/src/ratelimit

RUN make bootstrap

RUN mkdir -p /go/src/github.com/lyft

RUN cp -Rf . /go/src/github.com/lyft/ratelimit

RUN mkdir /go/src/github.com/lyft/ratelimit/bin

RUN make compile

RUN cp /go/src/github.com/lyft/ratelimit/bin/ratelimit* /bin

COPY ./runtime-data-ratelimit-config /runtime/data/ratelimit/config

CMD /bin/ratelimit
