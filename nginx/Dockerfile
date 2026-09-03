FROM alpine:3.24

RUN apk add --no-cache nginx nginx-mod-http-headers-more

COPY nginx.conf /etc/nginx/nginx.conf
COPY snippets/ /etc/nginx/snippets/

EXPOSE 80 443

# nosemgrep: missing-user -- the master process needs root for ports 80/443, workers run as nginx
CMD ["nginx", "-g", "daemon off;"]
