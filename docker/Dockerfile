FROM alpine:3.20

LABEL org.opencontainers.image.title="video-encoder" \
      org.opencontainers.image.description="Media transcoding service stub"

# Build-time work (RUN) vs runtime behaviour (ENTRYPOINT/CMD)
RUN apk add --no-cache busybox-extras \
    && echo "Transcoder Engine Ready" > /etc/transcoder-banner \
    && mkdir -p /www

COPY www/ /www/
RUN chmod +x /www/cgi-bin/info

EXPOSE 80

# ENTRYPOINT fixes the core binary; CMD supplies overridable default args.
ENTRYPOINT ["/bin/sh", "-c", "cat /etc/transcoder-banner; exec httpd -f -p \"$0\" -h /www"]
CMD ["80"]
