FROM alpine:3.24

RUN apk add --no-cache nginx nginx-mod-http-headers-more

COPY nginx.conf /etc/nginx/nginx.conf
COPY snippets/ /etc/nginx/snippets/

EXPOSE 80 443

# nosemgrep: missing-user -- master-процессу нужен root для портов 80/443, воркеры работают от nginx
CMD ["nginx", "-g", "daemon off;"]
