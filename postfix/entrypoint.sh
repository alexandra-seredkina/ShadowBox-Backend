#!/bin/sh
# The mail domain and the delivery service come from the environment, like
# everywhere else; the rest of the configuration is in main.cf.
set -eu

: "${MAIL_DOMAIN:?set MAIL_DOMAIN}"
: "${LMTP_ADDRESS:?set LMTP_ADDRESS, e.g. delivery:2424}"

postconf -e \
  "myhostname = mx.${MAIL_DOMAIN}" \
  "relay_domains = ${MAIL_DOMAIN}" \
  "transport_maps = inline:{ ${MAIL_DOMAIN}=lmtp:inet:${LMTP_ADDRESS} }"

# The queue is a tmpfs that starts empty: recreate its directories.
postfix set-permissions create-missing >/dev/null
postfix check
exec postfix start-fg
