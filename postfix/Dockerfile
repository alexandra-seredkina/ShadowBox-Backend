FROM alpine:3.24

RUN apk add --no-cache postfix

COPY --chmod=644 main.cf /etc/postfix/main.cf
COPY --chmod=755 entrypoint.sh /usr/local/bin/postfix-entrypoint

EXPOSE 25

# nosemgrep: missing-user -- the master process needs root to bind port 25, its daemons drop to postfix
ENTRYPOINT ["/usr/local/bin/postfix-entrypoint"]
