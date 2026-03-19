## Server Setup

### Keys

- **Tesla fleet key** (`/etc/ssl/private.pem`): generated once with `tesla-keygen`, registered with Tesla developer portal
- **TLS cert** (`/etc/ssl/cloudflare-cert.pem`): Cloudflare Origin Certificate (15-year validity, no renewal needed)
- **TLS key** (`/etc/ssl/cloudflare-key.pem`): Cloudflare Origin Certificate private key

To generate Tesla fleet key:
```
docker run --rm -v /etc/ssl:/keys tesla/vehicle-command:latest --entrypoint tesla-keygen -- -key-file /keys/private.pem create > /etc/ssl/public.pem
```

### Run

```
docker run -d -v /etc/ssl:/keys -e TESLA_KEY_FILE=/keys/private.pem -e TESLA_HTTP_PROXY_TLS_CERT=/keys/cloudflare-cert.pem -e TESLA_HTTP_PROXY_TLS_KEY=/keys/cloudflare-key.pem --rm -p 32772:443/tcp tesla/vehicle-command:latest -host 0.0.0.0
```

### Stop & restart

```
docker stop $(docker ps -q)
```

### Nginx

Nginx terminates public TLS (Cloudflare orange cloud). Proxies to container over HTTPS on localhost:

```nginx
location / {
    proxy_pass https://127.0.0.1:32772/;
}
```

Cloudflare SSL mode: **Full (Strict)** via Configuration Rule for `tesla.activebridge.org` only.

### Notes

- Uses official `tesla/vehicle-command:latest` image (replaces custom `ediff/tesla-proxy`)
- No certbot needed — Cloudflare Origin Cert handles TLS, never expires in practice
- `private.pem` is the Tesla fleet key, unrelated to TLS certs
- `-host 0.0.0.0` required so the proxy binds to all interfaces inside the container
