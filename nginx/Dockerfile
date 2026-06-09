# Use official lightweight Alpine-based Nginx image
FROM nginx:1.25-alpine

# Install openssl to generate self-signed certificates for local TLS termination
RUN apk add --no-cache openssl

# Create directory to store certificates
RUN mkdir -p /etc/nginx/certs

# Generate self-signed SSL Certificate (valid for 365 days)
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/certs/server.key \
    -out /etc/nginx/certs/server.crt \
    -subj "/C=CN/ST=Beijing/L=Beijing/O=Yintong/OU=IT/CN=localhost"

# Copy Nginx configuration file
COPY nginx.conf /etc/nginx/nginx.conf

# Expose HTTP (80) and HTTPS (443) ports
EXPOSE 80 443

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
