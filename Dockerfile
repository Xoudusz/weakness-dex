FROM nginx:alpine
COPY . /usr/share/nginx/html
COPY docker/40-impressum.sh /docker-entrypoint.d/40-impressum.sh
RUN chmod +x /docker-entrypoint.d/40-impressum.sh && rm -rf /usr/share/nginx/html/docker
