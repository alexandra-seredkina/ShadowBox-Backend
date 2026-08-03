FROM alpine:3.24

RUN apk add --no-cache nginx nginx-mod-http-headers-more

COPY nginx.conf /etc/nginx/nginx.conf
COPY snippets/ /etc/nginx/snippets/

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
